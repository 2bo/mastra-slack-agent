import { WebClient, KnownBlock } from '@slack/web-api';

/**
 * Slack Chat Stream APIのクライアントインターフェース
 * 型安全性を向上させた定義
 */
export interface SlackChatStreamClient {
  postEphemeral(params: { channel: string; user: string; text: string }): Promise<unknown>;
  postMessage(params: {
    channel: string;
    thread_ts?: string;
    text: string;
    blocks?: KnownBlock[];
  }): Promise<{ ts?: string }>;
  update(params: {
    channel: string;
    ts: string;
    text?: string;
    blocks?: KnownBlock[];
  }): Promise<unknown>;
  startStream(params: {
    channel: string;
    thread_ts: string;
    markdown_text?: string;
    recipient_team_id?: string;
    recipient_user_id?: string;
  }): Promise<{ ts?: string }>;
  appendStream(params: { channel: string; ts: string; markdown_text: string }): Promise<unknown>;
  stopStream(params: {
    channel: string;
    ts: string;
    markdown_text?: string;
    blocks?: KnownBlock[];
  }): Promise<unknown>;
}

/**
 * WebClientからChat Stream Clientを取得
 * @param client - Slack WebClient
 * @returns Chat Stream Client (型キャストで安全性を確保)
 */
export function getChatStreamClient(client: WebClient): SlackChatStreamClient {
  // WebClient の chat API を SlackChatStreamClient として扱う
  // 実行時には互換性があるため、型キャストを使用
  return client.chat as unknown as SlackChatStreamClient;
}
