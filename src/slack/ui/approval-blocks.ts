import { WebClient, KnownBlock, ModalView } from '@slack/web-api';
import {
  buildActionId,
  BUTTON_LABELS,
  BLOCK_IDS,
  INPUT_LABELS,
  MODAL_TITLES,
  MESSAGES,
} from '../constants';
import type { ApprovalMetadata } from '../utils/metadata';
import { serializeMetadata } from '../utils/metadata';

// tool-call-approval イベントの型
export interface ToolCallApprovalPayload {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// Slack Block Kit構造を生成
export function buildApprovalBlocks(payload: ToolCallApprovalPayload): KnownBlock[] {
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
          action_id: buildActionId('APPROVE', payload.runId, payload.toolCallId),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: BUTTON_LABELS.REJECT },
          style: 'danger',
          action_id: buildActionId('REJECT', payload.runId, payload.toolCallId),
        },
      ],
    },
  ];
}

// 承認リクエストメッセージを投稿
export async function postApprovalRequest(
  client: WebClient,
  channel: string,
  threadTs: string | undefined,
  payload: ToolCallApprovalPayload,
): Promise<{ ts: string }> {
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Approval required for ${payload.toolName}`,
    blocks: buildApprovalBlocks(payload),
  });

  return { ts: result.ts! };
}

// 承認メッセージを更新
export async function updateApprovalMessage(
  client: WebClient,
  channel: string,
  ts: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const emoji = status === 'approved' ? MESSAGES.APPROVED_EMOJI : MESSAGES.REJECTED_EMOJI;
  const text = status === 'approved' ? MESSAGES.APPROVED_TEXT : MESSAGES.REJECTED_TEXT;

  await client.chat.update({
    channel,
    ts,
    text: `${emoji} ${text}`,
    blocks: [], // ボタン削除
  });
}

/**
 * 却下理由入力モーダルビューを構築
 */
export function buildRejectionModal(metadata: ApprovalMetadata): ModalView {
  return {
    type: 'modal',
    callback_id: buildActionId('REJECT_REASON', metadata.runId, metadata.toolCallId),
    private_metadata: serializeMetadata(metadata),
    title: { type: 'plain_text', text: MODAL_TITLES.REJECTION_REASON },
    blocks: [
      {
        type: 'input',
        block_id: BLOCK_IDS.REASON_BLOCK,
        element: {
          type: 'plain_text_input',
          action_id: BLOCK_IDS.REASON_INPUT,
          multiline: true,
        },
        label: { type: 'plain_text', text: INPUT_LABELS.REASON },
      },
    ],
    submit: { type: 'plain_text', text: BUTTON_LABELS.SUBMIT },
  };
}
