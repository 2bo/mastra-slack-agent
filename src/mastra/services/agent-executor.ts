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
  context?: string,
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
  const logPrefix = context ? `[handleStream:${context}]` : '[handleStream]';

  console.log(`${logPrefix} Starting stream processing`);

  // Store approval info if detected - we must consume the entire stream before returning
  let approvalResult: {
    type: 'approval-required';
    agentName: string;
    runId: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  } | null = null;

  // Use raw stream to iterate - MUST consume entire stream for snapshot to be saved
  for await (const chunk of stream as AsyncIterable<unknown>) {
    const typedChunk = chunk as { type: string; runId?: string; payload?: Record<string, unknown> };

    // Log all chunk types for debugging
    console.log(
      `${logPrefix} Chunk type: ${typedChunk.type}`,
      typedChunk.runId ? `runId: ${typedChunk.runId}` : '',
    );

    if (typedChunk.type === 'tool-call-approval' && !approvalResult) {
      const payload = typedChunk.payload;
      console.log(`${logPrefix} tool-call-approval payload:`, JSON.stringify(payload));
      if (
        payload &&
        typeof payload === 'object' &&
        'toolCallId' in payload &&
        'toolName' in payload
      ) {
        console.log(`${logPrefix} Detected approval-required for tool: ${payload['toolName']}`);
        // Store the approval result but continue consuming the stream
        approvalResult = {
          type: 'approval-required',
          agentName: 'unified',
          runId: typedChunk.runId || '',
          toolCallId: String(payload['toolCallId']),
          toolName: String(payload['toolName']),
          args: (payload['args'] as Record<string, unknown>) || {},
        };
      }
    }

    if (typedChunk.type === 'tool-call') {
      console.log(`${logPrefix} tool-call:`, JSON.stringify(typedChunk.payload));
    }

    if (typedChunk.type === 'tool-result') {
      console.log(`${logPrefix} tool-result:`, JSON.stringify(typedChunk.payload));
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

  console.log(`${logPrefix} Stream completed. Full text length: ${fullText.length}`);

  // Return approval result if one was detected during stream processing
  if (approvalResult) {
    console.log(`${logPrefix} Returning approval-required after stream completed`);
    return approvalResult;
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

    const result = await handleStream(output.fullStream, onStreamChunk, 'executeAgent');

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

    const result = await handleStream(output.fullStream, onStreamChunk, 'approveToolCall');
    if (typeof result === 'object') {
      // Approval shouldn't trigger another approval immediately in this simple agent,
      // but if it does, we treat it as done or recurse?
      // For now, assuming approval just returns text is safe for this specific agent structure.
      // But purely for type safety:
      console.log('[approveToolCall] Unexpected nested approval:', JSON.stringify(result));
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

    const result = await handleStream(output.fullStream, onStreamChunk, 'declineToolCall');
    // Decline shouldn't trigger approval
    if (typeof result === 'object') {
      console.log('[declineToolCall] Unexpected nested approval:', JSON.stringify(result));
      return 'Unexpected nested approval during decline';
    }

    return result || 'No response.';
  } catch (error) {
    console.error('[AgentExecutor] Error declining tool call:', error);
    if (error instanceof Error && error.message.includes('No snapshot found')) {
      throw new Error('Session expired. Please retry your request.');
    }
    throw error;
  }
};
