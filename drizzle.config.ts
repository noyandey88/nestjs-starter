import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolveEnvFiles } from './src/config/env-files';

config({ path: resolveEnvFiles(process.env) });

export default defineConfig({
  schema: './src/database/schema/*',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
