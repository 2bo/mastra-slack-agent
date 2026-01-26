# Mastra Slack Agent - Agent Development Guide

This guide provides essential information for agentic coding agents working in this repository.

## Project Overview

This is a TypeScript/Node.js project that integrates Slack with AI agents using the Mastra framework. The system provides a personal assistant with calendar access and conversation memory through Slack integration.

**Tech Stack:**

- **Framework:** Mastra (AI agent framework)
- **Runtime:** Node.js ≥ 22.13.0
- **Language:** TypeScript with ES2022
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Database:** LibSQL (SQLite-compatible)
- **Slack SDK:** @slack/bolt
- **AI:** OpenAI GPT-4o

---

## Development Commands

### Essential Commands

```bash
# Type checking (ALWAYS run before committing)
npm run typecheck

# Linting (run before committing)
npm run lint         # Check for issues
npm run lint:fix     # Auto-fix issues

# Formatting
npm run format       # Format all TypeScript files
npm run format:check # Check formatting only

# Building
npm run build        # Production build using Mastra bundler

# Testing
npm test                           # Run all tests
npm test src/path/to/file.test.ts  # Run single test file (use full path)
```

### Development Modes

```bash
# Mastra Playground - browser UI for testing agents
npm run dev

# Slack Bot with hot reload for development
npm run dev:slack

# Production Slack Bot
npm run start:slack
```

**IMPORTANT:** Always run `npm run typecheck` and `npm run lint` before committing. The pre-commit hook enforces this.

---

## Code Style Guidelines

### Import Style

- Use ES6 imports with single quotes
- Group imports: external libraries → internal modules → relative imports
- Import order: `@mastra/*`, `@slack/*`, other external, then local imports

```typescript
import { Agent } from '@mastra/core/agent';
import { WebClient } from '@slack/web-api';
import { openai } from '@ai-sdk/openai';
import { generateThreadId } from '../utils/thread-id';
import { MESSAGES } from '../constants';
```

### Formatting Rules (Prettier)

- Single quotes for strings
- Semicolons required
- Trailing commas: all
- Print width: 100 characters
- Use existing `.prettierrc` configuration

### TypeScript Conventions

- Strict mode enabled
- Use ES2022 features (top-level await, etc.)
- Prefer `const` over `let` when possible
- Use explicit return types for functions in complex logic
- Leverage Zod for runtime validation and TypeScript schemas

### Naming Conventions

- **Files:** kebab-case (`google-calendar.ts`, `mention-handler.ts`)
- **Functions/Variables:** camelCase (`generateThreadId`, `handleMention`)
- **Constants:** UPPER_SNAKE_CASE (`MESSAGES`, `BLOCK_IDS`)
- **Classes/Interfaces:** PascalCase (`MentionHandlerArgs`)
- **Action IDs:** Pattern: `{action}:{agent}:{runId}:{toolCallId}`

### Error Handling

- Use the centralized `handleError` utility from `src/slack/utils/error-handler.ts`
- Log errors with prefix: `LOG_PREFIXES.MENTION_HANDLER`
- Always handle unknown errors as `unknown` type
- Provide user-friendly error messages via Slack UI

```typescript
try {
  // operation
} catch (error) {
  await handleError({
    logPrefix: LOG_PREFIXES.MENTION_HANDLER,
    logMessage: 'Operation failed',
    error,
    client,
    channel,
    messageTs,
  });
}
```

---

## Architecture Patterns

### Directory Structure & Responsibilities

```
src/
├── mastra/           # AI framework layer - pure logic
├── slack/            # Slack integration layer - UI/events only
├── scripts/          # Utility scripts
└── tests/            # Test files
```

### Separation of Concerns

1. **Slack Layer:** UI/UX, event handling, Block Kit components
2. **Service Layer:** Business logic abstraction, streaming, HITL control
3. **Mastra Layer:** AI agents, tools, memory management

**NEVER** mix concerns:

- Slack handlers should not contain agent logic
- Mastra tools should not know about Slack
- Use service layer to bridge between them

### ID Management

Use self-describing IDs that encode all necessary information:

```typescript
// Action ID format: "approve:assistant:run_abc123:call_xyz789"
const actionId = `approve:${agentName}:${runId}:${toolCallId}`;
```

### Constants Management

All magic strings go in `src/slack/constants.ts`:

```typescript
export const BLOCK_IDS = {
  APPROVAL_ACTIONS: 'approval_actions',
} as const;

export const MESSAGES = {
  PROCESSING: '🤔 考え中...',
} as const;
```

---

## Testing Patterns

### Test File Location

- Test files: `*.test.ts` (same directory as source)
- Use Vitest framework
- Mock external dependencies (Google APIs, Slack)

### Test Structure

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks
  });

  it('should do X', async () => {
    // Test implementation
  });
});
```

### Mocking Patterns

- Use `vi.hoisted()` for mocks
- Mock entire modules with `vi.mock()`
- Always clear mocks in `beforeEach`

---

## Memory & Thread Management

### Thread ID Generation

Memory scope is controlled by thread IDs:

```typescript
export function generateThreadId(
  channel: string,
  threadTs: string | undefined,
  ts: string,
): string {
  return `${channel}:${threadTs || ts}`;
}
```

Each Slack thread gets isolated memory space using `channel:thread_ts` format.

---

## Human-in-the-Loop (HITL)

### Approval Flow

1. Tools requiring approval set `requireApproval: true`
2. Agent execution pauses on `tool-call-approval` event
3. Slack UI shows approval buttons with encoded action IDs
4. User action triggers `approveToolCall()` or `declineToolCall()`
5. Agent resumes or stops accordingly

### Tool Approval Pattern

```typescript
export const createEvent = createTool({
  id: 'create-event',
  requireApproval: true, // Triggers HITL flow
  inputSchema: z.object({...}),
  execute: async ({ context, ...args }) => {
    // Implementation
  },
});
```

---

## Environment Variables

Essential `.env` variables:

```bash
# Google Calendar API
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-your-app-token

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Optional
TIMEZONE=Asia/Tokyo
PORT=3000
```

---

## Common Gotchas

### Memory Issues

- Ensure thread IDs include `thread_ts` for replies
- Use `ts` for new conversations
- Memory persists across bot restarts via LibSQL

### Slack API Limits

- Update interval is 500ms for streaming (see `chat-stream.ts`)
- Use rate limiting for frequent updates

### Google OAuth

- Refresh tokens expire - use `get-google-token.ts` script to regenerate
- Ensure OAuth consent screen is configured as "Testing" with your email added

---

## Adding New Features

### New Tools

1. Define in `src/mastra/tools/`
2. Add to agent's `tools` object in `src/mastra/agents/assistant-agent.ts`
3. Set `requireApproval: true` for sensitive operations
4. Update agent instructions if needed

### New Slack Events

1. Create handler in `src/slack/handlers/`
2. Register in `src/index.ts`
3. Use existing patterns for error handling and response

### UI Components

- Use Slack Block Kit format
- Define reusable components in `src/slack/ui/`
- Follow existing `approval-blocks.ts` patterns

---

## Performance Considerations

- Streaming updates limited to 500ms intervals to avoid rate limits
- LibSQL handles concurrent access efficiently
- Vector embeddings are cached for semantic search
- Use ES2022 features for optimal performance

Remember: This codebase prioritizes clear separation of concerns, type safety, and robust error handling. Always follow existing patterns rather than creating new ones.
