import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamToSlack, type ChatStreamClient } from './chat-stream';

type MockChatStreamClient = {
  postMessage: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  startStream: ReturnType<typeof vi.fn>;
  appendStream: ReturnType<typeof vi.fn>;
  stopStream: ReturnType<typeof vi.fn>;
};

const createChatClient = (overrides: Partial<MockChatStreamClient> = {}): MockChatStreamClient => {
  const chatClient = {
    postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'post.001' }),
    update: vi.fn().mockResolvedValue(undefined),
    startStream: vi.fn().mockResolvedValue({ ts: 'stream.001' }),
    appendStream: vi.fn().mockResolvedValue(undefined),
    stopStream: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return chatClient;
};

describe('streamToSlack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chunk を append し、最終結果と一致する場合は追加markdownなしで stop する', async () => {
    const chatClient = createChatClient();

    const result = await streamToSlack({
      chatClient: chatClient as unknown as ChatStreamClient,
      channel: 'C123',
      threadTs: '111.222',
      executor: async (onChunk) => {
        await onChunk('Hello ');
        await onChunk('world');
        return 'Hello world';
      },
    });

    expect(result).toBe('Hello world');
    expect(chatClient.startStream).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '111.222',
      recipient_team_id: undefined,
      recipient_user_id: undefined,
    });
    expect(chatClient.appendStream).toHaveBeenNthCalledWith(1, {
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: 'Hello ',
    });
    expect(chatClient.appendStream).toHaveBeenNthCalledWith(2, {
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: 'world',
    });
    expect(chatClient.stopStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: undefined,
    });
  });

  it('initialPrefix は先頭chunkのみに適用し、未送信差分だけ stop で補完する', async () => {
    const chatClient = createChatClient();

    const result = await streamToSlack({
      chatClient: chatClient as unknown as ChatStreamClient,
      channel: 'C123',
      threadTs: '111.222',
      initialPrefix: '❌ ',
      executor: async (onChunk) => {
        await onChunk('Rejected');
        return 'Rejected by user';
      },
    });

    expect(result).toBe('Rejected by user');
    expect(chatClient.appendStream).toHaveBeenCalledTimes(1);
    expect(chatClient.appendStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: '❌ Rejected',
    });
    expect(chatClient.stopStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: ' by user',
    });
  });

  it('executor が失敗したら stream を stop して再スローする', async () => {
    const chatClient = createChatClient();
    const streamError = new Error('stream failed');

    await expect(
      streamToSlack({
        chatClient: chatClient as unknown as ChatStreamClient,
        channel: 'C123',
        threadTs: '111.222',
        executor: async (onChunk) => {
          await onChunk('partial');
          throw streamError;
        },
      }),
    ).rejects.toThrow('stream failed');

    expect(chatClient.appendStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: 'partial',
    });
    expect(chatClient.stopStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
    });
  });

  it('startStream の ts が無い場合は append/stop せず結果だけ返す', async () => {
    const chatClient = createChatClient({
      startStream: vi.fn().mockResolvedValue({}),
    });

    const result = await streamToSlack({
      chatClient: chatClient as unknown as ChatStreamClient,
      channel: 'C123',
      threadTs: '111.222',
      executor: async (onChunk) => {
        await onChunk('Hello');
        return 'Hello';
      },
    });

    expect(result).toBe('Hello');
    expect(chatClient.appendStream).not.toHaveBeenCalled();
    expect(chatClient.stopStream).not.toHaveBeenCalled();
  });

  it('completed オブジェクト結果も stop 時に最終テキストを補完する', async () => {
    const chatClient = createChatClient();

    const result = await streamToSlack({
      chatClient: chatClient as unknown as ChatStreamClient,
      channel: 'C123',
      threadTs: '111.222',
      executor: async () => {
        return { type: 'completed', text: 'Done.' };
      },
    });

    expect(result).toEqual({ type: 'completed', text: 'Done.' });
    expect(chatClient.appendStream).not.toHaveBeenCalled();
    expect(chatClient.stopStream).toHaveBeenCalledWith({
      channel: 'C123',
      ts: 'stream.001',
      markdown_text: 'Done.',
    });
  });
});
