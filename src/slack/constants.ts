/**
 * Slack UI Constants
 * 集約されたマジックストリング、ブロックID、メッセージテンプレート
 */

// ============================================
// Slack Block Kit IDs
// ============================================

export const BLOCK_IDS = {
  REASON_BLOCK: 'reason_block',
  REASON_INPUT: 'reason_input',
} as const;

// ============================================
// Action ID Formats
// ============================================

export const ACTION_ID_DELIMITER = ':';

export const ACTION_ID_PREFIXES = {
  APPROVE: 'approve',
  REJECT: 'reject',
  REJECT_REASON: 'reject_reason',
} as const;

/**
 * Action ID builder
 * @example buildActionId('approve', runId, toolCallId) => 'approve:abc123:def456'
 */
export function buildActionId(
  prefix: keyof typeof ACTION_ID_PREFIXES,
  runId: string,
  toolCallId: string,
): string {
  return `${ACTION_ID_PREFIXES[prefix]}${ACTION_ID_DELIMITER}${runId}${ACTION_ID_DELIMITER}${toolCallId}`;
}

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

export const MODAL_TITLES = {
  REJECTION_REASON: 'Rejection Reason',
} as const;

export const BUTTON_LABELS = {
  APPROVE: 'Approve',
  REJECT: 'Reject',
  SUBMIT: 'Submit',
} as const;

export const INPUT_LABELS = {
  REASON: 'Please provide a reason or feedback:',
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
  VIEW_HANDLER: '[ViewHandler]',
  MENTION_HANDLER: '[MentionHandler]',
} as const;
