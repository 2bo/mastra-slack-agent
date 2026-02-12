/**
 * Slack UI Constants
 * 集約されたマジックストリング、ブロックID、メッセージテンプレート
 */

// ============================================
// Action ID Formats
// ============================================

export const ACTION_ID_DELIMITER = ':';

export const ACTION_ID_PREFIXES = {
  APPROVE: 'approve',
  REJECT: 'reject',
} as const;

/**
 * Action ID builder
 * @example buildActionId('APPROVE', 'calendar', runId, toolCallId) => 'approve:calendar:abc123:def456'
 */
export const buildActionId = (
  prefix: keyof typeof ACTION_ID_PREFIXES,
  agentName: string,
  runId: string,
  toolCallId: string,
): string => {
  return `${ACTION_ID_PREFIXES[prefix]}${ACTION_ID_DELIMITER}${agentName}${ACTION_ID_DELIMITER}${runId}${ACTION_ID_DELIMITER}${toolCallId}`;
};

// ============================================
// UI Messages & Emojis
// ============================================

export const MESSAGES = {
  // Processing states
  PROCESSING: ':thinking_face: Processing...',
  WAITING_APPROVAL: '⏸️ Waiting for approval...',

  // Completion states
  COMPLETED: '✅ Completed.',
  REJECTED_PREFIX: '❌ Rejected. Agent response:\n',
  ERROR_PREFIX: '❌ Error: ',

  // Default responses
  EMPTY_MENTION: 'Hello! How can I help you today?',
  NO_RESPONSE: 'No response.',

  // Approval states
  APPROVED_EMOJI: ':white_check_mark:',
  REJECTED_EMOJI: ':x:',
  APPROVED_TEXT: 'Approved',
  REJECTED_TEXT: 'Rejected',
} as const;

export const BUTTON_LABELS = {
  APPROVE: 'Approve',
  REJECT: 'Reject',
} as const;

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_PORT = 3000;

// ============================================
// Log Prefixes (structured logging準備用)
// ============================================

export const LOG_PREFIXES = {
  ACTION_HANDLER: '[ActionHandler]',
  MENTION_HANDLER: '[MentionHandler]',
} as const;
