import 'dotenv/config';
import { assistantAgent } from '../mastra/agents/assistant-agent';

const testAgentHITL = async () => {
  console.log('--- Testing Agent HITL (via assistantAgent) ---');

  // Test 1: assistantAgent 経由で createEvent を呼び、tool-call-approval が発火するか
  console.log('\n1. Testing tool-call-approval event via assistantAgent...');

  const output = await assistantAgent.stream(
    '明日15時に「技術打ち合わせ」というミーティングを1時間予約して',
    {
      memory: {
        resource: 'routing-test-channel',
        thread: 'routing-test-thread',
      },
    },
  );

  let approvalDetected = false;
  let runId: string | undefined;
  let toolCallId: string | undefined;

  for await (const chunk of output.fullStream) {
    console.log(`[Stream] ${chunk.type}`);

    if (chunk.type === 'tool-call-approval') {
      console.log('✅ tool-call-approval event detected!');
      console.log('Payload:', JSON.stringify(chunk.payload, null, 2));

      approvalDetected = true;
      runId = chunk.runId;
      toolCallId = chunk.payload.toolCallId;

      // ここで承認フロー開始（実際のSlackでは承認ボタン表示）
      break; // 承認待ちで止まる
    }

    if (chunk.type === 'text-delta') {
      console.log(`[Text] ${chunk.payload.text}`);
    }
  }

  if (!approvalDetected) {
    console.error('❌ tool-call-approval event was NOT detected!');
    console.error('Check if createEvent has requireApproval: true');
    return;
  }

  // Test 2: 承認して実行再開
  console.log('\n2. Approving tool call...');

  if (!runId || !toolCallId) {
    console.error('❌ Missing runId or toolCallId');
    return;
  }

  const approveOutput = await assistantAgent.approveToolCall({
    runId,
    toolCallId,
  });

  let fullText = '';

  for await (const chunk of approveOutput.fullStream) {
    console.log(`[Approve Stream] ${chunk.type}`);

    if (chunk.type === 'text-delta') {
      fullText += chunk.payload.text;
    }
  }

  console.log('\n✅ Approval flow completed!');
  console.log('Final response:', fullText || '(no text response)');

  // Test 3: 却下フロー
  console.log('\n3. Testing rejection flow...');

  const rejectOutput = await assistantAgent.stream('明後日10時にミーティング', {
    memory: {
      resource: 'test-channel',
      thread: 'test-thread-2',
    },
  });

  let rejectRunId: string | undefined;
  let rejectToolCallId: string | undefined;

  for await (const chunk of rejectOutput.fullStream) {
    if (chunk.type === 'tool-call-approval') {
      console.log('✅ tool-call-approval detected for rejection test');
      rejectRunId = chunk.runId;
      rejectToolCallId = chunk.payload.toolCallId;
      break;
    }
  }

  if (rejectRunId && rejectToolCallId) {
    console.log('Declining tool call...');

    const declineOutput = await assistantAgent.declineToolCall({
      runId: rejectRunId,
      toolCallId: rejectToolCallId,
    });

    let declineText = '';

    for await (const chunk of declineOutput.fullStream) {
      if (chunk.type === 'text-delta') {
        declineText += chunk.payload.text;
      }
    }

    console.log('✅ Decline flow completed!');
    console.log('Agent response after rejection:', declineText || '(no response)');
  }

  console.log('\n--- All Tests Completed ---');
};

testAgentHITL().catch(console.error);
