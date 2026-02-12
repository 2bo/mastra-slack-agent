import { WebClient, KnownBlock } from '@slack/web-api';
import { buildActionId, BUTTON_LABELS, MESSAGES } from '../constants';

// tool-call-approval イベントの型
export interface ToolCallApprovalPayload {
  agentName: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// Slack Block Kit構造を生成
export const buildApprovalBlocks = (payload: ToolCallApprovalPayload): KnownBlock[] => {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Approval Required for ${payload.toolName}*\n\`\`\`${JSON.stringify(payload.args, null, 2)}\`\`\``,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: BUTTON_LABELS.APPROVE },
          style: 'primary',
          action_id: buildActionId('APPROVE', payload.agentName, payload.runId, payload.toolCallId),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: BUTTON_LABELS.REJECT },
          style: 'danger',
          action_id: buildActionId('REJECT', payload.agentName, payload.runId, payload.toolCallId),
        },
      ],
    },
  ];
};

// 承認リクエストメッセージを投稿
export const postApprovalRequest = async (
  client: WebClient,
  channel: string,
  threadTs: string | undefined,
  payload: ToolCallApprovalPayload,
): Promise<{ ts: string }> => {
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approval required for ${payload.toolName}`,
    blocks: buildApprovalBlocks(payload),
  });

  return { ts: result.ts! };
};

// 承認メッセージを更新
export const updateApprovalMessage = async (
  client: WebClient,
  channel: string,
  ts: string,
  status: 'approved' | 'rejected',
): Promise<void> => {
  const emoji = status === 'approved' ? MESSAGES.APPROVED_EMOJI : MESSAGES.REJECTED_EMOJI;
  const text = status === 'approved' ? MESSAGES.APPROVED_TEXT : MESSAGES.REJECTED_TEXT;

  await client.chat.update({
    channel,
    ts,
    text: `${emoji} ${text}`,
    blocks: [], // ボタン削除
  });
};
