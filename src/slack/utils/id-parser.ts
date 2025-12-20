import { ACTION_ID_DELIMITER } from '../constants';

/**
 * 解析結果の型定義
 */
export interface ParsedActionId {
  type: string;
  runId: string;
  toolCallId: string;
}

/**
 * ID解析エラー
 */
export class IdParseError extends Error {
  constructor(
    message: string,
    public readonly rawId: string,
  ) {
    super(message);
    this.name = 'IdParseError';
  }
}

/**
 * Action ID / Callback ID を解析 (統一関数)
 * @param id - "prefix:runId:toolCallId" 形式の文字列
 * @throws {IdParseError} フォーマットが不正な場合
 */
function parseId(id: string): ParsedActionId {
  const parts = id.split(ACTION_ID_DELIMITER);

  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new IdParseError(`Invalid ID format: expected "type:runId:toolCallId", got "${id}"`, id);
  }

  const [type, runId, toolCallId] = parts;
  return { type, runId, toolCallId };
}

/**
 * Action ID を解析
 */
export const parseActionId = parseId;

/**
 * Callback ID を解析
 */
export const parseCallbackId = parseId;

/**
 * 安全な解析 (エラーの代わりにnullを返す)
 */
export function tryParseActionId(actionId: string): ParsedActionId | null {
  try {
    return parseId(actionId);
  } catch {
    return null;
  }
}
