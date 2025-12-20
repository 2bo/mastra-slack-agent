import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { calendarAgent } from '../agents/calendar-agent';

/**
 * ルーティング判断のスキーマ
 * structured output で型安全にエージェントを選択
 */
const routingSchema = z.object({
  agent: z
    .enum(['calendar', 'email', 'task'])
    .describe('The specialist agent to handle this request'),
  reasoning: z.string().optional().describe('Brief explanation of why this agent was chosen'),
});

export type RoutingDecision = z.infer<typeof routingSchema>;

/**
 * ルーティング専用の軽量Agent
 * structured output でユーザーの意図を判断
 */
const routingAgent = new Agent({
  name: 'Router',
  model: openai('gpt-4o-mini'), // 軽量モデルで十分
  instructions: `
    You are a routing assistant. Analyze the user's request and determine which specialist to use.

    Available specialists:
    - calendar: Google Calendar management (schedule, events, meetings, appointments, time slots, availability)
    - email: Email management (send, read, search, compose, reply to emails)
    - task: Task and project management (todos, tracking, deadlines, project status)

    Choose the most appropriate specialist based on the user's intent.
    If uncertain, default to "calendar".
  `,
});

/**
 * エージェントマップ
 * 将来的に emailAgent, taskAgent を追加する場所
 */
const agentMap: Record<string, Agent> = {
  calendar: calendarAgent,
  // email: emailAgent, // 将来追加
  // task: taskAgent,   // 将来追加
};

/**
 * LLMを使ってユーザークエリを適切なエージェントにルーティング
 * structured output で型安全に判断
 * @param query ユーザーのクエリ
 * @returns 選択されたエージェント
 */
export async function routeToAgent(query: string): Promise<Agent> {
  try {
    // ✅ structured output で型安全にルーティング判断
    const result = await routingAgent.generate(query, {
      structuredOutput: {
        schema: routingSchema,
      },
    });

    const decision: RoutingDecision = result.object;

    console.log(
      `[Router] Selected agent: ${decision.agent} for query: "${query.substring(0, 50)}..."` +
        (decision.reasoning ? `\n  Reasoning: ${decision.reasoning}` : ''),
    );

    // エージェントマップから取得、なければ calendar をフォールバック
    return agentMap[decision.agent] || calendarAgent;
  } catch (error) {
    console.error('[Router] Error during routing, falling back to calendarAgent:', error);
    return calendarAgent;
  }
}
