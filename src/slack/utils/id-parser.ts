import { ACTION_ID_DELIMITER } from '../constants';

export interface ParsedActionId {
  type: string;
  agentName: string;
  runId: string;
  toolCallId: string;
}

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
 * Action ID を解析 (新形式のみ)
 * @param id - "type:agentName:runId:toolCallId" 形式
 * @example approve:assistant:run-123:tc-456
 * @throws {IdParseError} フォーマットが不正な場合
 */
export const parseActionId = (id: string): ParsedActionId => {
  const parts = id.split(ACTION_ID_DELIMITER);

  if (parts.length === 4 && parts.every((p) => p)) {
    const [type, agentName, runId, toolCallId] = parts;
    return { type, agentName, runId, toolCallId };
  }

  throw new IdParseError(
    `Invalid action ID format "${id}". Expected "type:agentName:runId:toolCallId" (e.g. "approve:assistant:run-123:tc-456").`,
    id,
  );
};
