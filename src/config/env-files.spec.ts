import { resolveEnvFiles } from './env-files';

describe('resolveEnvFiles', () => {
  it('returns the local cascade by default', () => {
    expect(resolveEnvFiles({})).toEqual([
      '.env',
      'env/.env.local.local',
      'env/.env.local',
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
