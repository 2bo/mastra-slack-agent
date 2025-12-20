import { Agent } from '@mastra/core/agent';

/**
 * エージェント実行結果の型定義
 */
export type AgentExecutionResult =
  | {
      type: 'approval-required';
      runId: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: 'completed'; text: string }
  | { type: 'error'; error: Error };

/**
 * エージェント実行サービス
 * Slack層から独立してエージェントを実行し、結果を返す
 */
export class AgentExecutor {
  /**
   * エージェントを実行し、承認待ちまたは完了まで処理
   * @param agent 実行するエージェント
   * @param query ユーザークエリ
   * @param context 実行コンテキスト (resourceId, threadId)
   * @returns 実行結果
   */
  async execute(
    agent: Agent,
    query: string,
    context: { resourceId: string; threadId: string },
  ): Promise<AgentExecutionResult> {
    try {
      const output = await agent.stream(query, {
        resourceId: context.resourceId,
        threadId: context.threadId,
      });

      let fullText = '';

      for await (const chunk of output.fullStream) {
        // ケース1: 承認が必要 (requireApproval: true のツール)
        if (chunk.type === 'tool-call-approval') {
          const payload = chunk.payload;

          return {
            type: 'approval-required',
            runId: chunk.runId,
            toolCallId: payload.toolCallId,
            toolName: payload.toolName,
            args: payload.args,
          };
        }

        // ケース2: テキスト応答
        if (chunk.type === 'text-delta') {
          fullText += chunk.payload.text;
        }

        // ケース3: ツール実行結果 (承認不要ツール)
        // chunk.type === 'tool-result' の場合は必要に応じて処理
      }

      // 最終レスポンス
      return {
        type: 'completed',
        text: fullText || 'Done.',
      };
    } catch (error) {
      console.error('[AgentExecutor] Error during agent execution:', error);
      return {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * ツール呼び出しを承認して実行を再開
   * @param agent 実行するエージェント
   * @param runId 実行ID
   * @param toolCallId ツール呼び出しID
   * @returns 実行結果テキスト
   */
  async approveToolCall(agent: Agent, runId: string, toolCallId: string): Promise<string> {
    try {
      const output = await agent.approveToolCall({
        runId,
        toolCallId,
      });

      let fullText = '';

      for await (const chunk of output.fullStream) {
        if (chunk.type === 'text-delta') {
          fullText += chunk.payload.text;
        }
      }

      return fullText || '✅ Completed.';
    } catch (error) {
      console.error('[AgentExecutor] Error approving tool call:', error);
      throw error;
    }
  }

  /**
   * ツール呼び出しを却下して実行を再開
   * @param agent 実行するエージェント
   * @param runId 実行ID
   * @param toolCallId ツール呼び出しID
   * @returns 実行結果テキスト
   */
  async declineToolCall(agent: Agent, runId: string, toolCallId: string): Promise<string> {
    try {
      const output = await agent.declineToolCall({
        runId,
        toolCallId,
      });

      let fullText = '';

      for await (const chunk of output.fullStream) {
        if (chunk.type === 'text-delta') {
          fullText += chunk.payload.text;
        }
      }

      return fullText || 'No response.';
    } catch (error) {
      console.error('[AgentExecutor] Error declining tool call:', error);
      throw error;
    }
  }
}

// シングルトンインスタンス
export const agentExecutor = new AgentExecutor();
