import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseActionId, parseCallbackId, IdParseError } from './id-parser';

describe('parseActionId', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('新形式 (4パート): type:agentName:runId:toolCallId', () => {
    it('正しくパースできる', () => {
      const result = parseActionId('approve:unified:run-123:tool-456');

      expect(result).toEqual({
        type: 'approve',
        agentName: 'unified',
        runId: 'run-123',
        toolCallId: 'tool-456',
      });
    });

    it('reject タイプも正しくパースできる', () => {
      const result = parseActionId('reject:calendar:abc:def');

      expect(result).toEqual({
        type: 'reject',
        agentName: 'calendar',
        runId: 'abc',
        toolCallId: 'def',
      });
    });

    it('reject_reason タイプも正しくパースできる', () => {
      const result = parseActionId('reject_reason:assistant:run-id:call-id');

      expect(result).toEqual({
        type: 'reject_reason',
        agentName: 'assistant',
        runId: 'run-id',
        toolCallId: 'call-id',
      });
    });

    it('警告ログは出力されない', () => {
      parseActionId('approve:unified:run-123:tool-456');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('レガシー形式 (3パート): type:runId:toolCallId', () => {
    it('正しくパースし、agentName は "calendar" にデフォルト設定される', () => {
      const result = parseActionId('approve:run-123:tool-456');

      expect(result).toEqual({
        type: 'approve',
        agentName: 'calendar',
        runId: 'run-123',
        toolCallId: 'tool-456',
      });
    });

    it('警告ログが出力される', () => {
      parseActionId('approve:run-123:tool-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Legacy 3-part ID detected'),
      );
    });
  });

  describe('エラーケース', () => {
    it('2パートの場合は IdParseError をスロー', () => {
      expect(() => parseActionId('approve:run-123')).toThrow(IdParseError);
    });

    it('5パート以上の場合は IdParseError をスロー', () => {
      expect(() => parseActionId('a:b:c:d:e')).toThrow(IdParseError);
    });

    it('空文字列の場合は IdParseError をスロー', () => {
      expect(() => parseActionId('')).toThrow(IdParseError);
    });

    it('空のパートが含まれる場合は IdParseError をスロー (4パート)', () => {
      expect(() => parseActionId('approve::run-123:tool-456')).toThrow(IdParseError);
    });

    it('空のパートが含まれる場合は IdParseError をスロー (3パート)', () => {
      expect(() => parseActionId('approve::tool-456')).toThrow(IdParseError);
    });

    it('IdParseError には rawId が含まれる', () => {
      try {
        parseActionId('invalid-id');
      } catch (error) {
        expect(error).toBeInstanceOf(IdParseError);
        expect((error as IdParseError).rawId).toBe('invalid-id');
      }
    });

    it('エラーメッセージにフォーマット情報が含まれる', () => {
      expect(() => parseActionId('bad')).toThrow(
        /expected "type:agentName:runId:toolCallId" or legacy "type:runId:toolCallId"/,
      );
    });
  });
});

describe('parseCallbackId', () => {
  it('parseActionId と同じロジックで動作する', () => {
    const result = parseCallbackId('reject_reason:unified:run-abc:call-xyz');

    expect(result).toEqual({
      type: 'reject_reason',
      agentName: 'unified',
      runId: 'run-abc',
      toolCallId: 'call-xyz',
    });
  });
});
