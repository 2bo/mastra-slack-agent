import { ChatPostMessageResponse, WebClient } from '@slack/web-api';

export type StreamChunkCallback = (text: string) => Promise<void>;

/**
 * executor の戻り値型。chat-stream は mastra 層に依存しないため、
 * AgentExecutionResult を直接参照せず構造的部分型で受ける。
 */
export type StreamExecutorResult = string | { type: string; text?: string };

export type StreamToSlackParams<TResult extends StreamExecutorResult = StreamExecutorResult> = {
  chatClient: ChatStreamClient;
  channel: string;
  threadTs: string;
  executor: (onChunk: StreamChunkCallback) => Promise<TResult>;
  teamId?: string;
  userId?: string;
  initialPrefix?: string;
};

export type ChatStreamClient = {
  postMessage: (args: {
    channel: string;
    text: string;
    thread_ts?: string;
  }) => Promise<ChatPostMessageResponse>;
  update: (args: { channel: string; ts: string; text: string }) => Promise<void>;
  startStream: (args: {
    channel: string;
    thread_ts: string;
    recipient_team_id?: string;
    recipient_user_id?: string;
  }) => Promise<{ ts?: string }>;
  appendStream: (args: { channel: string; ts: string; markdown_text: string }) => Promise<void>;
  stopStream: (args: { channel: string; ts: string; markdown_text?: string }) => Promise<void>;
};

export const getChatStreamClient = (client: WebClient): ChatStreamClient => ({
  postMessage: (args) => client.chat.postMessage(args),
  update: async (args) => {
    await client.chat.update(args);
  },
  startStream: async (args) => ({ ts: (await client.chat.startStream(args)).ts }),
  appendStream: async (args) => {
    await client.chat.appendStream(args);
  },
  stopStream: async (args) => {
    await client.chat.stopStream(args);
  },
});

const applyInitialPrefix = (chunk: string, streamedText: string, initialPrefix?: string): string =>
  streamedText === '' && initialPrefix ? `${initialPrefix}${chunk}` : chunk;

/**
 * executor の結果から「完成テキスト」を抽出する。
 * ストリーミング中に送った chunk の合計と最終テキストにずれがある場合、
 * stopStream で差分を補完するために使う。
 *
 * - executor が string を返した場合 → そのまま完成テキスト
 * - { type: 'completed', text } → text を完成テキストとして抽出
 * - それ以外（approval-required 等）→ undefined（差分補完しない）
 */
const extractCompletedText = (result: StreamExecutorResult): string | undefined => {
  if (typeof result === 'string') return result;
  if (result?.type === 'completed' && typeof result.text === 'string') return result.text;
  return undefined;
};

/**
 * ストリーム中に送信済みのテキストと最終テキストを比較し、
 * stopStream で追加送信すべき差分テキストを返す。
 * 差分がなければ undefined（追加送信不要）。
 */
const computeFinalAppendText = (
  completedText: string | undefined,
  streamedText: string,
  initialPrefix?: string,
): string | undefined => {
  if (completedText === undefined) return undefined;

  const expectedFinalText = initialPrefix ? `${initialPrefix}${completedText}` : completedText;

  if (streamedText === expectedFinalText) return undefined;
  if (expectedFinalText.startsWith(streamedText))
    return expectedFinalText.slice(streamedText.length);
  return expectedFinalText;
};

export const streamToSlack = async <TResult extends StreamExecutorResult>({
  chatClient,
  channel,
  threadTs,
  executor,
  teamId,
  userId,
  initialPrefix,
}: StreamToSlackParams<TResult>): Promise<TResult> => {
  const streamSession = await chatClient.startStream({
    channel,
    thread_ts: threadTs,
    recipient_team_id: teamId,
    recipient_user_id: userId,
  });

  const streamTs = streamSession.ts;
  let streamOpen = true;
  let streamedText = '';

  try {
    const appendChunkIfStreaming = async (chunk: string): Promise<void> => {
      if (!streamOpen || !streamTs) return;

      const textToAppend = applyInitialPrefix(chunk, streamedText, initialPrefix);
      streamedText += textToAppend;
      await chatClient.appendStream({ channel, ts: streamTs, markdown_text: textToAppend });
    };

    const result = await executor(appendChunkIfStreaming);

    streamOpen = false;
    if (streamTs) {
      const completedText = extractCompletedText(result);
      const finalAppendText = computeFinalAppendText(completedText, streamedText, initialPrefix);
      await chatClient.stopStream({ channel, ts: streamTs, markdown_text: finalAppendText });
    }

    return result;
  } catch (error) {
    streamOpen = false;
    if (streamTs) {
      await chatClient.stopStream({ channel, ts: streamTs });
    }
    throw error;
  }
};
