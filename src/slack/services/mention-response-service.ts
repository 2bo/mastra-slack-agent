import { WebClient } from '@slack/web-api';
import { mastra } from '../../mastra';
import { ASSISTANT_AGENT_ID, ASSISTANT_AGENT_KEY } from '../../mastra/constants';
import { executeAgent } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import { presentMentionResult } from './agent-result-presenter';
import { getChatStreamClient, streamToSlack } from '../utils/chat-stream';
import type { StreamChunkCallback } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { generateThreadId } from '../utils/thread-id';

type RunMentionResponseFlowParams = {
  client: WebClient;
  channel: string;
  threadTs?: string;
  eventTs: string;
  teamId?: string;
  userId: string;
  cleanText: string;
};

export const runMentionResponseFlow = async ({
  client,
  channel,
  threadTs,
  eventTs,
  teamId,
  userId,
  cleanText,
}: RunMentionResponseFlowParams): Promise<void> => {
  const chatClient = getChatStreamClient(client);
  const responseThreadTs = threadTs || eventTs;

  // スレッド内に進捗メッセージを投稿（未スレッドの場合はこれでスレッド開始）
  const { ts: processingMessageTs } = await chatClient.postMessage({
    channel,
    thread_ts: responseThreadTs,
    text: MESSAGES.PROCESSING,
  });

  const replyTs = processingMessageTs ?? eventTs;

  try {
    const result = await streamToSlack({
      chatClient,
      channel,
      threadTs: replyTs,
      executor: async (onChunk: StreamChunkCallback) => {
        return await executeAgent(
          mastra.getAgent(ASSISTANT_AGENT_KEY),
          cleanText,
          {
            resourceId: userId,
            threadId: generateThreadId(channel, threadTs, eventTs),
          },
          onChunk,
        );
      },
      teamId,
      userId,
    });

    await presentMentionResult({
      result,
      client,
      chatClient,
      channel,
      threadTs: responseThreadTs,
      agentName: ASSISTANT_AGENT_ID,
      messageTs: replyTs,
    });
  } catch (error) {
    await handleError({
      logPrefix: LOG_PREFIXES.MENTION_HANDLER,
      logMessage: 'Unexpected error',
      error,
      client,
      channel,
      messageTs: replyTs,
    });
  }
};
