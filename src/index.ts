import 'dotenv/config';

import { initSlackApp, startSlackApp } from './slack/bolt-app';
import { ACTION_ID_PREFIXES } from './slack/constants';
import { handleAction } from './slack/handlers/action-handler';
import { handleMention } from './slack/handlers/mention-handler';

const APPROVE_ACTION_RE = new RegExp(`^${ACTION_ID_PREFIXES.APPROVE}:.+`);
const REJECT_ACTION_RE = new RegExp(`^${ACTION_ID_PREFIXES.REJECT}:.+`);

async function main() {
  console.log('Starting Mastra Slack Agent...');

  // Initialize Slack App
  const app = initSlackApp();

  // Register Event Handlers
  app.event('app_mention', handleMention);

  // Register Action Handlers
  // We use regex to match dynamic action IDs
  app.action(APPROVE_ACTION_RE, handleAction);
  app.action(REJECT_ACTION_RE, handleAction);

  // Start Slack App
  await startSlackApp(app);

  console.log('🚀 Application is ready!');
}

main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
