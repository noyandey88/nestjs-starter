import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'test-secret',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const result = validateEnv({ ...validEnv });
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.JWT_ACCESS_EXPIRES_IN).toBe(300);
    expect(result.JWT_REFRESH_EXPIRES_IN).toBe(604800);
    expect(result.THROTTLE_TTL).toBe(60);
    expect(result.THROTTLE_LIMIT).toBe(100);
    expect(result.CORS_ORIGINS).toBe('');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_SECRET: 'x' })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('coerces numeric strings from the environment', () => {
    const result = validateEnv({
      ...validEnv,
      PORT: '8080',
      THROTTLE_LIMIT: '5',
    });
    expect(result.PORT).toBe(8080);
    expect(result.THROTTLE_LIMIT).toBe(5);
  });

  it('throws on non-numeric PORT', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });
});
