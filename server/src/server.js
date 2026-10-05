import env from './config/env.js';
import logger from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { verifyMailer } from './services/email/mailer.js';
import { startOutboxWorker, stopOutboxWorker } from './services/email/outbox.js';

async function main() {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 API listening on http://localhost:${env.PORT}  (AI: ${env.aiEnabled ? 'Groq' : 'off - basic parser'}, email: ${env.emailTransport})`);
  });
  // Keep-alive longer than typical load balancer idle timeouts (Render/AWS ~60s)
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  startOutboxWorker();
  startScheduler();
  verifyMailer();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    stopScheduler();
    stopOutboxWorker();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
