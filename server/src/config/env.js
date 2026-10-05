import { z } from 'zod';

// Load .env using Node's built-in loader (Node >= 20.12). Missing file is fine
// in production where variables come from the host (Render, Railway, ...).
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // Comma-separated DNS servers. Fixes "querySrv ECONNREFUSED" on ISPs that
  // block SRV lookups for mongodb+srv:// URIs. Example: 8.8.8.8,1.1.1.1
  DNS_SERVERS: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Public URL of the frontend - used in email links.
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  // Extra allowed CORS origins (comma-separated). CLIENT_URL is always allowed.
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  // "lax" works when the frontend is served from the same site as the API
  // (single service, or Vercel rewrites /api -> backend). Use "none" only if
  // the browser calls the API on a different domain directly.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
  GROQ_INSIGHTS_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),

  // Email. If SMTP_HOST is empty, emails are printed to the server console.
  EMAIL_TRANSPORT: z.enum(['smtp', 'console', 'json']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('SpendWise <no-reply@spendwise.local>'),

  // Monthly summary scheduling
  ENABLE_CRON: bool(true),
  CRON_TIMEZONE: z.string().default('Asia/Kolkata'),
  // Secret for POST /api/jobs/* (external cron, e.g. cron-job.org, when the
  // host sleeps on a free plan). Leave empty to disable those endpoints.
  CRON_SECRET: z.string().optional(),

  // Serve the built React app from ../client/dist (single-service deploy).
  SERVE_CLIENT: bool(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n❌ Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCopy server/.env.example to server/.env and fill in the values.\n');
  process.exit(1);
}

const env = parsed.data;

env.isProd = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';
env.emailTransport = env.EMAIL_TRANSPORT || (env.SMTP_HOST ? 'smtp' : 'console');
env.aiEnabled = Boolean(env.GROQ_API_KEY);
env.corsOrigins = [
  new URL(env.CLIENT_URL).origin,
  ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : []),
];

export default env;
