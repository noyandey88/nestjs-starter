import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DRIZZLE_ORM, PG_POOL } from './database.constants.js';
import * as schema from './schema/index.js';

export const PoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      max: config.get<number>('DB_POOL_MAX'),
      // Fail a checkout instead of queueing forever when the database is
      // unreachable; a hung Postgres must not hang every request.
      connectionTimeoutMillis: config.get<number>('DB_CONNECT_TIMEOUT_MS'),
      // Server-side cap on any single statement.
      statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS'),
      idleTimeoutMillis: 30_000,
    }),
};

export const DatabaseProvider: Provider = {
  provide: DRIZZLE_ORM,
  inject: [PG_POOL],
  useFactory: (pool: Pool) => drizzle(pool, { schema }),
};

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
