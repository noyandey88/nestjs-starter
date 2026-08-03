import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { DRIZZLE_ORM } from './database.constants';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const DatabaseProvider: Provider = {
  provide: DRIZZLE_ORM,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const databaseUrl = config.get<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString: databaseUrl,
    });

    return drizzle(pool, { schema });
  },
};
