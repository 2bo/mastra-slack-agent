import { describe, it, expect } from 'vitest';
import { serializeMetadata, deserializeMetadata, ApprovalMetadata } from './metadata';

const validMetadata: ApprovalMetadata = {
  agentName: 'assistant',
  runId: 'run-123',
  toolCallId: 'tc-456',
  channelId: 'C1234',
  messageTs: '1234.5678',
  threadTs: '1234.0000',
};

describe('serializeMetadata / deserializeMetadata', () => {
  it('シリアライズ → デシリアライズで元のデータに戻る', () => {
    const json = serializeMetadata(validMetadata);
    const result = deserializeMetadata(json);
    expect(result).toEqual(validMetadata);
  });

  it('threadTs がない場合も正しく動作する', () => {
    const withoutThread: ApprovalMetadata = {
      agentName: validMetadata.agentName,
      runId: validMetadata.runId,
      toolCallId: validMetadata.toolCallId,
      channelId: validMetadata.channelId,
      messageTs: validMetadata.messageTs,
    };
    const json = serializeMetadata(withoutThread);
    const result = deserializeMetadata(json);
    expect(result).toEqual(withoutThread);
  });

  it('serializeMetadata は JSON 文字列を返す', () => {
    const json = serializeMetadata(validMetadata);
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(validMetadata);
  });

  describe('deserializeMetadata のバリデーション', () => {
    it('不正な JSON でエラー', () => {
      expect(() => deserializeMetadata('not-json')).toThrow();
    });

    it('必須フィールドが欠けている場合エラー', () => {
      const incomplete = JSON.stringify({ agentName: 'test' });
      expect(() => deserializeMetadata(incomplete)).toThrow('Invalid metadata');
    });

    it('null でエラー', () => {
      expect(() => deserializeMetadata('null')).toThrow('Invalid metadata');
    });

    it('フィールドの型が違う場合エラー', () => {
      const wrongType = JSON.stringify({
        agentName: 'test',
        runId: 123, // number instead of string
        toolCallId: 'tc',
        channelId: 'C1',
        messageTs: '1234',
      });
      expect(() => deserializeMetadata(wrongType)).toThrow('Invalid metadata');
    });
  });
});
