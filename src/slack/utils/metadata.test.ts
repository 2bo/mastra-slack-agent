import { describe, it, expect } from 'vitest';
import { serializeMetadata, deserializeMetadata, type ApprovalMetadata } from './metadata';

describe('serializeMetadata', () => {
  it('メタデータを JSON 文字列にシリアライズする', () => {
    const metadata: ApprovalMetadata = {
      agentName: 'unified',
      runId: 'run-123',
      toolCallId: 'tool-456',
      channelId: 'C12345',
      messageTs: '1703001234.567890',
    };

    const result = serializeMetadata(metadata);

    expect(result).toBe(JSON.stringify(metadata));
    expect(JSON.parse(result)).toEqual(metadata);
  });

  it('threadTs が含まれるメタデータもシリアライズできる', () => {
    const metadata: ApprovalMetadata = {
      agentName: 'calendar',
      runId: 'run-abc',
      toolCallId: 'call-xyz',
      channelId: 'C67890',
      messageTs: '1703001234.567890',
      threadTs: '1703001230.000000',
    };

    const result = serializeMetadata(metadata);
    const parsed = JSON.parse(result);

    expect(parsed.threadTs).toBe('1703001230.000000');
  });

  it('特殊文字を含むデータも正しくシリアライズできる', () => {
    const metadata: ApprovalMetadata = {
      agentName: 'test-agent',
      runId: 'run-with-special-"chars"',
      toolCallId: 'call/with/slashes',
      channelId: 'C12345',
      messageTs: '1703001234.567890',
    };

    const result = serializeMetadata(metadata);
    const parsed = JSON.parse(result);

    expect(parsed.runId).toBe('run-with-special-"chars"');
    expect(parsed.toolCallId).toBe('call/with/slashes');
  });
});

describe('deserializeMetadata', () => {
  it('有効な JSON 文字列をメタデータにデシリアライズする', () => {
    const metadata: ApprovalMetadata = {
      agentName: 'unified',
      runId: 'run-123',
      toolCallId: 'tool-456',
      channelId: 'C12345',
      messageTs: '1703001234.567890',
    };
    const jsonString = JSON.stringify(metadata);

    const result = deserializeMetadata(jsonString);

    expect(result).toEqual(metadata);
  });

  it('threadTs を含むメタデータもデシリアライズできる', () => {
    const metadata: ApprovalMetadata = {
      agentName: 'calendar',
      runId: 'run-abc',
      toolCallId: 'call-xyz',
      channelId: 'C67890',
      messageTs: '1703001234.567890',
      threadTs: '1703001230.000000',
    };
    const jsonString = JSON.stringify(metadata);

    const result = deserializeMetadata(jsonString);

    expect(result.threadTs).toBe('1703001230.000000');
  });

  describe('エラーケース', () => {
    it('不正な JSON の場合はエラーをスロー', () => {
      expect(() => deserializeMetadata('not valid json')).toThrow(SyntaxError);
    });

    it('空文字列の場合はエラーをスロー', () => {
      expect(() => deserializeMetadata('')).toThrow(SyntaxError);
    });

    it('agentName が欠けている場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        runId: 'run-123',
        toolCallId: 'tool-456',
        channelId: 'C12345',
        messageTs: '1703001234.567890',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('runId が欠けている場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 'unified',
        toolCallId: 'tool-456',
        channelId: 'C12345',
        messageTs: '1703001234.567890',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('toolCallId が欠けている場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 'unified',
        runId: 'run-123',
        channelId: 'C12345',
        messageTs: '1703001234.567890',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('channelId が欠けている場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 'unified',
        runId: 'run-123',
        toolCallId: 'tool-456',
        messageTs: '1703001234.567890',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('messageTs が欠けている場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 'unified',
        runId: 'run-123',
        toolCallId: 'tool-456',
        channelId: 'C12345',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('agentName が文字列でない場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 123,
        runId: 'run-123',
        toolCallId: 'tool-456',
        channelId: 'C12345',
        messageTs: '1703001234.567890',
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('threadTs が文字列でない場合はエラーをスロー', () => {
      const invalid = JSON.stringify({
        agentName: 'unified',
        runId: 'run-123',
        toolCallId: 'tool-456',
        channelId: 'C12345',
        messageTs: '1703001234.567890',
        threadTs: 12345,
      });

      expect(() => deserializeMetadata(invalid)).toThrow('Invalid metadata');
    });

    it('null の場合はエラーをスロー', () => {
      expect(() => deserializeMetadata('null')).toThrow('Invalid metadata');
    });

    it('配列の場合はエラーをスロー', () => {
      expect(() => deserializeMetadata('[]')).toThrow('Invalid metadata');
    });
  });
});
