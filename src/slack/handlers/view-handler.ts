import { SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { calendarAgent } from '../../mastra/agents/calendar-agent';
import { agentExecutor } from '../../mastra/services/agent-executor';
import { BLOCK_IDS, LOG_PREFIXES, MESSAGES } from '../constants';
import { updateApprovalMessage } from '../ui/approval-blocks';
import { handleError } from '../utils/error-handler';
import { parseCallbackId, IdParseError } from '../utils/id-parser';
import { deserializeMetadata } from '../utils/metadata';

/**
 * Slack却下モーダル送信処理
 * 責務: Slackイベント処理とUI更新のみ
 * エージェントロジックは AgentExecutor に委譲
 */
export const handleViewSubmission = async ({
  ack,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & { client: WebClient }) => {
  await ack();

  const callbackId = view.callback_id;

  // Callback ID 解析
  let parsed;
  try {
    parsed = parseCallbackId(callbackId);
  } catch (error) {
    if (error instanceof IdParseError) {
      console.error(`${LOG_PREFIXES.VIEW_HANDLER} Invalid callback_id:`, error.message);
      return;
    }
    throw error;
  }

  const { runId, toolCallId } = parsed;

  // 却下理由を取得
  const reasonValue = view.state.values[BLOCK_IDS.REASON_BLOCK]?.[BLOCK_IDS.REASON_INPUT]?.value;
  const reason = reasonValue || 'No reason provided';

  // private_metadata から元メッセージ情報を取得
  let metadata;
  try {
    metadata = deserializeMetadata(view.private_metadata);
  } catch (error) {
    console.error(
      `${LOG_PREFIXES.VIEW_HANDLER} Invalid metadata:`,
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  const { channelId, messageTs, threadTs } = metadata;

  // 元の承認メッセージを更新
  await updateApprovalMessage(client, channelId, messageTs, 'rejected');

  try {
    // エージェント却下処理 (責務分離)
    // NOTE: reason はまだ Agent API でサポートされていないため、ログ出力のみ
    console.log(`${LOG_PREFIXES.VIEW_HANDLER} Rejection reason: ${reason}`);

    const resultText = await agentExecutor.declineToolCall(calendarAgent, runId, toolCallId);

    // 却下後のAgent応答を投稿
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `${MESSAGES.REJECTED_PREFIX}${resultText}`,
    });
  } catch (error) {
    await handleError({
      logPrefix: LOG_PREFIXES.VIEW_HANDLER,
      logMessage: 'Error declining tool call',
      error,
      client,
      channel: channelId,
      threadTs,
    });
  }
};
