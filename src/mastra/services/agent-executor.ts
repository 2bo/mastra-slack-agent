import { Agent } from '@mastra/core/agent';

export type ApprovalRequiredResult = {
  type: 'approval-required';
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type CompletedResult = { type: 'completed'; text: string };
export type ErrorResult = { type: 'error'; error: Error };
export type AgentExecutionResult = ApprovalRequiredResult | CompletedResult | ErrorResult;

export type StreamCallback = (chunk: string) => Promise<void>;

type AgentStreamOutput = Awaited<ReturnType<Agent['stream']>>;
type StreamIterator = AgentStreamOutput['fullStream'] | AsyncIterable<unknown>;
type AgentStreamChunk = { type: string; runId?: string; payload?: unknown };
type AgentStreamResult = string | ApprovalRequiredResult;

const toError = (error: unknown): Error => {
  return error instanceof Error ? error : new Error(String(error));
};

const normalizeSnapshotError = (error: unknown): Error => {
  if (error instanceof Error && error.message.includes('No snapshot found')) {
    return new Error('Session expired. Please retry your request.');
  }
  return toError(error);
};

const toCompleted = (text: string, fallbackText: string): CompletedResult => ({
  type: 'completed',
  text: text || fallbackText,
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const parseApprovalPayload = (chunk: AgentStreamChunk): ApprovalRequiredResult | null => {
  const payload = chunk.payload;
  if (!isRecord(payload) || !('toolCallId' in payload) || !('toolName' in payload)) {
    return null;
  }

  const args = isRecord(payload['args']) ? payload['args'] : {};

  return {
    type: 'approval-required',
    runId: chunk.runId || '',
    toolCallId: String(payload['toolCallId']),
    toolName: String(payload['toolName']),
    args,
  };
};

/**
 * ストリームを最後まで消費し、テキストまたは承認要求を返す。
 * NOTE: snapshot 永続化のため、ストリームは必ず最後まで消費する必要がある。
 * 不正な approval payload は無視して継続する（例外で中断しない）。
 */
async function handleStream(
  stream: StreamIterator,
  onStreamChunk?: StreamCallback,
): Promise<AgentStreamResult> {
  let fullText = '';
  let approvalResult: ApprovalRequiredResult | null = null;

  for await (const chunk of stream as AsyncIterable<unknown>) {
    const typedChunk = chunk as AgentStreamChunk;

    if (typedChunk.type === 'tool-call-approval' && !approvalResult) {
      approvalResult = parseApprovalPayload(typedChunk);
    }

    if (typedChunk.type === 'text-delta') {
      const payload = typedChunk.payload;
      if (isRecord(payload) && 'text' in payload) {
        const textChunk = String(payload['text']);
        fullText += textChunk;
        if (onStreamChunk) {
          await onStreamChunk(textChunk);
        }
      }
    }
  }

  return approvalResult ?? fullText;
}

export const executeAgent = async (
  agent: Agent,
  query: string,
  context: { resourceId: string; threadId: string },
  onStreamChunk?: StreamCallback,
): Promise<AgentExecutionResult> => {
  try {
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

    return toCompleted(result, 'Done.');
  } catch (error) {
    console.error('[AgentExecutor] Error during agent execution:', error);
    return { type: 'error', error: toError(error) };
  }
};

/**
 * approve/decline 共通: ツールコール応答後のストリームを処理し結果を返す
 */
const resumeToolCallStream = async (
  streamOutput: AgentStreamOutput,
  fallbackText: string,
  onStreamChunk?: StreamCallback,
): Promise<AgentExecutionResult> => {
  const result = await handleStream(streamOutput.fullStream, onStreamChunk);

  // approve/decline 後に再度 approval が来ることは想定外だが、安全に処理する
  if (typeof result === 'object') {
    return toCompleted('Unexpected nested approval request', 'Unexpected nested approval request');
  }

  return toCompleted(result, fallbackText);
};

export const approveToolCall = async (
  agent: Agent,
  runId: string,
  toolCallId: string,
  onStreamChunk?: StreamCallback,
): Promise<AgentExecutionResult> => {
  try {
    const output = await agent.approveToolCall({ runId, toolCallId });
    return await resumeToolCallStream(output, '✅ Completed.', onStreamChunk);
  } catch (error) {
    console.error('[AgentExecutor] Error approving tool call:', error);
    return { type: 'error', error: normalizeSnapshotError(error) };
  }
};

export const declineToolCall = async (
  agent: Agent,
  runId: string,
  toolCallId: string,
  onStreamChunk?: StreamCallback,
): Promise<AgentExecutionResult> => {
  try {
    const output = await agent.declineToolCall({ runId, toolCallId });
    return await resumeToolCallStream(output, 'No response.', onStreamChunk);
  } catch (error) {
    console.error('[AgentExecutor] Error declining tool call:', error);
    return { type: 'error', error: normalizeSnapshotError(error) };
  }
};
