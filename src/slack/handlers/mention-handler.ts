import { WebClient } from '@slack/web-api';
import { mastra } from '../../mastra';
import { executeAgent } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import { MentionHandlerArgs } from '../types/handler-args';
import { postApprovalRequest } from '../ui/approval-blocks';
import { getChatStreamClient, streamToSlack } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { generateThreadId } from '../utils/thread-id';

/**
 * Slackメンション処理
 * 責務: Slackイベント処理とUI更新のみ
 * エージェントロジックは AgentExecutor に委譲
 */
export const handleMention = async ({ event, say, client }: MentionHandlerArgs) => {
  const { channel, text, thread_ts, ts, team, user } = event;
  const chatClient = getChatStreamClient(client);

  // ユーザークエリ抽出
  const cleanText = text.replace(/<@.*?>/g, '').trim();

  if (!cleanText) {
    await say(MESSAGES.EMPTY_MENTION);
    return;
  }

  // userが存在しない場合はエラー
  if (!user) {
    await say('Unable to identify user');
    return;
  }

  // 親メッセージ投稿（ストリーミングのスレッド起点）
  const { ts: parentTs } = await chatClient.postMessage({
    channel,
    thread_ts: thread_ts || ts,
    text: MESSAGES.PROCESSING,
  });

  // Slackストリーミング開始（共有チャンネル対応）
  try {
    const result = await streamToSlack(
      chatClient,
      channel,
      parentTs ?? ts,
      async (onChunk: (text: string) => Promise<void>) => {
        return await executeAgent(
          mastra.getAgent('assistantAgent'),
          cleanText,
          {
            resourceId: user,
            threadId: generateThreadId(channel, thread_ts, ts),
          },
          onChunk,
        );
      },
      team,
      user,
    );

    // streamToSlack closes the stream on finish. capture result.

    await updateMessageForResult({
      result: result as Awaited<ReturnType<typeof executeAgent>>, // Cast because helper returns string | object
      client,
      chatClient,
      channel,
      messageTs: parentTs ?? ts,
      threadTs: thread_ts || ts, // Original logic passed this to updateMessage
      agentName: 'unified',
    });
  } catch (error) {
    // streamToSlack closes stream on error too.
    await handleError({
      logPrefix: LOG_PREFIXES.MENTION_HANDLER,
      logMessage: 'Unexpected error',
      error,
      client,
      channel,
      messageTs: parentTs ?? ts,
    });
  }
};

/**
 * エージェント実行結果に応じてメッセージを更新
 */
async function updateMessageForResult(params: {
  result: Awaited<ReturnType<typeof executeAgent>>;
  client: WebClient;
  chatClient: ReturnType<typeof getChatStreamClient>;
  channel: string;
  messageTs: string;
  threadTs: string;
  agentName: string;
}) {
  const { result, client, chatClient, channel, messageTs, threadTs, agentName } = params;

  switch (result.type) {
    case 'approval-required':
      // 承認UI表示
      await postApprovalRequest(client, channel, threadTs, {
        agentName,
        runId: result.runId,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        args: result.args,
      });

      await chatClient.update({
        channel,
        ts: messageTs,
        text: MESSAGES.WAITING_APPROVAL,
      });
      break;

    case 'completed':
      // ストリーミング完了 - 既にstopStreamでメッセージは表示済み
      // 親メッセージ（「処理中...」）を削除してスレッドをクリーンに
      await client.chat.delete({
        channel,
        ts: messageTs,
      });
      break;

    case 'error':
      // エラーメッセージ表示
      await handleError({
        logPrefix: LOG_PREFIXES.MENTION_HANDLER,
        logMessage: 'Agent execution error',
        error: result.error,
        client,
        channel,
        messageTs,
      });
      break;
  }
}
