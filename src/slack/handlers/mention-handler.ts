import { SayFn, SlackEventMiddlewareArgs } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { routeToAgent } from '../../mastra/utils/route-to-agent';
import { agentExecutor } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import { getChatStreamClient } from '../utils/chat-stream';
import { postApprovalRequest } from '../ui/approval-blocks';
import { handleError } from '../utils/error-handler';

/**
 * Slackメンション処理
 * 責務: Slackイベント処理とUI更新のみ
 * エージェントロジックは AgentExecutor に委譲
 */
export const handleMention = async ({
  event,
  say,
  client,
}: SlackEventMiddlewareArgs<'app_mention'> & { say: SayFn; client: WebClient }) => {
  const { channel, text, thread_ts, ts } = event;
  const chatClient = getChatStreamClient(client);

  // ユーザークエリ抽出
  const cleanText = text.replace(/<@.*?>/g, '').trim();

  if (!cleanText) {
    await say(MESSAGES.EMPTY_MENTION);
    return;
  }

  // 処理中メッセージ投稿
  const { ts: messageTs } = await chatClient.postMessage({
    channel,
    thread_ts: thread_ts || ts,
    text: MESSAGES.PROCESSING,
  });

  try {
    // 1️⃣ LLMでルーティング判断 (structured output)
    const agent = await routeToAgent(cleanText);

    // 2️⃣ エージェント実行 (責務分離)
    const result = await agentExecutor.execute(agent, cleanText, {
      resourceId: channel,
      threadId: thread_ts || ts,
    });

    // 3️⃣ 結果に応じたUI更新
    await updateMessageForResult({
      result,
      client,
      chatClient,
      channel,
      messageTs: messageTs ?? ts,
      threadTs: thread_ts || ts,
    });
  } catch (error) {
    await handleError({
      logPrefix: LOG_PREFIXES.MENTION_HANDLER,
      logMessage: 'Unexpected error',
      error,
      client,
      channel,
      messageTs: messageTs ?? ts,
    });
  }
};

/**
 * エージェント実行結果に応じてメッセージを更新
 */
async function updateMessageForResult(params: {
  result: Awaited<ReturnType<typeof agentExecutor.execute>>;
  client: WebClient;
  chatClient: ReturnType<typeof getChatStreamClient>;
  channel: string;
  messageTs: string;
  threadTs: string;
}) {
  const { result, client, chatClient, channel, messageTs, threadTs } = params;

  switch (result.type) {
    case 'approval-required':
      // 承認UI表示
      await postApprovalRequest(client, channel, threadTs, {
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
      // 完了メッセージ表示
      await chatClient.update({
        channel,
        ts: messageTs,
        text: result.text,
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
