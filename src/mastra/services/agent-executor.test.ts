import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { executeAgent, approveToolCall, declineToolCall } from './agent-executor';

// ============================================
// ヘルパー: モックエージェント生成
// ============================================

type StreamChunk = {
  type: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

/**
 * AsyncGenerator でストリームチャンクを yield するモックエージェントを作成
 * Mastra の agent.stream() は { fullStream: AsyncIterable } を返す
 */
function createMockAgent(options?: {
  streamChunks?: StreamChunk[];
  approveChunks?: StreamChunk[];
  declineChunks?: StreamChunk[];
}) {
  const makeStream = (chunks: StreamChunk[]) =>
    vi.fn().mockResolvedValue({
      fullStream: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    });

  return {
    stream: makeStream(options?.streamChunks ?? []),
    approveToolCall: makeStream(options?.approveChunks ?? []),
    declineToolCall: makeStream(options?.declineChunks ?? []),
  } as unknown as Agent;
}

// ============================================
// executeAgent
// ============================================

describe('executeAgent', () => {
  const context = { resourceId: 'U1234', threadId: 'C1234:1234.5678' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('テキストチャンクを結合して completed を返す', async () => {
    const agent = createMockAgent({
      streamChunks: [
        { type: 'text-delta', payload: { text: 'Hello ' } },
        { type: 'text-delta', payload: { text: 'world' } },
      ],
    });

    const result = await executeAgent(agent, 'hi', context);

    expect(result).toEqual({ type: 'completed', text: 'Hello world' });
  });

  it('テキストがない場合は "Done." を返す', async () => {
    const agent = createMockAgent({ streamChunks: [] });

    const result = await executeAgent(agent, 'hi', context);

    expect(result).toEqual({ type: 'completed', text: 'Done.' });
  });

  it('tool-call-approval チャンクで approval-required を返す', async () => {
    const agent = createMockAgent({
      streamChunks: [
        {
          type: 'tool-call-approval',
          runId: 'run-abc',
          payload: {
            toolCallId: 'tc-123',
            toolName: 'createEvent',
            args: { summary: 'Meeting' },
          },
        },
        // 承認後もストリームは続く（スナップショット保存のため全消費が必要）
        { type: 'finish', payload: {} },
      ],
    });

    const result = await executeAgent(agent, 'create event', context);

    expect(result).toEqual({
      type: 'approval-required',
      agentName: 'unified',
      runId: 'run-abc',
      toolCallId: 'tc-123',
      toolName: 'createEvent',
      args: { summary: 'Meeting' },
    });
  });

  it('agent.stream がエラーをスローした場合 error を返す', async () => {
    const agent = {
      stream: vi.fn().mockRejectedValue(new Error('API error')),
    } as unknown as Agent;

    const result = await executeAgent(agent, 'hi', context);

    expect(result).toEqual({
      type: 'error',
      error: expect.objectContaining({ message: 'API error' }),
    });
  });

  it('onStreamChunk コールバックがテキストチャンクごとに呼ばれる', async () => {
    const agent = createMockAgent({
      streamChunks: [
        { type: 'text-delta', payload: { text: 'A' } },
        { type: 'tool-call', payload: {} }, // テキスト以外はコールバックされない
        { type: 'text-delta', payload: { text: 'B' } },
      ],
    });

    const onChunk = vi.fn();
    await executeAgent(agent, 'hi', context, onChunk);

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'A');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'B');
  });

  it('memory コンテキストを agent.stream に渡す', async () => {
    const agent = createMockAgent({ streamChunks: [] });

    await executeAgent(agent, 'hello', context);

    expect(agent.stream).toHaveBeenCalledWith('hello', {
      memory: { resource: 'U1234', thread: 'C1234:1234.5678' },
    });
  });
});

// ============================================
// approveToolCall
// ============================================

describe('approveToolCall', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ストリームからテキストを収集して返す', async () => {
    const agent = createMockAgent({
      approveChunks: [
        { type: 'text-delta', payload: { text: 'Event created' } },
        { type: 'text-delta', payload: { text: ' successfully' } },
      ],
    });

    const result = await approveToolCall(agent, 'run-1', 'tc-1');

    expect(result).toBe('Event created successfully');
  });

  it('テキストがない場合はフォールバックメッセージを返す', async () => {
    const agent = createMockAgent({ approveChunks: [] });

    const result = await approveToolCall(agent, 'run-1', 'tc-1');

    expect(result).toBe('✅ Completed.');
  });

  it('"No snapshot found" エラーの場合セッション期限切れメッセージをスロー', async () => {
    const agent = {
      approveToolCall: vi.fn().mockRejectedValue(new Error('No snapshot found for run-1')),
    } as unknown as Agent;

    await expect(approveToolCall(agent, 'run-1', 'tc-1')).rejects.toThrow(
      'Session expired. Please retry your request.',
    );
  });

  it('その他のエラーはそのまま再スロー', async () => {
    const agent = {
      approveToolCall: vi.fn().mockRejectedValue(new Error('Unknown error')),
    } as unknown as Agent;

    await expect(approveToolCall(agent, 'run-1', 'tc-1')).rejects.toThrow('Unknown error');
  });

  it('onStreamChunk コールバックが呼ばれる', async () => {
    const agent = createMockAgent({
      approveChunks: [{ type: 'text-delta', payload: { text: 'Done' } }],
    });

    const onChunk = vi.fn();
    await approveToolCall(agent, 'run-1', 'tc-1', onChunk);

    expect(onChunk).toHaveBeenCalledWith('Done');
  });
});

// ============================================
// declineToolCall
// ============================================

describe('declineToolCall', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ストリームからテキストを収集して返す', async () => {
    const agent = createMockAgent({
      declineChunks: [{ type: 'text-delta', payload: { text: 'Understood, cancelled.' } }],
    });

    const result = await declineToolCall(agent, 'run-1', 'tc-1');

    expect(result).toBe('Understood, cancelled.');
  });

  it('テキストがない場合は "No response." を返す', async () => {
    const agent = createMockAgent({ declineChunks: [] });

    const result = await declineToolCall(agent, 'run-1', 'tc-1');

    expect(result).toBe('No response.');
  });

  it('"No snapshot found" エラーの場合セッション期限切れメッセージをスロー', async () => {
    const agent = {
      declineToolCall: vi.fn().mockRejectedValue(new Error('No snapshot found for run-1')),
    } as unknown as Agent;

    await expect(declineToolCall(agent, 'run-1', 'tc-1')).rejects.toThrow(
      'Session expired. Please retry your request.',
    );
  });
});
