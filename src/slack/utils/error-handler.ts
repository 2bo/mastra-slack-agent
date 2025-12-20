import { WebClient } from '@slack/web-api';
import { MESSAGES } from '../constants';

/**
 * エラーメッセージをフォーマット
 */
export function formatErrorMessage(error: unknown): string {
  return `${MESSAGES.ERROR_PREFIX}${error instanceof Error ? error.message : String(error)}`;
}

/**
 * 統合エラーハンドラー
 * ログ出力 + Slackへのエラー通知を一括処理
 */
export async function handleError(params: {
  logPrefix: string;
  logMessage: string;
  error: unknown;
  client: WebClient;
  channel: string;
  threadTs?: string;
  messageTs?: string;
}): Promise<void> {
  const { logPrefix, logMessage, error, client, channel, threadTs, messageTs } = params;

  // ログ出力
  console.error(`${logPrefix} ${logMessage}:`, error);

  // Slackへの通知
  const errorText = formatErrorMessage(error);

  try {
    if (messageTs) {
      // メッセージ更新
      await client.chat.update({ channel, ts: messageTs, text: errorText });
    } else {
      // 新規投稿
      await client.chat.postMessage({ channel, thread_ts: threadTs, text: errorText });
    }
  } catch (notifyError) {
    console.error('[ErrorHandler] Failed to notify error:', notifyError);
  }
}
