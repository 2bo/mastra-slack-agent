/**
 * Slackスレッド用の一意なメモリスコープIDを生成
 *
 * Slackでは、スレッド内の返信にはthread_tsがあり、チャンネル内の新規メッセージには
 * thread_tsがありません。この関数は両方のケースを処理し、安定した一意なIDを生成します。
 *
 * @param channel - Slackチャンネル ID (例: "C12345ABCD")
 * @param thread_ts - スレッドタイムスタンプ（スレッド内の返信の場合）
 * @param ts - メッセージタイムスタンプ（新規スレッドの場合のフォールバック）
 * @returns 形式: "channel:timestamp" (例: "C12345:1703001234.567890")
 *
 * @example
 * // スレッド内の返信
 * generateThreadId('C12345', '1703001234.567890', '1703001235.123456')
 * // => 'C12345:1703001234.567890'
 *
 * @example
 * // チャンネル内の新規メッセージ（スレッドルート）
 * generateThreadId('C12345', undefined, '1703001235.123456')
 * // => 'C12345:1703001235.123456'
 */
export const generateThreadId = (
  channel: string,
  thread_ts: string | undefined,
  ts: string,
): string => {
  // thread_ts が存在する場合はスレッド内、存在しない場合は新規スレッド
  const threadTimestamp = thread_ts || ts;
  return `${channel}:${threadTimestamp}`;
};
