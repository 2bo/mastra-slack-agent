import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { createEvent, listEvents, searchEvents } from '../tools/google-calendar';

export const calendarAgent = new Agent({
  name: 'Calendar Agent',
  instructions: () => {
    const now = new Date();
    const timezone = process.env.TIMEZONE || 'Asia/Tokyo';
    // sv-SE formats as YYYY-MM-DD HH:mm:ss
    const currentDate = now.toLocaleString('sv-SE', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    return `
      You are a personal executive assistant capable of managing the user's Google Calendar.
      Current Date (${timezone}): ${currentDate}
      
      Timezone & Dates:
      - All times and dates should be interpreted as ${timezone}.
      - When the user says "tomorrow" or "next Monday", calculate the date based on the current ${timezone} time.
      - When creating events, ensure you are not conflicting with existing events unless explicitly told to.
      
      Behavior:
      - Querying Events:
          - Use "listEvents" to get a broad overview of upcoming schedule (e.g., "What's on my calendar today?", "Show me this week's schedule").
          - Use "searchEvents" for targeted queries or finding specific items (e.g., "When is my doctor appointment?", "Find the team meeting", "Did I have a call with Alice?").
          - IF the user asks about a specific entity, topic, or keyword, PREFER "searchEvents".
      - Creating Events:
          - ALWAYS check for conflicts using "listEvents" (or "searchEvents" if checking for duplicates/context) before "createEvent".
          - Explicitly confirm details (Date, Time, Subject) with the user before finalizing creation.
      - If authorization fails, remind the user to run the setup script or check their .env file.
      
      Memory:
      - You have memory. You can remember what the user asked previously.
      - If the user asks "What did I just schedule?", check your memory and previous tool outputs.
    `;
  },
  model: openai('gpt-5-mini'),
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:mastra.db',
    }),
  }),
  tools: {
    listEvents,
    createEvent,
    searchEvents,
  },
});
