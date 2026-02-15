import type { WebClient } from '@slack/web-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import type { ChatStreamClient } from '../utils/chat-stream';
import { presentActionResult, presentMentionResult } from './agent-result-presenter';

const mocks = vi.hoisted(() => ({
  postApprovalRequest: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('../ui/approval-blocks', () => ({
  postApprovalRequest: mocks.postApprovalRequest,
}));

vi.mock('../utils/error-handler', () => ({
  handleError: mocks.handleError,
}));

const createClient = () => {
  const deleteMessage = vi.fn().mockResolvedValue({ ok: true });
  const client = {
    chat: {
      delete: deleteMessage,
    },
  } as unknown as WebClient;

  return { client, deleteMessage };
};

const createChatStreamClient = (): ChatStreamClient => ({
  postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'post.001' }),
  update: vi.fn().mockResolvedValue(undefined),
  startStream: vi.fn().mockResolvedValue({ ts: 'stream.001' }),
  appendStream: vi.fn().mockResolvedValue(undefined),
  stopStream: vi.fn().mockResolvedValue(undefined),
});

describe('presentMentionResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approval-required では承認依頼投稿と waiting 表示更新を行う', async () => {
    const { client } = createClient();
    const chatClient = createChatStreamClient();

    await presentMentionResult({
      result: {
        type: 'approval-required',
        runId: 'run-1',
        toolCallId: 'tc-1',
        toolName: 'createEvent',
        args: { summary: 'Meeting' },
      },
      client,
      chatClient,
      channel: 'C123',
      threadTs: '200.000',
      agentName: 'assistant',
      messageTs: '111.222',
    });

    expect(mocks.postApprovalRequest).toHaveBeenCalledWith(client, 'C123', '200.000', {
      agentName: 'assistant',
      runId: 'run-1',
      toolCallId: 'tc-1',
      toolName: 'createEvent',
      args: { summary: 'Meeting' },
    });
    expect(chatClient.update).toHaveBeenCalledWith({
      channel: 'C123',
      ts: '111.222',
      text: MESSAGES.WAITING_APPROVAL,
    });
  });

  it('completed では対象メッセージを削除する', async () => {
    const { client, deleteMessage } = createClient();
    const chatClient = createChatStreamClient();

    await presentMentionResult({
      result: {
        type: 'completed',
        text: 'done',
      },
      client,
      chatClient,
      channel: 'C123',
      threadTs: '200.000',
      agentName: 'assistant',
      messageTs: '111.222',
    });

    expect(deleteMessage).toHaveBeenCalledWith({
      channel: 'C123',
      ts: '111.222',
    });
  });

  it('error では handleError に委譲する', async () => {
    const { client } = createClient();
    const chatClient = createChatStreamClient();
    const agentError = new Error('agent failed');

    await presentMentionResult({
      result: {
        type: 'error',
        error: agentError,
      },
      client,
      chatClient,
      channel: 'C123',
      threadTs: '200.000',
      agentName: 'assistant',
      messageTs: '111.222',
    });

    expect(mocks.handleError).toHaveBeenCalledWith({
      logPrefix: LOG_PREFIXES.MENTION_HANDLER,
      logMessage: 'Agent execution error',
      error: agentError,
      client,
      channel: 'C123',
      threadTs: '200.000',
      messageTs: '111.222',
    });
  });
});

describe('presentActionResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completed では追加更新を行わない', async () => {
    const { client, deleteMessage } = createClient();

    await presentActionResult({
      result: {
        type: 'completed',
        text: 'done',
      },
      client,
      channel: 'C123',
      threadTs: '200.000',
      errorMessage: 'Error declining tool call',
    });

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(mocks.handleError).not.toHaveBeenCalled();
  });

  it('error では handleError に委譲する', async () => {
    const { client } = createClient();
    const agentError = new Error('agent failed');

    await presentActionResult({
      result: {
        type: 'error',
        error: agentError,
      },
      client,
      channel: 'C123',
      threadTs: '200.000',
      errorMessage: 'Error declining tool call',
    });

    expect(mocks.handleError).toHaveBeenCalledWith({
      logPrefix: LOG_PREFIXES.ACTION_HANDLER,
      logMessage: 'Error declining tool call',
      error: agentError,
      client,
      channel: 'C123',
      threadTs: '200.000',
    });
  });

  it('approval-required が不正経路の場合は handleError で通知する', async () => {
    const { client } = createClient();

    await presentActionResult({
      result: {
        type: 'approval-required',
        runId: 'run-1',
        toolCallId: 'tc-1',
        toolName: 'createEvent',
        args: {},
      },
      client,
      channel: 'C123',
      threadTs: '200.000',
      errorMessage: 'Error declining tool call',
    });

    expect(mocks.handleError).toHaveBeenCalledWith(
      expect.objectContaining({
        logPrefix: LOG_PREFIXES.ACTION_HANDLER,
        logMessage: 'Error declining tool call',
        error: expect.objectContaining({
          message: 'Unexpected approval-required result',
        }),
        channel: 'C123',
        threadTs: '200.000',
      }),
    );
  });
});
