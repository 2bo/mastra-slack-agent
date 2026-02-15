import { describe, expect, it } from 'vitest';
import { IdParseError, parseActionId } from './id-parser';

describe('parseActionId', () => {
  it('新形式 type:agentName:runId:toolCallId を解析する', () => {
    expect(parseActionId('approve:assistant:run-123:tc-456')).toEqual({
      type: 'approve',
      agentName: 'assistant',
      runId: 'run-123',
      toolCallId: 'tc-456',
    });
  });

  it('旧3部形式は IdParseError になる', () => {
    expect(() => parseActionId('approve:run-123:tc-456')).toThrow(IdParseError);
  });

  it('不正フォーマット時は移行例を含むメッセージを返す', () => {
    try {
      parseActionId('approve::run-123:tc-456');
      throw new Error('expected parseActionId to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IdParseError);
      expect((error as IdParseError).rawId).toBe('approve::run-123:tc-456');
      expect((error as IdParseError).message).toContain('type:agentName:runId:toolCallId');
      expect((error as IdParseError).message).toContain('approve:assistant:run-123:tc-456');
    }
  });
});
