import { MESSAGES } from '../constants';
import { runMentionResponseFlow } from '../services/mention-response-service';
import { MentionHandlerArgs } from '../types/handler-args';

/**
 * Slackメンション処理
 * 責務: 入力チェックとサービス呼び出し
 */
export const handleMention = async ({ event, say, client }: MentionHandlerArgs) => {
  const { channel, text, thread_ts, ts, team, user } = event;

  // ユーザークエリ抽出
  const cleanText = text.replace(/<@.*?>/g, '').trim();
  if (!cleanText) {
    await say(MESSAGES.EMPTY_MENTION);
    return;
  }

  if (!user) {
    await say('Unable to identify user');
    return;
  }

  await runMentionResponseFlow({
    client,
    channel,
    threadTs: thread_ts,
    eventTs: ts,
    teamId: team,
    userId: user,
    cleanText,
  });
};
