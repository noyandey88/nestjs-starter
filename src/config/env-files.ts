import { APP_MODE } from './app-mode.js';

/**
 * Computes the ordered envFilePath list for ConfigModule. Earlier entries
 * take precedence in @nestjs/config, and injected process env always
 * beats every file. Missing files are skipped silently, so an unknown
 * stage falls through to validateEnv, which rejects it at boot.
 *
 * Stage selection: NODE_ENV=test (Jest) always wins; an injected APP_ENV
 * env var comes next; otherwise the APP_MODE constant
 * (src/config/app-mode.ts) decides — edit that file to switch instances.
 */
export function resolveEnvFiles(
  env: {
    APP_ENV?: string;
    NODE_ENV?: string;
  },
  defaultStage: string = APP_MODE,
): string[] {
  const stage =
    env.NODE_ENV === 'test' ? 'test' : (env.APP_ENV ?? defaultStage);
  return ['.env', `env/.env.${stage}.local`, `env/.env.${stage}`];
}
