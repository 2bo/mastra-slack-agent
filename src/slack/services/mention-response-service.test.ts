import type { WebClient } from '@slack/web-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_AGENT_ID } from '../../mastra/constants';
import type { AgentExecutionResult } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import type { ChatStreamClient, StreamChunkCallback } from '../utils/chat-stream';
import { runMentionResponseFlow } from './mention-response-service';

const mocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
  executeAgent: vi.fn(),
  getChatStreamClient: vi.fn(),
  streamToSlack: vi.fn(),
  presentMentionResult: vi.fn(),
  handleError: vi.fn(),
  generateThreadId: vi.fn(),
}));

vi.mock('../../mastra', () => ({
  mastra: {
    getAgent: mocks.getAgent,
  },
}));

vi.mock('../../mastra/services/agent-executor', () => ({
  executeAgent: mocks.executeAgent,
}));

vi.mock('./agent-result-presenter', () => ({
  presentMentionResult: mocks.presentMentionResult,
}));

vi.mock('../utils/chat-stream', () => ({
  getChatStreamClient: mocks.getChatStreamClient,
  streamToSlack: mocks.streamToSlack,
}));

vi.mock('../utils/error-handler', () => ({
  handleError: mocks.handleError,
}));

vi.mock('../utils/thread-id', () => ({
  generateThreadId: mocks.generateThreadId,
}));

const createClient = () => {
  const client = {
    chat: {
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  } as unknown as WebClient;

  return { client };
};

const createChatStreamClient = (): ChatStreamClient => ({
  postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '111.222' }),
  update: vi.fn().mockResolvedValue(undefined),
  startStream: vi.fn().mockResolvedValue({ ts: 'stream.001' }),
  appendStream: vi.fn().mockResolvedValue(undefined),
  stopStream: vi.fn().mockResolvedValue(undefined),
});

describe('runMentionResponseFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAgent.mockReturnValue({ name: 'assistantAgent' });
    mocks.generateThreadId.mockReturnValue('C123:thread');
  });

  it('completed の場合はエージェント実行後に進捗メッセージを削除する', async () => {
    const { client } = createClient();
    const chatClient = createChatStreamClient();

    mocks.getChatStreamClient.mockReturnValue(chatClient);
    mocks.executeAgent.mockResolvedValue({ type: 'completed', text: 'hello' });
    mocks.streamToSlack.mockImplementation(
      async ({
        executor,
      }: {
        executor: (onChunk: StreamChunkCallback) => Promise<AgentExecutionResult>;
      }) => {
        return await executor(async () => {});
      },
    );

    await runMentionResponseFlow({
      client,
      channel: 'C123',
      threadTs: '100.000',
      eventTs: '200.000',
      teamId: 'T123',
      userId: 'U123',
      cleanText: 'hello',
    });

    expect(chatClient.postMessage).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '100.000',
      text: MESSAGES.PROCESSING,
    });
    expect(mocks.streamToSlack).toHaveBeenCalledWith(
      expect.objectContaining({
        chatClient,
        channel: 'C123',
        threadTs: '111.222',
        teamId: 'T123',
        userId: 'U123',
      }),
    );
    expect(mocks.generateThreadId).toHaveBeenCalledWith('C123', '100.000', '200.000');
    expect(mocks.executeAgent).toHaveBeenCalledWith(
      { name: 'assistantAgent' },
      'hello',
      { resourceId: 'U123', threadId: 'C123:thread' },
      expect.any(Function),
    );
    expect(mocks.presentMentionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { type: 'completed', text: 'hello' },
        client,
        chatClient,
        channel: 'C123',
        threadTs: '100.000',
        agentName: ASSISTANT_AGENT_ID,
        messageTs: '111.222',
      }),
    );
    expect(mocks.handleError).not.toHaveBeenCalled();
  });

  it.each(['createEvent', 'deleteEvent'] as const)(
    'approval-required (%s) の場合も presenter へ委譲する',
    async (toolName) => {
      const { client } = createClient();
      const chatClient = createChatStreamClient();

      mocks.getChatStreamClient.mockReturnValue(chatClient);
      mocks.streamToSlack.mockResolvedValue({
        type: 'approval-required',
        runId: 'run-1',
        toolCallId: 'tc-1',
        toolName,
        args: { summary: 'Meeting' },
      });

      await runMentionResponseFlow({
        client,
        channel: 'C123',
        eventTs: '200.000',
        teamId: 'T123',
        userId: 'U123',
        cleanText: 'please create event',
      });

      expect(mocks.presentMentionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          result: {
            type: 'approval-required',
            runId: 'run-1',
            toolCallId: 'tc-1',
            toolName,
            args: { summary: 'Meeting' },
          },
          threadTs: '200.000',
          agentName: ASSISTANT_AGENT_ID,
          messageTs: '111.222',
        }),
      );
    },
  );

  it('error 結果は presenter へ委譲する', async () => {
    const { client } = createClient();
    const chatClient = createChatStreamClient();
    const agentError = new Error('agent failed');

    mocks.getChatStreamClient.mockReturnValue(chatClient);
    mocks.streamToSlack.mockResolvedValue({
      type: 'error',
      error: agentError,
    });

    await runMentionResponseFlow({
      client,
      channel: 'C123',
      eventTs: '200.000',
      userId: 'U123',
      cleanText: 'hello',
    });

    expect(mocks.presentMentionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: {
          type: 'error',
          error: agentError,
        },
      }),
    );
  });

  it('streamToSlack 例外は Unexpected error として handleError に委譲する', async () => {
    const { client } = createClient();
    const chatClient = createChatStreamClient();
    const streamError = new Error('stream failed');

    mocks.getChatStreamClient.mockReturnValue(chatClient);
    mocks.streamToSlack.mockRejectedValue(streamError);

    await runMentionResponseFlow({
      client,
      channel: 'C123',
      eventTs: '200.000',
      userId: 'U123',
      cleanText: 'hello',
    });

    expect(mocks.handleError).toHaveBeenCalledWith(
      expect.objectContaining({
        logPrefix: LOG_PREFIXES.MENTION_HANDLER,
        logMessage: 'Unexpected error',
        error: streamError,
        client,
        channel: 'C123',
        messageTs: '111.222',
      }),
    );
  });
});
