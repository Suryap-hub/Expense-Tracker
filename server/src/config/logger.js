import pino from 'pino';
import env from './env.js';

let transport;
if (!env.isProd && !env.isTest) {
  try {
    await import('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };
  } catch {
    transport = undefined; // pino-pretty is a dev dependency
  }
}

const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.token'],
    censor: '[redacted]',
  },
  transport,
});

export default logger;
