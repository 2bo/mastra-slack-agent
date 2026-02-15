import { WebClient } from '@slack/web-api';
import type {
  AgentExecutionResult,
  ApprovalRequiredResult,
} from '../../mastra/services/agent-executor';
import { LOG_PREFIXES, MESSAGES } from '../constants';
import { postApprovalRequest } from '../ui/approval-blocks';
import type { ChatStreamClient } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';

type MentionPresentationParams = {
  result: AgentExecutionResult;
  client: WebClient;
  chatClient: ChatStreamClient;
  channel: string;
  threadTs: string;
  agentName: string;
  messageTs: string;
};

type MentionApprovalParams = {
  client: WebClient;
  chatClient: ChatStreamClient;
  channel: string;
  threadTs: string;
  agentName: string;
  messageTs: string;
};

type ActionPresentationParams = {
  result: AgentExecutionResult;
  client: WebClient;
  channel: string;
  threadTs: string;
  errorMessage: string;
};

const handleMentionApprovalRequiredResult = async (
  result: ApprovalRequiredResult,
  params: MentionApprovalParams,
): Promise<void> => {
  const { agentName, client, chatClient, channel, threadTs, messageTs } = params;

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
};

export const presentMentionResult = async ({
  result,
  client,
  chatClient,
  channel,
  threadTs,
  agentName,
  messageTs,
}: MentionPresentationParams): Promise<void> => {
  switch (result.type) {
    case 'approval-required':
      await handleMentionApprovalRequiredResult(result, {
        client,
        chatClient,
        channel,
        threadTs,
        agentName,
        messageTs,
      });
      break;

    case 'completed':
      await client.chat.delete({ channel, ts: messageTs });
      break;

    case 'error':
      await handleError({
        logPrefix: LOG_PREFIXES.MENTION_HANDLER,
        logMessage: 'Agent execution error',
        error: result.error,
        client,
        channel,
        threadTs,
        messageTs,
      });
      break;
  }
};

export const presentActionResult = async ({
  result,
  client,
  channel,
  threadTs,
  errorMessage,
}: ActionPresentationParams): Promise<void> => {
  switch (result.type) {
    case 'approval-required':
      await handleError({
        logPrefix: LOG_PREFIXES.ACTION_HANDLER,
        logMessage: errorMessage,
        error: new Error('Unexpected approval-required result'),
        client,
        channel,
        threadTs,
      });
      break;

    case 'completed':
      break;

    case 'error':
      await handleError({
        logPrefix: LOG_PREFIXES.ACTION_HANDLER,
        logMessage: errorMessage,
        error: result.error,
        client,
        channel,
        threadTs,
      });
      break;
  }
};
