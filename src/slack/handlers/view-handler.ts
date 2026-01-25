import { mastra } from '../../mastra';
import { declineToolCall } from '../../mastra/services/agent-executor';
import { BLOCK_IDS, LOG_PREFIXES, MESSAGES } from '../constants';
import { ViewHandlerArgs } from '../types/handler-args';
import { updateApprovalMessage } from '../ui/approval-blocks';
import { getChatStreamClient, streamToSlack } from '../utils/chat-stream';
import { handleError } from '../utils/error-handler';
import { IdParseError, parseCallbackId } from '../utils/id-parser';
import { deserializeMetadata } from '../utils/metadata';

/**
 * Slack却下モーダル送信処理
 * 責務: Slackイベント処理とUI更新のみ
 * エージェントロジックは AgentExecutor に委譲
 */
export const handleViewSubmission = async ({ ack, view, client }: ViewHandlerArgs) => {
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

  const chatClient = getChatStreamClient(client);

  // NOTE: reason はまだ Agent API でサポートされていないため、ログ出力のみ
  console.log(`${LOG_PREFIXES.VIEW_HANDLER} Rejection reason: ${reason}`);

  try {
    // 統一されたストリーミング処理を使用
    await streamToSlack(
      chatClient,
      channelId,
      threadTs ?? messageTs, // threadTsがない場合はmessageTsを使用
      async (onChunk) =>
        declineToolCall(mastra.getAgent('assistantAgent'), runId, toolCallId, onChunk),
      { finalTextPrefix: MESSAGES.REJECTED_PREFIX },
    );
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
