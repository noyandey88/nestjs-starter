import { z } from 'zod';
import { APP_MODE } from './app-mode.js';

export const APP_ENVS = [
  'local',
  'test',
  'dev',
  'staging',
  'beta',
  'production',
] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
// NB: z.coerce.boolean() is a trap — it coerces the *string* "false" to true.

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Defaults to the APP_MODE constant (src/config/app-mode.ts) so the
  // validated value matches the stage file that actually loaded.
  APP_ENV: z.enum(APP_ENVS).default(APP_MODE),

  PORT: z.coerce.number().int().positive().default(3000),

  // Logging — values, not name-checks
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .optional(),
  LOG_PRETTY: booleanString,
  LOG_HTTP_BODIES: booleanString,

  SWAGGER_ENABLED: booleanString,

  // Same code everywhere, different numbers per stage file (required).
  THROTTLE_TTL: z.coerce.number().int().positive(),
  THROTTLE_LIMIT: z.coerce.number().int().positive(),

  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(1),
  /** Access-token lifetime in seconds. */
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().int().positive().default(300),
  /** Refresh-token lifetime in seconds. */
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
  /** Comma-separated list of allowed origins. Empty disables CORS. */
  CORS_ORIGINS: z.string().default(''),
  /** @nestjs/observe credentials. Both required to enable telemetry. */
  OBSERVE_APP_KEY: z.string().min(1).optional(),
  OBSERVE_APP_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}
