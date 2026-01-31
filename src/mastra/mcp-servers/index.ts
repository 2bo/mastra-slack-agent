import { MCPServer } from '@mastra/mcp';
import { listEvents, searchEvents, createEvent } from '../tools/google-calendar';

export const calendarMcpServer = new MCPServer({
  name: 'calendar-mcp',
  version: '1.0.0',
  description: 'Google Calendar MCP Server - list, search, and create calendar events',
  tools: {
    listEvents,
    searchEvents,
    createEvent,
  },
});
