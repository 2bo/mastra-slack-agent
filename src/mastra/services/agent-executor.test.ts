import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { executeAgent, approveToolCall, declineToolCall } from './agent-executor';

const CONTEXT = { resourceId: 'U1234', threadId: 'C1234:1234.5678' };
const RUN_ID = 'run-1';
const TOOL_CALL_ID = 'tc-1';

type StreamChunk = {
  type: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

const createStreamOutput = (chunks: StreamChunk[]) => ({
  fullStream: (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })(),
});

const createStreamMock = (chunks: StreamChunk[]) =>
  vi.fn().mockResolvedValue(createStreamOutput(chunks));

const createAgentStub = (options?: {
  streamChunks?: StreamChunk[];
  approveChunks?: StreamChunk[];
  declineChunks?: StreamChunk[];
}) =>
  ({
    stream: createStreamMock(options?.streamChunks ?? []),
    approveToolCall: createStreamMock(options?.approveChunks ?? []),
    declineToolCall: createStreamMock(options?.declineChunks ?? []),
  }) as unknown as Agent;

const textDelta = (text: string): StreamChunk => ({
  type: 'text-delta',
  payload: { text },
});

const createErrorAgent = (
  method: 'stream' | 'approveToolCall' | 'declineToolCall',
  message: string,
) =>
  ({
    [method]: vi.fn().mockRejectedValue(new Error(message)),
  }) as unknown as Agent;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('executeAgent', () => {
  it('text-delta を結合して completed を返す', async () => {
    const agent = createAgentStub({
      streamChunks: [textDelta('Hello '), textDelta('world')],
    });

    const result = await executeAgent(agent, 'hi', CONTEXT);

    expect(result).toEqual({ type: 'completed', text: 'Hello world' });
  });

  it('onStreamChunk は text-delta ごとに呼ばれる', async () => {
    const agent = createAgentStub({
      streamChunks: [textDelta('A'), { type: 'tool-call', payload: {} }, textDelta('B')],
    });
    const onChunk = vi.fn();

    await executeAgent(agent, 'hi', CONTEXT, onChunk);

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'A');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'B');
  });

  it('text が空の場合は Done. を返し memory context を渡す', async () => {
    const agent = createAgentStub({ streamChunks: [] });

    const result = await executeAgent(agent, 'hello', CONTEXT);

    expect(result).toEqual({ type: 'completed', text: 'Done.' });
    expect(agent.stream).toHaveBeenCalledWith('hello', {
      memory: { resource: 'U1234', thread: 'C1234:1234.5678' },
    });
  });

  it('tool-call-approval を受けると approval-required を返す', async () => {
    const agent = createAgentStub({
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
      ],
    });

    await expect(executeAgent(agent, 'create event', CONTEXT)).resolves.toEqual({
      type: 'approval-required',
      agentName: 'unified',
      runId: 'run-abc',
      toolCallId: 'tc-123',
      toolName: 'createEvent',
      args: { summary: 'Meeting' },
    });
  });

  it('agent.stream の失敗を error 結果に変換する', async () => {
    const agent = createErrorAgent('stream', 'API error');

    await expect(executeAgent(agent, 'hi', CONTEXT)).resolves.toEqual({
      type: 'error',
      error: expect.objectContaining({ message: 'API error' }),
    });
  });
});

describe('approveToolCall', () => {
  it('テキストを連結して返す', async () => {
    const agent = createAgentStub({
      approveChunks: [textDelta('Event created'), textDelta(' successfully')],
    });

    await expect(approveToolCall(agent, RUN_ID, TOOL_CALL_ID)).resolves.toBe(
      'Event created successfully',
    );
  });

  it('テキストが空ならフォールバックを返す', async () => {
    const agent = createAgentStub({ approveChunks: [] });

    await expect(approveToolCall(agent, RUN_ID, TOOL_CALL_ID)).resolves.toBe('✅ Completed.');
  });

  it('No snapshot found は期限切れに変換し、他は再スローする', async () => {
    const expiredAgent = createErrorAgent('approveToolCall', 'No snapshot found for run-1');

    await expect(approveToolCall(expiredAgent, RUN_ID, TOOL_CALL_ID)).rejects.toThrow(
      'Session expired. Please retry your request.',
    );

    const agent = createErrorAgent('approveToolCall', 'Unknown error');

    await expect(approveToolCall(agent, RUN_ID, TOOL_CALL_ID)).rejects.toThrow('Unknown error');
  });
});

describe('declineToolCall', () => {
  it('テキストを連結して返す', async () => {
    const agent = createAgentStub({
      declineChunks: [textDelta('Understood, cancelled.')],
    });

    await expect(declineToolCall(agent, RUN_ID, TOOL_CALL_ID)).resolves.toBe(
      'Understood, cancelled.',
    );
  });

  it('テキストが空ならフォールバックを返す', async () => {
    const agent = createAgentStub({ declineChunks: [] });

    await expect(declineToolCall(agent, RUN_ID, TOOL_CALL_ID)).resolves.toBe('No response.');
  });

  it('No snapshot found は期限切れエラーに変換する', async () => {
    const agent = createErrorAgent('declineToolCall', 'No snapshot found for run-1');

    await expect(declineToolCall(agent, RUN_ID, TOOL_CALL_ID)).rejects.toThrow(
      'Session expired. Please retry your request.',
    );
  });
});
