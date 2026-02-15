import { ChatPostMessageResponse, WebClient } from '@slack/web-api';

export type StreamChunkCallback = (text: string) => Promise<void>;
export type StreamExecutorResult = string | { type: string };
export type StreamExecutor<TResult extends StreamExecutorResult = StreamExecutorResult> = (
  onChunk: StreamChunkCallback,
) => Promise<TResult>;

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

export const getChatStreamClient = (client: WebClient): ChatStreamClient => {
  return {
    postMessage: async (args) => {
      const result = await client.chat.postMessage(args);
      return result;
    },
    update: async (args) => {
      await client.chat.update(args);
    },
    startStream: async (args) => {
      const result = await client.chat.startStream(args);
      return { ts: result.ts };
    },
    appendStream: async (args) => {
      await client.chat.appendStream(args);
    },
    stopStream: async (args) => {
      await client.chat.stopStream(args);
    },
  };
};

export const streamToSlack = async <TResult extends StreamExecutorResult>(
  chatClient: ChatStreamClient,
  channel: string,
  threadTs: string,
  executor: StreamExecutor<TResult>,
  teamId?: string,
  userId?: string,
  initialPrefix?: string,
): Promise<TResult> => {
  const streamResponse = await chatClient.startStream({
    channel,
    thread_ts: threadTs,
    recipient_team_id: teamId,
    recipient_user_id: userId,
  });

  const streamTs = streamResponse.ts;
  let streamOpen = true;
  let streamedText = '';

  try {
    const result = await executor(async (chunk: string) => {
      if (streamOpen && streamTs) {
        const textToAppend =
          streamedText === '' && initialPrefix ? `${initialPrefix}${chunk}` : chunk;
        streamedText += textToAppend;
        await chatClient.appendStream({
          channel,
          ts: streamTs,
          markdown_text: textToAppend,
        });
      }
    });

    streamOpen = false;
    if (streamTs) {
      let finalAppendText: string | undefined;
      if (typeof result === 'string') {
        const expectedFinalText = initialPrefix ? `${initialPrefix}${result}` : result;
        if (streamedText !== expectedFinalText) {
          finalAppendText = expectedFinalText.startsWith(streamedText)
            ? expectedFinalText.slice(streamedText.length)
            : expectedFinalText;
        }
      }
      await chatClient.stopStream({
        channel,
        ts: streamTs,
        markdown_text: finalAppendText,
      });
    }

    return result;
  } catch (error) {
    streamOpen = false;
    if (streamTs) {
      await chatClient.stopStream({
        channel,
        ts: streamTs,
      });
    }
    throw error;
  }
};
