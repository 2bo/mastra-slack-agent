import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { assistantAgent } from './agents/assistant-agent';

export const mastra = new Mastra({
  agents: {
    assistantAgent,
  },
  scorers: {},
  storage: new LibSQLStore({
    id: 'main-store',
    // Turso (cloud) or local file database
    url: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
