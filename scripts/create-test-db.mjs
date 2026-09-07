// Creates the database named in DATABASE_URL if it does not exist.
// Invoked via `pnpm db:create:test`, which loads env/.env.test first.
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);
url.pathname = '/postgres';

const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  await client.query(`CREATE DATABASE "${dbName}"`);
} catch (err) {
  if (err.code !== '42P04') {
    console.error(err);
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
