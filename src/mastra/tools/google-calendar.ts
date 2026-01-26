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
  execute: async (inputData) => {
    console.log('[listEvents] Starting with input:', JSON.stringify(inputData));
    try {
      const calendar = getCalendarClient();
      console.log('[listEvents] Calendar client initialized');
      const response = await calendar.events.list({
        calendarId: getCalendarId(),
        timeMin: inputData.timeMin || new Date().toISOString(),
        maxResults: inputData.limit || 10,
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
      console.error('[listEvents] Error:', error);
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
  execute: async (inputData) => {
    try {
      const calendar = getCalendarClient();
      const response = await calendar.events.list({
        calendarId: getCalendarId(),
        q: inputData.query,
        timeMin: inputData.timeMin || new Date().toISOString(),
        timeMax: inputData.timeMax,
        maxResults: inputData.limit || 10,
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
    description: z.string().nullish().describe('Description of the event'),
  }),
  execute: async (inputData) => {
    console.log('[DEBUG] createEvent called with inputData:', JSON.stringify(inputData, null, 2));
    try {
      const calendar = getCalendarClient();
      console.log('[DEBUG] Calendar client initialized.');

      const event = {
        summary: inputData.summary,
        description: inputData.description,
        start: {
          dateTime: inputData.startDateTime,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: inputData.endDateTime,
          timeZone: 'Asia/Tokyo',
        },
      };

      console.log('[DEBUG] Preparing to insert event:', JSON.stringify(event, null, 2));

      const response = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody: event,
      });

      console.log('[DEBUG] Event insert successful. Response ID:', response.data.id);

      return {
        message: 'Event created successfully',
        eventLink: response.data.htmlLink,
        id: response.data.id,
      };
    } catch (error) {
      console.error('[DEBUG] Error in createEvent:', error);
      const err = error as { response?: { data?: unknown } };
      if (err && typeof err === 'object' && 'response' in err) {
        // Log usage details from the error response if available (axios/googleapis error)
        console.error(
          '[DEBUG] API Error Response Body:',
          JSON.stringify(err.response?.data, null, 2),
        );
      }
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
});
