import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { createEvent, listEvents, searchEvents } from '../tools/google-calendar';

export const assistantAgent = new Agent({
  id: 'assistant-agent',
  name: 'Assistant Agent',
  instructions: () => {
    const now = new Date();
    const timezone = process.env.TIMEZONE || 'Asia/Tokyo';
    const currentDate = now.toLocaleString('sv-SE', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });

    return `
      You are a personal assistant with calendar access and conversation memory.
      Current date: ${currentDate} (${timezone})

      For calendar requests, use listEvents for schedule overview, searchEvents for specific events,
      and createEvent to add events (check conflicts first). The createEvent tool has built-in approval.

      For general conversation, answer directly using your memory of past interactions.
    `;
  },
  model: openai('gpt-4o'),
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'memory-store',
      url: 'file:mastra.db',
    }),
    vector: new LibSQLVector({
      id: 'memory-vector',
      url: 'file:mastra.db',
    }),
    embedder: openai.embedding('text-embedding-3-small'),
    options: {
      lastMessages: 50,
      semanticRecall: {
        scope: 'thread',
        topK: 5,
        messageRange: 100,
      },
    },
  }),
  tools: {
    listEvents,
    searchEvents,
    createEvent: { ...createEvent, requireApproval: true },
  },
});
