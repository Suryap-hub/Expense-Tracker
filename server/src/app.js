import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import env from './config/env.js';
import logger from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { sanitizeBody } from './middleware/validate.js';
import aiRoutes from './routes/ai.js';
import analyticsRoutes from './routes/analytics.js';
import authRoutes from './routes/auth.js';
import budgetRoutes from './routes/budgets.js';
import expenseRoutes from './routes/expenses.js';
import jobRoutes from './routes/jobs.js';
import userRoutes from './routes/users.js';
import { CATEGORIES, PAYMENT_METHODS } from './utils/categories.js';
import { CURRENCY_CODES } from './utils/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' || !req.url.startsWith('/api') },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
      maxAge: 86400,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);

  // ---------------------------------------------------------------- API
  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down', uptime: Math.round(process.uptime()) });
  });

  app.get('/api/meta', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ categories: CATEGORIES, paymentMethods: PAYMENT_METHODS, currencies: CURRENCY_CODES, aiEnabled: env.aiEnabled });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/users/me', userRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api', notFoundHandler);

  // -------------------------------------------- built React app (optional)
  if (env.SERVE_CLIENT && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    app.use(
      '/assets',
      express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    // SPA fallback: any non-API GET serves index.html so client routes work on refresh.
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
    logger.info('Serving frontend from client/dist');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
