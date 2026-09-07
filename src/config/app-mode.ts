import type { AppEnv } from './env.validation.js';

/**
 * The instance switch. Change this value to pick which env/.env.<mode>
 * file the app and the drizzle CLI load — no shell variables needed:
 *
 *   export const APP_MODE: AppEnv = 'production';
 *
 * Overrides (highest first): NODE_ENV=test always forces the `test`
 * instance (vitest/CI), and an injected APP_ENV env var beats this
 * constant (the Docker image sets APP_ENV=production).
 */
export const APP_MODE: AppEnv = 'local';
