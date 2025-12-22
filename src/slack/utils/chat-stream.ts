import { ChatPostMessageResponse, WebClient } from '@slack/web-api';

export type ChatStreamClient = {
  postMessage: (args: {
    channel: string;
    text: string;
    thread_ts?: string;
  }) => Promise<ChatPostMessageResponse>;
  update: (args: { channel: string; ts: string; text: string }) => Promise<void>;
  startStream: (args: {
    channel: string;
    thread_ts?: string;
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
      // Start by posting an initial message (placeholder)
      const result = await client.chat.postMessage({
        channel: args.channel,
        thread_ts: args.thread_ts,
        text: '...', // Initial placeholder
        // Pass team/user if supported by types, otherwise ignoring for now to be safe
        // (Shared channel support might require these, but type definition might limit us)
      });
      return { ts: result.ts };
    },
    appendStream: async (args) => {
      // Update the message with new content
      await client.chat.update({
        channel: args.channel,
        ts: args.ts,
        text: args.markdown_text,
      });
    },
    stopStream: async (args) => {
      // Final update if needed
      if (args.markdown_text) {
        await client.chat.update({
          channel: args.channel,
          ts: args.ts,
          text: args.markdown_text,
        });
      }
    },
  };
};

export const streamToSlack = async (
  chatClient: ChatStreamClient,
  channel: string,
  threadTs: string | undefined,
  executor: (onChunk: (text: string) => Promise<void>) => Promise<string | { type: string }>,
  teamId?: string,
  userId?: string,
) => {
  const streamResponse = await chatClient.startStream({
    channel,
    thread_ts: threadTs,
    recipient_team_id: teamId,
    recipient_user_id: userId,
  });

  const streamTs = streamResponse.ts;
  let streamOpen = true;
  let fullText = '';

  try {
    const result = await executor(async (chunk: string) => {
      if (streamOpen && streamTs) {
        fullText += chunk;
        await chatClient.appendStream({
          channel,
          ts: streamTs,
          markdown_text: fullText,
        });
      }
    });

    streamOpen = false;
    if (streamTs) {
      // If result is string, it might be the final full text.
      // But we have been accumulating in fullText.
      // Usually valid agent stream result matches accumulation.
      // However, let's ensure we flush the latest available text.
      const finalText = typeof result === 'string' ? result : fullText;

      await chatClient.stopStream({
        channel,
        ts: streamTs,
        markdown_text: finalText,
      });
    }

    return result;
  } catch (error) {
    streamOpen = false;
    if (streamTs) {
      // Optionally update message to show error?
      // Current interface stopStream just closes.
      await chatClient.stopStream({
        channel,
        ts: streamTs,
        // markdown_text: `Error: ${error instanceof Error ? error.message : String(error)}` // optional
      });
    }
    throw error;
  }
};
