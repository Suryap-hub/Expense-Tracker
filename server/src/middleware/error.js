import { ZodError } from 'zod';
import env from '../config/env.js';
import logger from '../config/logger.js';

export class AppError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, opts) => new AppError(400, msg, opts);
export const unauthorized = (msg = 'Authentication required', opts) => new AppError(401, msg, opts);
export const forbidden = (msg = 'Forbidden', opts) => new AppError(403, msg, opts);
export const notFound = (msg = 'Not found', opts) => new AppError(404, msg, opts);
export const conflict = (msg, opts) => new AppError(409, msg, opts);

export function formatZodError(err) {
  return err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

export function notFoundHandler(req, _res, next) {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let body = { error: err.message || 'Something went wrong', code: err.code };

  if (err instanceof ZodError) {
    status = 400;
    body = { error: 'Validation failed', code: 'VALIDATION_ERROR', details: formatZodError(err) };
  } else if (err instanceof AppError) {
    if (err.details) body.details = err.details;
  } else if (err.name === 'ValidationError') {
    status = 400;
    body = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err.name === 'CastError') {
    status = 400;
    body = { error: `Invalid ${err.path}`, code: 'INVALID_ID' };
  } else if (err.code === 11000) {
    status = 409;
    body = { error: 'Duplicate value', code: 'DUPLICATE' };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: 'Malformed JSON body', code: 'BAD_JSON' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { error: 'Request body too large', code: 'TOO_LARGE' };
  }

  if (status >= 500) {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
    if (env.isProd) body = { error: 'Internal server error', code: 'INTERNAL' };
  }

  body.requestId = req.id;
  res.status(status).json(body);
}
