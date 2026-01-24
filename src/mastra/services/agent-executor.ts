import { Agent } from '@mastra/core/agent';

export type AgentExecutionResult =
  | {
      type: 'approval-required';
      agentName: string;
      runId: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: 'completed'; text: string }
  | { type: 'error'; error: Error };

export type StreamCallback = (chunk: string) => Promise<void>;

type AgentStreamOutput = Awaited<ReturnType<Agent['stream']>>;
type StreamIterator = AgentStreamOutput['fullStream'] | AsyncIterable<unknown>;

async function handleStream(
  stream: StreamIterator,
  onStreamChunk?: StreamCallback,
): Promise<
  | string
  | {
      type: 'approval-required';
      agentName: string;
      runId: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
> {
  let fullText = '';

  // Use raw stream to iterate
  for await (const chunk of stream as AsyncIterable<unknown>) {
    const typedChunk = chunk as { type: string; runId?: string; payload?: Record<string, unknown> };

    if (typedChunk.type === 'tool-call-approval') {
      const payload = typedChunk.payload;
      if (
        payload &&
        typeof payload === 'object' &&
        'toolCallId' in payload &&
        'toolName' in payload
      ) {
        return {
          type: 'approval-required',
          agentName: 'unified',
          runId: typedChunk.runId || '',
          toolCallId: String(payload['toolCallId']),
          toolName: String(payload['toolName']),
          args: (payload['args'] as Record<string, unknown>) || {},
        };
      }
    }

    if (typedChunk.type === 'text-delta') {
      const payload = typedChunk.payload;
      if (payload && typeof payload === 'object' && 'text' in payload) {
        const textChunk = String(payload['text']);
        fullText += textChunk;
        if (onStreamChunk) {
          await onStreamChunk(textChunk);
        }
      }
    }
  }

  return fullText;
}

export const executeAgent = async (
  agent: Agent,
  query: string,
  context: { resourceId: string; threadId: string },
  onStreamChunk?: StreamCallback,
): Promise<AgentExecutionResult> => {
  try {
    console.log('[AgentExecutor] Memory context:', {
      resource: context.resourceId,
      thread: context.threadId,
    });

    const output = await agent.stream(query, {
      memory: {
        resource: context.resourceId,
        thread: context.threadId,
      },
    });

    const result = await handleStream(output.fullStream, onStreamChunk);

    if (typeof result === 'object') {
      return result;
    }

    return {
      type: 'completed',
      text: result || 'Done.',
    };
  } catch (error) {
    console.error('[AgentExecutor] Error during agent execution:', error);
    return {
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

export const approveToolCall = async (
  agent: Agent,
  runId: string,
  toolCallId: string,
  onStreamChunk?: StreamCallback,
): Promise<string> => {
  try {
    const output = await agent.approveToolCall({
      runId,
      toolCallId,
    });

    const result = await handleStream(output.fullStream, onStreamChunk);
    if (typeof result === 'object') {
      // Approval shouldn't trigger another approval immediately in this simple agent,
      // but if it does, we treat it as done or recurse?
      // For now, assuming approval just returns text is safe for this specific agent structure.
      // But purely for type safety:
      return 'Unexpected nested approval request';
    }

    return result || '✅ Completed.';
  } catch (error) {
    console.error('[AgentExecutor] Error approving tool call:', error);
    if (error instanceof Error && error.message.includes('No snapshot found')) {
      throw new Error('Session expired. Please retry your request.');
    }
    throw error;
  }
};

export const declineToolCall = async (
  agent: Agent,
  runId: string,
  toolCallId: string,
  onStreamChunk?: StreamCallback,
): Promise<string> => {
  try {
    const output = await agent.declineToolCall({
      runId,
      toolCallId,
    });

    const result = await handleStream(output.fullStream, onStreamChunk);
    // Decline shouldn't trigger approval
    if (typeof result === 'object') return 'Unexpected nested approval during decline';

    return result || 'No response.';
  } catch (error) {
    console.error('[AgentExecutor] Error declining tool call:', error);
    if (error instanceof Error && error.message.includes('No snapshot found')) {
      throw new Error('Session expired. Please retry your request.');
    }
    throw error;
  }
};
