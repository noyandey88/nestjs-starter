import { vi, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle.health.js';
import { DRIZZLE_ORM } from '../database/database.constants.js';

describe('DrizzleHealthIndicator', () => {
  const createIndicator = async (execute: Mock) => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      providers: [
        DrizzleHealthIndicator,
        { provide: DRIZZLE_ORM, useValue: { execute } },
      ],
    }).compile();
    return moduleRef.get(DrizzleHealthIndicator);
  };

  it('reports up when SELECT 1 succeeds', async () => {
    const indicator = await createIndicator(vi.fn().mockResolvedValue([]));
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('up');
  });

  it('reports down when the query throws', async () => {
    const indicator = await createIndicator(
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('down');
  });
});
