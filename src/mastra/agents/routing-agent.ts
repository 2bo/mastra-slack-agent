import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { calendarAgent } from './calendar-agent';

/**
 * ルーティングエージェント
 * ユーザーの意図を判断して適切な専門エージェントに委譲する
 *
 * 現在の専門エージェント:
 * - calendarAgent: Google Calendar 管理
 *
 * 将来の拡張予定:
 * - emailAgent: メール管理
 * - taskAgent: タスク管理
 */
export const routingAgent = new Agent({
  name: 'Routing Agent',
  instructions: `
    You are a routing assistant that delegates user requests to specialized agents.

    Available specialists:
    - calendarAgent: Manages Google Calendar (schedule, events, appointments, availability)

    Your job:
    1. Understand user intent
    2. Choose the appropriate specialist agent
    3. Pass the COMPLETE user request to that agent without modification
    4. Let the specialist agent handle all clarifications and confirmations

    IMPORTANT: Always delegate immediately - do NOT ask for clarification yourself.
    The specialist agents are capable of asking for any missing information.
  `,
  model: openai('gpt-4o-mini'),
  agents: {
    calendarAgent,
    // 将来ここに emailAgent, taskAgent などを追加
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:mastra.db',
    }),
  }),
});
