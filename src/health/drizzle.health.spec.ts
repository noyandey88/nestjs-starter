import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle.health';
import { DRIZZLE_ORM } from 'src/database/database.constants';

describe('DrizzleHealthIndicator', () => {
  const createIndicator = async (execute: jest.Mock) => {
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
    const indicator = await createIndicator(jest.fn().mockResolvedValue([]));
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('up');
  });

  it('reports down when the query throws', async () => {
    const indicator = await createIndicator(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('down');
  });
});
