import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ASSISTANT_AGENT_ID, ASSISTANT_AGENT_NAME } from '../constants';
import { createEvent, listEvents, searchEvents } from '../tools/google-calendar';

export const assistantAgent = new Agent({
  id: ASSISTANT_AGENT_ID,
  name: ASSISTANT_AGENT_NAME,
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
      url: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    options: {
      observationalMemory: {
        model: 'openai/gpt-4o',
        scope: 'thread',
      },
    },
  }),
  tools: {
    listEvents,
    searchEvents,
    createEvent: { ...createEvent, requireApproval: true },
  },
});
