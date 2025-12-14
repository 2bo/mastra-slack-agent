import { createTool } from '@mastra/core/tools';
import { google } from 'googleapis';
import { z } from 'zod';

const getOAuth2Client = () => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)');
  }

  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  return oAuth2Client;
};

const getCalendarClient = () => {
  const auth = getOAuth2Client();
  return google.calendar({ version: 'v3', auth });
};

// Helper to get calendar ID, defaulting to primary
const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';

export const listEvents = createTool({
  id: 'listEvents',
  description: "List upcoming events from the user's Google Calendar.",
  inputSchema: z.object({
    limit: z.number().optional().describe('Max number of events to return. Default 10.'),
    timeMin: z.string().optional().describe('ISO string for start time. Defaults to now.'),
  }),
  execute: async ({ context }) => {
    try {
      const calendar = getCalendarClient();
      const response = await calendar.events.list({
        calendarId: getCalendarId(),
        timeMin: context.timeMin || new Date().toISOString(),
        maxResults: context.limit || 10,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Tokyo', // Request response in JST if possible, though ISO strings are absolute
      });

      const events = response.data.items || [];
      if (events.length === 0) {
        return { message: 'No upcoming events found.' };
      }

      return {
        events: events.map((event) => ({
          summary: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          id: event.id,
        })),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
});

export const searchEvents = createTool({
  id: 'searchEvents',
  description:
    'Search for events in the google calendar using a query string and optional time range.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Free text search term to find events (e.g., "team meeting", "lunch").'),
    timeMin: z
      .string()
      .optional()
      .describe('Start of the search range in ISO format. Defaults to now.'),
    timeMax: z.string().optional().describe('End of the search range in ISO format.'),
    limit: z.number().optional().describe('Max number of events to return. Default 10.'),
  }),
  execute: async ({ context }) => {
    try {
      const calendar = getCalendarClient();
      const response = await calendar.events.list({
        calendarId: getCalendarId(),
        q: context.query,
        timeMin: context.timeMin || new Date().toISOString(),
        timeMax: context.timeMax,
        maxResults: context.limit || 10,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Tokyo',
      });

      const events = response.data.items || [];
      if (events.length === 0) {
        return { message: 'No matching events found.' };
      }

      return {
        events: events.map((event) => ({
          summary: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          id: event.id,
          description: event.description,
          location: event.location,
        })),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
});

export const createEvent = createTool({
  id: 'createEvent',
  description: "Create a new event in the user's Google Calendar.",
  requireApproval: true,
  inputSchema: z.object({
    summary: z.string().describe('Title of the event'),
    startDateTime: z
      .string()
      .describe('Start time in ISO format (e.g., 2025-12-15T10:00:00+09:00)'),
    endDateTime: z.string().describe('End time in ISO format (e.g., 2025-12-15T11:00:00+09:00)'),
    description: z.string().optional().describe('Description of the event'),
  }),
  execute: async ({ context }) => {
    try {
      const calendar = getCalendarClient();
      const event = {
        summary: context.summary,
        description: context.description,
        start: {
          dateTime: context.startDateTime,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: context.endDateTime,
          timeZone: 'Asia/Tokyo',
        },
      };

      const response = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody: event,
      });

      return {
        message: 'Event created successfully',
        eventLink: response.data.htmlLink,
        id: response.data.id,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
});
