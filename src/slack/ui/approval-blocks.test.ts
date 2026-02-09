import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebClient } from '@slack/web-api';
import {
  buildApprovalBlocks,
  buildRejectionModal,
  postApprovalRequest,
  updateApprovalMessage,
  ToolCallApprovalPayload,
} from './approval-blocks';
import { BUTTON_LABELS, MESSAGES, BLOCK_IDS } from '../constants';

// ============================================
// テストデータ
// ============================================

const samplePayload: ToolCallApprovalPayload = {
  agentName: 'assistant',
  runId: 'run-123',
  toolCallId: 'tc-456',
  toolName: 'createEvent',
  args: { summary: 'Meeting', startDateTime: '2025-01-01T10:00:00Z' },
};

const createMockClient = () =>
  ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  }) as unknown as WebClient;

// ============================================
// buildApprovalBlocks (純粋関数)
// ============================================

describe('buildApprovalBlocks', () => {
  it('section と actions の2ブロックを返す', () => {
    const blocks = buildApprovalBlocks(samplePayload);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('section');
    expect(blocks[1].type).toBe('actions');
  });

  it('section にツール名と引数が含まれる', () => {
    const blocks = buildApprovalBlocks(samplePayload);
    const section = blocks[0] as { type: string; text: { text: string } };
    expect(section.text.text).toContain('createEvent');
    expect(section.text.text).toContain('Meeting');
  });

  it('approve / reject ボタンが正しい action_id を持つ', () => {
    const blocks = buildApprovalBlocks(samplePayload);
    const actions = blocks[1] as { type: string; elements: Array<{ action_id: string }> };
    expect(actions.elements[0].action_id).toBe('approve:assistant:run-123:tc-456');
    expect(actions.elements[1].action_id).toBe('reject:assistant:run-123:tc-456');
  });

  it('ボタンラベルが定数と一致する', () => {
    const blocks = buildApprovalBlocks(samplePayload);
    const actions = blocks[1] as {
      type: string;
      elements: Array<{ text: { text: string }; style: string }>;
    };
    expect(actions.elements[0].text.text).toBe(BUTTON_LABELS.APPROVE);
    expect(actions.elements[0].style).toBe('primary');
    expect(actions.elements[1].text.text).toBe(BUTTON_LABELS.REJECT);
    expect(actions.elements[1].style).toBe('danger');
  });
});

// ============================================
// buildRejectionModal (純粋関数)
// ============================================

describe('buildRejectionModal', () => {
  const metadata = {
    agentName: 'assistant',
    runId: 'run-123',
    toolCallId: 'tc-456',
    channelId: 'C1234',
    messageTs: '1234.5678',
    threadTs: '1234.0000',
  };

  it('modal ビューを返す', () => {
    const modal = buildRejectionModal(metadata);
    expect(modal.type).toBe('modal');
  });

  it('callback_id に reject_reason プレフィックスが含まれる', () => {
    const modal = buildRejectionModal(metadata);
    expect(modal.callback_id).toBe('reject_reason:assistant:run-123:tc-456');
  });

  it('private_metadata にシリアライズされたメタデータが入る', () => {
    const modal = buildRejectionModal(metadata);
    const parsed = JSON.parse(modal.private_metadata!);
    expect(parsed.channelId).toBe('C1234');
    expect(parsed.runId).toBe('run-123');
  });

  it('テキスト入力ブロックがある', () => {
    const modal = buildRejectionModal(metadata);
    expect(modal.blocks).toHaveLength(1);
    const input = modal.blocks[0] as { block_id: string; element: { type: string } };
    expect(input.block_id).toBe(BLOCK_IDS.REASON_BLOCK);
    expect(input.element.type).toBe('plain_text_input');
  });

  it('submit ボタンラベルが定数と一致する', () => {
    const modal = buildRejectionModal(metadata);
    expect(modal.submit?.text).toBe(BUTTON_LABELS.SUBMIT);
  });
});

// ============================================
// postApprovalRequest (WebClient 呼び出し)
// ============================================

describe('postApprovalRequest', () => {
  let client: WebClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('chat.postMessage を呼び出して ts を返す', async () => {
    const result = await postApprovalRequest(client, 'C1234', '1234.0000', samplePayload);

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C1234',
        thread_ts: '1234.0000',
      }),
    );
    expect(result.ts).toBe('1234.5678');
  });

  it('メッセージにブロックが含まれる', async () => {
    await postApprovalRequest(client, 'C1234', '1234.0000', samplePayload);

    const call = vi.mocked(client.chat.postMessage).mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >;
    expect(call.blocks).toHaveLength(2);
  });
});

// ============================================
// updateApprovalMessage (WebClient 呼び出し)
// ============================================

describe('updateApprovalMessage', () => {
  let client: WebClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('approved の場合 承認メッセージで更新する', async () => {
    await updateApprovalMessage(client, 'C1234', '1234.5678', 'approved');

    expect(client.chat.update).toHaveBeenCalledWith({
      channel: 'C1234',
      ts: '1234.5678',
      text: `${MESSAGES.APPROVED_EMOJI} ${MESSAGES.APPROVED_TEXT}`,
      blocks: [],
    });
  });

  it('rejected の場合 却下メッセージで更新する', async () => {
    await updateApprovalMessage(client, 'C1234', '1234.5678', 'rejected');

    expect(client.chat.update).toHaveBeenCalledWith({
      channel: 'C1234',
      ts: '1234.5678',
      text: `${MESSAGES.REJECTED_EMOJI} ${MESSAGES.REJECTED_TEXT}`,
      blocks: [],
    });
  });
});
