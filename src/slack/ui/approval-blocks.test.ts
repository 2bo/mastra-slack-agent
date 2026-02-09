import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebClient } from '@slack/web-api';
import {
  buildApprovalBlocks,
  buildRejectionModal,
  postApprovalRequest,
  updateApprovalMessage,
  ToolCallApprovalPayload,
} from './approval-blocks';
import { MESSAGES } from '../constants';

const SAMPLE_PAYLOAD: ToolCallApprovalPayload = {
  agentName: 'assistant',
  runId: 'run-123',
  toolCallId: 'tc-456',
  toolName: 'createEvent',
  args: { summary: 'Meeting', startDateTime: '2025-01-01T10:00:00Z' },
};

const SAMPLE_METADATA = {
  agentName: 'assistant',
  runId: 'run-123',
  toolCallId: 'tc-456',
  channelId: 'C1234',
  messageTs: '1234.5678',
  threadTs: '1234.0000',
};

const createMockClient = () =>
  ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  }) as unknown as WebClient;

describe('buildApprovalBlocks', () => {
  it('必要な2ブロックを返し、approve/reject の action_id を埋め込む', () => {
    const blocks = buildApprovalBlocks(SAMPLE_PAYLOAD);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('section');
    expect(blocks[1].type).toBe('actions');
    expect((blocks[0] as { text: { text: string } }).text.text).toContain('createEvent');

    const actions = blocks[1] as { type: string; elements: Array<{ action_id: string }> };
    expect(actions.elements[0].action_id).toBe('approve:assistant:run-123:tc-456');
    expect(actions.elements[1].action_id).toBe('reject:assistant:run-123:tc-456');
  });
});

describe('buildRejectionModal', () => {
  it('callback/private_metadata/input を含む modal を構築する', () => {
    const modal = buildRejectionModal(SAMPLE_METADATA);
    const privateMetadata = JSON.parse(modal.private_metadata ?? '{}') as Record<string, string>;

    expect(modal.type).toBe('modal');
    expect(modal.callback_id).toBe('reject_reason:assistant:run-123:tc-456');
    expect(privateMetadata.channelId).toBe('C1234');
    expect(modal.blocks).toHaveLength(1);
  });
});

describe('postApprovalRequest', () => {
  let client: WebClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('chat.postMessage を呼び出し、thread付きで ts を返す', async () => {
    const result = await postApprovalRequest(client, 'C1234', '1234.0000', SAMPLE_PAYLOAD);

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C1234',
        thread_ts: '1234.0000',
      }),
    );
    expect(result.ts).toBe('1234.5678');
    expect(vi.mocked(client.chat.postMessage).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        blocks: expect.any(Array),
      }),
    );
  });
});

describe('updateApprovalMessage', () => {
  let client: WebClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it.each([
    ['approved', `${MESSAGES.APPROVED_EMOJI} ${MESSAGES.APPROVED_TEXT}`],
    ['rejected', `${MESSAGES.REJECTED_EMOJI} ${MESSAGES.REJECTED_TEXT}`],
  ] as const)('%s の場合、対応するメッセージで更新する', async (status, expectedText) => {
    await updateApprovalMessage(client, 'C1234', '1234.5678', status);

    expect(client.chat.update).toHaveBeenCalledWith({
      channel: 'C1234',
      ts: '1234.5678',
      text: expectedText,
      blocks: [],
    });
  });
});
