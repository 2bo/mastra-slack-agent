import { mastra } from '../../mastra';
import { ASSISTANT_AGENT_KEY } from '../../mastra/constants';
import { approveToolCall, declineToolCall } from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import { presentActionResult } from '../services/agent-result-presenter';
import { ActionHandlerArgs } from '../types/handler-args';
import { updateApprovalMessage } from '../ui/approval-blocks';
import { getChatStreamClient, streamToSlack } from '../utils/chat-stream';
import type { StreamChunkCallback } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { IdParseError, parseActionId } from '../utils/id-parser';

type ActionType = 'approve' | 'reject';
type ActionStreamConfig = {
  status: 'approved' | 'rejected';
  run: typeof approveToolCall | typeof declineToolCall;
  errorMessage: string;
  initialPrefix?: string;
};
type ActionContext = {
  type: ActionType;
  runId: string;
  toolCallId: string;
  channelId: string;
  messageTs: string;
  responseThreadTs: string;
  errorThreadTs?: string;
  teamId?: string;
  userId?: string;
};

const ACTION_STREAM_CONFIG: Record<ActionType, ActionStreamConfig> = {
  approve: {
    status: 'approved',
    run: approveToolCall,
    errorMessage: 'Error approving tool call',
  },
  reject: {
    status: 'rejected',
    run: declineToolCall,
    errorMessage: 'Error declining tool call',
    initialPrefix: MESSAGES.REJECTED_PREFIX,
  },
};

const isActionType = (type: string): type is ActionType => type === 'approve' || type === 'reject';

const parseActionContext = (
  actionId: string,
  body: ActionHandlerArgs['body'],
): ActionContext | null => {
  let parsed;
  try {
    parsed = parseActionId(actionId);
  } catch (error) {
    if (error instanceof IdParseError) {
      console.error(`${LOG_PREFIXES.ACTION_HANDLER} Invalid action ID:`, error.message);
      return null;
    }
    throw error;
  }

  if (!body.channel || !body.message) return null;

  const { type, runId, toolCallId } = parsed;
  if (!isActionType(type)) {
    console.error(`${LOG_PREFIXES.ACTION_HANDLER} Unknown action type: ${type}`);
    return null;
  }

  return {
    type,
    runId,
    toolCallId,
    channelId: body.channel.id,
    messageTs: body.message.ts,
    responseThreadTs: body.message.thread_ts ?? body.message.ts,
    errorThreadTs: body.message.thread_ts,
    teamId: 'team' in body && body.team ? body.team.id : undefined,
    userId: 'user' in body && body.user ? body.user.id : undefined,
  };
};

const runActionStream = async (client: ActionHandlerArgs['client'], context: ActionContext) => {
  const {
    type,
    runId,
    toolCallId,
    channelId,
    messageTs,
    responseThreadTs,
    errorThreadTs,
    teamId,
    userId,
  } = context;
  const config = ACTION_STREAM_CONFIG[type];
  const chatClient = getChatStreamClient(client);

  await updateApprovalMessage(client, channelId, messageTs, config.status);

  try {
    const result = await streamToSlack({
      chatClient,
      channel: channelId,
      threadTs: responseThreadTs,
      executor: async (onChunk: StreamChunkCallback) => {
        return await config.run(mastra.getAgent(ASSISTANT_AGENT_KEY), runId, toolCallId, onChunk);
      },
      teamId,
      userId,
      initialPrefix: config.initialPrefix,
    });

    await presentActionResult({
      result,
      client,
      channel: channelId,
      threadTs: responseThreadTs,
      errorMessage: config.errorMessage,
    });
  } catch (error) {
    await handleError({
      logPrefix: LOG_PREFIXES.ACTION_HANDLER,
      logMessage: config.errorMessage,
      error,
      client,
      channel: channelId,
      threadTs: errorThreadTs,
    });
  }
};

/**
 * Slack承認/却下ボタン処理
 */
export const handleAction = async ({ action, ack, body, client }: ActionHandlerArgs) => {
  await ack();

  const context = parseActionContext(action.action_id, body);
  if (!context) return;

  await runActionStream(client, context);
};
