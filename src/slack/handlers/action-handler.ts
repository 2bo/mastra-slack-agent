import { BlockAction, SlackActionMiddlewareArgs } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { calendarAgent } from '../../mastra/agents/calendar-agent';
import { agentExecutor } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES } from '../constants';
import { buildRejectionModal, updateApprovalMessage } from '../ui/approval-blocks';
import { getChatStreamClient } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { parseActionId, IdParseError } from '../utils/id-parser';

/**
 * Slack承認/却下ボタン処理
 */
export const handleAction = async ({
  action,
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & { client: WebClient }) => {
  await ack();

  // ID解析 + バリデーション
  let parsed;
  try {
    parsed = parseActionId(action.action_id);
  } catch (error) {
    if (error instanceof IdParseError) {
      console.error(`${LOG_PREFIXES.ACTION_HANDLER} Invalid action ID:`, error.message);
      return;
    }
    throw error;
  }

  if (!body.channel || !body.message) {
    console.error(`${LOG_PREFIXES.ACTION_HANDLER} Missing channel or message in body`);
    return;
  }

  const { type, runId, toolCallId } = parsed;
  const { channel, message } = body;
  const chatClient = getChatStreamClient(client);

  if (type === 'approve') {
    // 承認メッセージ更新 (二重クリック防止)
    await updateApprovalMessage(client, channel.id, message.ts, 'approved');

    try {
      const resultText = await agentExecutor.approveToolCall(calendarAgent, runId, toolCallId);
      await chatClient.postMessage({
        channel: channel.id,
        thread_ts: message.thread_ts,
        text: resultText,
      });
    } catch (error) {
      await handleError({
        logPrefix: LOG_PREFIXES.ACTION_HANDLER,
        logMessage: 'Error approving tool call',
        error,
        client,
        channel: channel.id,
        threadTs: message.thread_ts,
      });
    }
  } else if (type === 'reject') {
    // 型ガード: trigger_id の存在確認
    if (!('trigger_id' in body) || typeof body.trigger_id !== 'string') {
      console.error(`${LOG_PREFIXES.ACTION_HANDLER} Missing trigger_id in body`);
      return;
    }

    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildRejectionModal({
          runId,
          toolCallId,
          channelId: channel.id,
          messageTs: message.ts,
          threadTs: message.thread_ts,
        }),
      });
    } catch (error) {
      console.error(`${LOG_PREFIXES.ACTION_HANDLER} Error opening modal:`, error);
    }
  } else {
    console.error(`${LOG_PREFIXES.ACTION_HANDLER} Unknown action type: ${type}`);
  }
};
