import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { assistantAgent } from './agents/assistant-agent';
import { calendarMcpServer } from './mcp-servers';
import { authConfig } from './auth';

export const mastra = new Mastra({
  agents: {
    assistantAgent,
  },
  mcpServers: {
    'calendar-mcp': calendarMcpServer,
  },
  server: {
    auth: authConfig,
  },
  scorers: {},
  storage: new LibSQLStore({
    id: 'main-store',
    url: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
