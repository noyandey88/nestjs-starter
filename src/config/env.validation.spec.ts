import { APP_MODE } from './app-mode.js';
import { validateEnv, APP_ENVS } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
  JWT_SECRET: 'secret',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '100',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const env = validateEnv(base);
    expect(env.APP_ENV).toBe(APP_MODE);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_PRETTY).toBe(false);
    expect(env.LOG_HTTP_BODIES).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe(300);
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe(604800);
    expect(env.CORS_ORIGINS).toBe('');
  });

  it('accepts each known APP_ENV stage', () => {
    for (const stage of APP_ENVS) {
      expect(validateEnv({ ...base, APP_ENV: stage }).APP_ENV).toBe(stage);
    }
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => validateEnv({ ...base, APP_ENV: 'qa' })).toThrow(/APP_ENV/);
  });

  it('parses boolean flags from strings — including the "false" trap', () => {
    expect(validateEnv({ ...base, LOG_PRETTY: 'true' }).LOG_PRETTY).toBe(true);
    expect(validateEnv({ ...base, LOG_PRETTY: 'false' }).LOG_PRETTY).toBe(
      false,
    );
  });

  it('rejects non true/false boolean flag values', () => {
    expect(() => validateEnv({ ...base, SWAGGER_ENABLED: 'yes' })).toThrow(
      /SWAGGER_ENABLED/,
    );
  });

  it('requires THROTTLE_TTL and THROTTLE_LIMIT', () => {
    const { THROTTLE_TTL: _t, ...withoutTtl } = base;
    expect(() => validateEnv(withoutTtl)).toThrow(/THROTTLE_TTL/);
    const { THROTTLE_LIMIT: _l, ...withoutLimit } = base;
    expect(() => validateEnv(withoutLimit)).toThrow(/THROTTLE_LIMIT/);
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({ ...base, PORT: '8080', THROTTLE_TTL: '30' });
    expect(env.PORT).toBe(8080);
    expect(env.THROTTLE_TTL).toBe(30);
  });

  it('rejects a non-URL DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('enforces the LOG_LEVEL enum and leaves it optional', () => {
    expect(validateEnv(base).LOG_LEVEL).toBeUndefined();
    expect(validateEnv({ ...base, LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
    expect(() => validateEnv({ ...base, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
