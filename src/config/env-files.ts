/**
 * Computes the ordered envFilePath list for ConfigModule. Earlier entries
 * take precedence in @nestjs/config, and injected process env always
 * beats every file. Missing files are skipped silently, so an unknown
 * stage falls through to validateEnv, which rejects it at boot.
 * NODE_ENV=test (Jest) always resolves to the `test` stage.
 */
export function resolveEnvFiles(env: {
  APP_ENV?: string;
  NODE_ENV?: string;
}): string[] {
  const stage = env.NODE_ENV === 'test' ? 'test' : (env.APP_ENV ?? 'local');
  return ['.env', `env/.env.${stage}.local`, `env/.env.${stage}`];
}
