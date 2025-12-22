import { ACTION_ID_DELIMITER } from '../constants';

/**
 * 解析結果の型定義
 */
export interface ParsedActionId {
  type: string;
  agentName: string;
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
 * 後方互換性: 3部形式と4部形式の両方に対応
 * @param id - "prefix:agentName:runId:toolCallId" または "prefix:runId:toolCallId" (旧形式)
 * @throws {IdParseError} フォーマットが不正な場合
 */
const parseId = (id: string): ParsedActionId => {
  const parts = id.split(ACTION_ID_DELIMITER);

  // 後方互換性: 旧形式 (3部) "type:runId:toolCallId"
  if (parts.length === 3 && parts.every((p) => p)) {
    const [type, runId, toolCallId] = parts;
    console.warn(`[IdParser] Legacy 3-part ID detected: "${id}", defaulting to calendar agent`);
    return { type, agentName: 'calendar', runId, toolCallId };
  }

  // 新形式 (4部) "type:agentName:runId:toolCallId"
  if (parts.length === 4 && parts.every((p) => p)) {
    const [type, agentName, runId, toolCallId] = parts;
    return { type, agentName, runId, toolCallId };
  }

  throw new IdParseError(
    `Invalid ID format: expected "type:agentName:runId:toolCallId" or legacy "type:runId:toolCallId", got "${id}"`,
    id,
  );
};

/**
 * Action ID を解析
 */
export const parseActionId = parseId;

export const parseCallbackId = parseId;
