import { mastra } from '../../mastra';
import { approveToolCall, declineToolCall } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES } from '../constants';
import { ActionHandlerArgs } from '../types/handler-args';
import { updateApprovalMessage } from '../ui/approval-blocks';
import { getChatStreamClient, streamToSlack } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { IdParseError, parseActionId } from '../utils/id-parser';

/**
 * Slack承認/却下ボタン処理
 */
export const handleAction = async ({ action, ack, body, client }: ActionHandlerArgs) => {
  await ack();

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

  if (!body.channel || !body.message) return;

  const { type, runId, toolCallId } = parsed;
  const { channel, message } = body;
  const chatClient = getChatStreamClient(client);

  if (type === 'approve') {
    await updateApprovalMessage(client, channel.id, message.ts, 'approved');
    try {
      await streamToSlack(
        chatClient,
        channel.id,
        message.thread_ts,

        async (onChunk: (text: string) => Promise<void>) => {
          return await approveToolCall(
            mastra.getAgent('assistantAgent'),
            runId,
            toolCallId,
            onChunk,
          );
        },
        'team' in body && body.team ? body.team.id : undefined,
        'user' in body && body.user ? body.user.id : undefined,
      );
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
    await updateApprovalMessage(client, channel.id, message.ts, 'rejected');
    try {
      await streamToSlack(
        chatClient,
        channel.id,
        message.thread_ts,
        async (onChunk: (text: string) => Promise<void>) => {
          return await declineToolCall(
            mastra.getAgent('assistantAgent'),
            runId,
            toolCallId,
            onChunk,
          );
        },
        'team' in body && body.team ? body.team.id : undefined,
        'user' in body && body.user ? body.user.id : undefined,
      );
    } catch (error) {
      await handleError({
        logPrefix: LOG_PREFIXES.ACTION_HANDLER,
        logMessage: 'Error declining tool call',
        error,
        client,
        channel: channel.id,
        threadTs: message.thread_ts,
      });
    }
  } else {
    console.error(`${LOG_PREFIXES.ACTION_HANDLER} Unknown action type: ${type}`);
  }
};
