import { APP_MODE } from './app-mode.js';
import { resolveEnvFiles } from './env-files.js';

describe('resolveEnvFiles', () => {
  it('falls back to the APP_MODE constant by default', () => {
    expect(resolveEnvFiles({})).toEqual([
      '.env',
      `env/.env.${APP_MODE}.local`,
      `env/.env.${APP_MODE}`,
    ]);
  });

  it('honors an explicit default stage argument', () => {
    expect(resolveEnvFiles({}, 'beta')).toEqual([
      '.env',
      'env/.env.beta.local',
      'env/.env.beta',
    ]);
  });

  it('returns the cascade for an explicit stage', () => {
    expect(resolveEnvFiles({ APP_ENV: 'staging' })).toEqual([
      '.env',
      'env/.env.staging.local',
      'env/.env.staging',
    ]);
  });

  it('maps NODE_ENV=test to the test stage regardless of APP_ENV', () => {
    expect(resolveEnvFiles({ NODE_ENV: 'test', APP_ENV: 'staging' })).toEqual([
      '.env',
      'env/.env.test.local',
      'env/.env.test',
    ]);
  });

  it('maps APP_ENV=test to the test stage', () => {
    expect(resolveEnvFiles({ APP_ENV: 'test' })).toEqual([
      '.env',
      'env/.env.test.local',
      'env/.env.test',
    ]);
  });

  it('passes an unknown stage through (validation rejects it at boot)', () => {
    expect(resolveEnvFiles({ APP_ENV: 'nonsense' })).toEqual([
      '.env',
      'env/.env.nonsense.local',
      'env/.env.nonsense',
    ]);
  });
});
