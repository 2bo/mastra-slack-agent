import 'dotenv/config';

// But wait, 'src/mastra/index.ts' exports 'mastra'.
// We don't have an initMastra/startMastra function there but 'mastra' instance.
// We probably need to start the server or similar if needed, but for Bolt we just use the instance.
// However, logging initialization might be good.

import { initSlackApp, startSlackApp } from './slack/bolt-app';
import { handleAction } from './slack/handlers/action-handler';
import { handleMention } from './slack/handlers/mention-handler';
import { handleViewSubmission } from './slack/handlers/view-handler';

async function main() {
  console.log('Starting Mastra Slack Agent...');

  // Initialize Slack App
  const app = initSlackApp();

  // Register Event Handlers
  app.event('app_mention', handleMention);

  // Register Action Handlers
  // We use regex to match dynamic action IDs
  app.action(/approve:.+/, handleAction);
  app.action(/reject:.+/, handleAction);

  // Register View Submission Handlers
  app.view(/reject_reason:.+/, handleViewSubmission);

  // Start Slack App
  await startSlackApp(app);

  console.log('🚀 Application is ready!');
}

main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
