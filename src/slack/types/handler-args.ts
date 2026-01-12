import {
  BlockAction,
  SayFn,
  SlackActionMiddlewareArgs,
  SlackEventMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import { WebClient } from '@slack/web-api';

/**
 * app_mention イベントハンドラーの引数型
 *
 * @example
 * ```typescript
 * export const handleMention = async ({ event, say, client }: MentionHandlerArgs) => {
 *   await say({ text: 'Hello!' });
 * };
 * ```
 */
export type MentionHandlerArgs = SlackEventMiddlewareArgs<'app_mention'> & {
  say: SayFn;
  client: WebClient;
};

/**
 * ブロックアクション（ボタンクリックなど）ハンドラーの引数型
 *
 * @example
 * ```typescript
 * export const handleAction = async ({ action, ack, client }: ActionHandlerArgs) => {
 *   await ack();
 *   await client.chat.postMessage({ ... });
 * };
 * ```
 */
export type ActionHandlerArgs = SlackActionMiddlewareArgs<BlockAction> & {
  client: WebClient;
};

/**
 * モーダル送信ハンドラーの引数型
 *
 * @example
 * ```typescript
 * export const handleViewSubmission = async ({ ack, view, client }: ViewHandlerArgs) => {
 *   await ack();
 *   const value = view.state.values.block_id.input_id.value;
 * };
 * ```
 */
export type ViewHandlerArgs = SlackViewMiddlewareArgs<ViewSubmitAction> & {
  client: WebClient;
};
