/**
 * 承認/却下フローで使用するメタデータ構造
 */
export interface ApprovalMetadata {
  agentName: string;
  runId: string;
  toolCallId: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

/**
 * メタデータをJSON文字列にシリアライズ
 */
export const serializeMetadata = (metadata: ApprovalMetadata): string => {
  return JSON.stringify(metadata);
};

/**
 * JSON文字列をメタデータにデシリアライズ
 * @throws {Error} パースまたはバリデーションに失敗した場合
 */
export const deserializeMetadata = (jsonString: string): ApprovalMetadata => {
  const parsed: unknown = JSON.parse(jsonString);

  if (!isApprovalMetadata(parsed)) {
    throw new Error('Invalid metadata: missing required fields');
  }

  return parsed;
};

const isApprovalMetadata = (value: unknown): value is ApprovalMetadata => {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.agentName === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.toolCallId === 'string' &&
    typeof obj.channelId === 'string' &&
    typeof obj.messageTs === 'string' &&
    (obj.threadTs === undefined || typeof obj.threadTs === 'string')
  );
};
