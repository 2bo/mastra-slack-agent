/**
 * Mastra Agent Constants
 * エージェント関連の定数・デフォルト値
 */

// ============================================
// Agent Names
// ============================================

/**
 * デフォルトエージェント名
 * 新形式のID生成で使用
 */
export const DEFAULT_AGENT_NAME = 'unified';

/**
 * 後方互換性用のレガシーエージェント名
 * 旧形式（3部）のIDを解析する際に使用
 */
export const LEGACY_AGENT_NAME = 'calendar';

// ============================================
// Log Prefixes
// ============================================

export const MASTRA_LOG_PREFIXES = {
  AGENT_EXECUTOR: '[AgentExecutor]',
  ID_PARSER: '[IdParser]',
} as const;
