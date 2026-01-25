import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Agent } from '@mastra/core/agent';
import { executeAgent, approveToolCall, declineToolCall } from './agent-executor';

// ============================================
// Mock Helpers for Agent Stream
// ============================================

type StreamChunk =
  | { type: 'text-delta'; payload: { text: string } }
  | {
      type: 'tool-call-approval';
      runId: string;
      payload: { toolCallId: string; toolName: string; args: Record<string, unknown> };
    };

/**
 * AsyncIterable を生成するヘルパー
 * LLMのストリーミングレスポンスをシミュレート
 */
async function* createMockStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Agent.stream() の戻り値をモック
 */
const createMockStreamOutput = (chunks: StreamChunk[]) => ({
  fullStream: createMockStream(chunks),
});

/**
 * モック Agent を生成
 */
const createMockAgent = (overrides?: Partial<Agent>): Agent => {
  return {
    stream: vi.fn(),
    approveToolCall: vi.fn(),
    declineToolCall: vi.fn(),
    ...overrides,
  } as unknown as Agent;
};

// ============================================
// Tests
// ============================================

describe('executeAgent', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('テキストレスポンスを正常にストリーミングして completed を返す', async () => {
    const mockAgent = createMockAgent({
      stream: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          { type: 'text-delta', payload: { text: 'Hello, ' } },
          { type: 'text-delta', payload: { text: 'world!' } },
        ]),
      ),
    });

    const result = await executeAgent(mockAgent, 'Say hello', {
      resourceId: 'user-123',
      threadId: 'thread-456',
    });

    expect(result).toEqual({
      type: 'completed',
      text: 'Hello, world!',
    });
  });

  it('onStreamChunk コールバックが各チャンクで呼ばれる', async () => {
    const mockAgent = createMockAgent({
      stream: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          { type: 'text-delta', payload: { text: 'Part 1' } },
          { type: 'text-delta', payload: { text: 'Part 2' } },
        ]),
      ),
    });
    const onStreamChunk = vi.fn().mockResolvedValue(undefined);

    await executeAgent(
      mockAgent,
      'Test query',
      { resourceId: 'user-123', threadId: 'thread-456' },
      onStreamChunk,
    );

    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(onStreamChunk).toHaveBeenNthCalledWith(1, 'Part 1');
    expect(onStreamChunk).toHaveBeenNthCalledWith(2, 'Part 2');
  });

  it('ツール承認が必要な場合は approval-required を返す', async () => {
    const mockAgent = createMockAgent({
      stream: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          { type: 'text-delta', payload: { text: 'Creating event...' } },
          {
            type: 'tool-call-approval',
            runId: 'run-abc',
            payload: {
              toolCallId: 'call-xyz',
              toolName: 'createEvent',
              args: { summary: 'Meeting', date: '2024-01-15' },
            },
          },
        ]),
      ),
    });

    const result = await executeAgent(mockAgent, 'Create a meeting', {
      resourceId: 'user-123',
      threadId: 'thread-456',
    });

    expect(result).toEqual({
      type: 'approval-required',
      agentName: 'unified',
      runId: 'run-abc',
      toolCallId: 'call-xyz',
      toolName: 'createEvent',
      args: { summary: 'Meeting', date: '2024-01-15' },
    });
  });

  it('空のレスポンスの場合は "Done." を返す', async () => {
    const mockAgent = createMockAgent({
      stream: vi.fn().mockResolvedValue(createMockStreamOutput([])),
    });

    const result = await executeAgent(mockAgent, 'Empty query', {
      resourceId: 'user-123',
      threadId: 'thread-456',
    });

    expect(result).toEqual({
      type: 'completed',
      text: 'Done.',
    });
  });

  it('Agent.stream に正しいメモリコンテキストが渡される', async () => {
    const mockStream = vi.fn().mockResolvedValue(createMockStreamOutput([]));
    const mockAgent = createMockAgent({ stream: mockStream });

    await executeAgent(mockAgent, 'Test', {
      resourceId: 'channel-C123',
      threadId: 'thread-T456',
    });

    expect(mockStream).toHaveBeenCalledWith('Test', {
      memory: {
        resource: 'channel-C123',
        thread: 'thread-T456',
      },
    });
  });

  it('エラー発生時は error 結果を返す', async () => {
    const mockError = new Error('LLM API failed');
    const mockAgent = createMockAgent({
      stream: vi.fn().mockRejectedValue(mockError),
    });

    const result = await executeAgent(mockAgent, 'Fail query', {
      resourceId: 'user-123',
      threadId: 'thread-456',
    });

    expect(result).toEqual({
      type: 'error',
      error: mockError,
    });
  });

  it('非 Error オブジェクトがスローされた場合も適切にハンドル', async () => {
    const mockAgent = createMockAgent({
      stream: vi.fn().mockRejectedValue('string error'),
    });

    const result = await executeAgent(mockAgent, 'Fail query', {
      resourceId: 'user-123',
      threadId: 'thread-456',
    });

    expect(result.type).toBe('error');
    expect((result as { type: 'error'; error: Error }).error.message).toBe('string error');
  });
});

describe('approveToolCall', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('承認後にツールを実行し結果テキストを返す', async () => {
    const mockAgent = createMockAgent({
      approveToolCall: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          { type: 'text-delta', payload: { text: 'Event created: ' } },
          { type: 'text-delta', payload: { text: 'Meeting at 3pm' } },
        ]),
      ),
    });

    const result = await approveToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('Event created: Meeting at 3pm');
    expect(mockAgent.approveToolCall).toHaveBeenCalledWith({
      runId: 'run-123',
      toolCallId: 'call-456',
    });
  });

  it('onStreamChunk コールバックが呼ばれる', async () => {
    const mockAgent = createMockAgent({
      approveToolCall: vi
        .fn()
        .mockResolvedValue(
          createMockStreamOutput([{ type: 'text-delta', payload: { text: 'Done!' } }]),
        ),
    });
    const onStreamChunk = vi.fn().mockResolvedValue(undefined);

    await approveToolCall(mockAgent, 'run-123', 'call-456', onStreamChunk);

    expect(onStreamChunk).toHaveBeenCalledWith('Done!');
  });

  it('空レスポンスの場合は "✅ Completed." を返す', async () => {
    const mockAgent = createMockAgent({
      approveToolCall: vi.fn().mockResolvedValue(createMockStreamOutput([])),
    });

    const result = await approveToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('✅ Completed.');
  });

  it('ネストした承認リクエストは警告メッセージを返す', async () => {
    const mockAgent = createMockAgent({
      approveToolCall: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          {
            type: 'tool-call-approval',
            runId: 'nested-run',
            payload: { toolCallId: 'nested-call', toolName: 'anotherTool', args: {} },
          },
        ]),
      ),
    });

    const result = await approveToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('Unexpected nested approval request');
  });

  it('"No snapshot found" エラーはセッション期限切れとして再スロー', async () => {
    const mockAgent = createMockAgent({
      approveToolCall: vi.fn().mockRejectedValue(new Error('No snapshot found for runId')),
    });

    await expect(approveToolCall(mockAgent, 'run-123', 'call-456')).rejects.toThrow(
      'Session expired. Please retry your request.',
    );
  });

  it('その他のエラーはそのまま再スロー', async () => {
    const originalError = new Error('Network timeout');
    const mockAgent = createMockAgent({
      approveToolCall: vi.fn().mockRejectedValue(originalError),
    });

    await expect(approveToolCall(mockAgent, 'run-123', 'call-456')).rejects.toThrow(
      'Network timeout',
    );
  });
});

describe('declineToolCall', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('拒否後に代替レスポンスを返す', async () => {
    const mockAgent = createMockAgent({
      declineToolCall: vi
        .fn()
        .mockResolvedValue(
          createMockStreamOutput([
            { type: 'text-delta', payload: { text: 'Understood, I will not create the event.' } },
          ]),
        ),
    });

    const result = await declineToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('Understood, I will not create the event.');
    expect(mockAgent.declineToolCall).toHaveBeenCalledWith({
      runId: 'run-123',
      toolCallId: 'call-456',
    });
  });

  it('onStreamChunk コールバックが呼ばれる', async () => {
    const mockAgent = createMockAgent({
      declineToolCall: vi
        .fn()
        .mockResolvedValue(
          createMockStreamOutput([{ type: 'text-delta', payload: { text: 'Cancelled.' } }]),
        ),
    });
    const onStreamChunk = vi.fn().mockResolvedValue(undefined);

    await declineToolCall(mockAgent, 'run-123', 'call-456', onStreamChunk);

    expect(onStreamChunk).toHaveBeenCalledWith('Cancelled.');
  });

  it('空レスポンスの場合は "No response." を返す', async () => {
    const mockAgent = createMockAgent({
      declineToolCall: vi.fn().mockResolvedValue(createMockStreamOutput([])),
    });

    const result = await declineToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('No response.');
  });

  it('ネストした承認リクエストは警告メッセージを返す', async () => {
    const mockAgent = createMockAgent({
      declineToolCall: vi.fn().mockResolvedValue(
        createMockStreamOutput([
          {
            type: 'tool-call-approval',
            runId: 'nested-run',
            payload: { toolCallId: 'nested-call', toolName: 'tool', args: {} },
          },
        ]),
      ),
    });

    const result = await declineToolCall(mockAgent, 'run-123', 'call-456');

    expect(result).toBe('Unexpected nested approval during decline');
  });

  it('"No snapshot found" エラーはセッション期限切れとして再スロー', async () => {
    const mockAgent = createMockAgent({
      declineToolCall: vi.fn().mockRejectedValue(new Error('No snapshot found for runId')),
    });

    await expect(declineToolCall(mockAgent, 'run-123', 'call-456')).rejects.toThrow(
      'Session expired. Please retry your request.',
    );
  });

  it('その他のエラーはそのまま再スロー', async () => {
    const originalError = new Error('Database error');
    const mockAgent = createMockAgent({
      declineToolCall: vi.fn().mockRejectedValue(originalError),
    });

    await expect(declineToolCall(mockAgent, 'run-123', 'call-456')).rejects.toThrow(
      'Database error',
    );
  });
});
