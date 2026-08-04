# NestJS Starter

Production-ready NestJS 11 starter template with Drizzle ORM (PostgreSQL), JWT authentication with single-use refresh tokens, and a consistent API response envelope.

## Features

- **Auth** — register/login, short-lived JWT access tokens, single-use refresh tokens (revoked on use), logout-everywhere
- **Drizzle ORM** — typed schema, generated SQL migrations, Drizzle Studio
- **Validated config** — boot fails fast with a clear error if required env vars are missing
- **Security** — helmet, config-driven CORS, global rate limiting (stricter on auth endpoints)
- **Observability** — structured pino logs (secrets redacted), `GET /health` with DB ping, graceful shutdown
- **Consistent responses** — every endpoint returns `{ success, status, message, payload }`
- **Swagger** — interactive docs at `/api`
- **Tested** — unit tests plus a full e2e flow; CI runs lint, tests, build, and migrations
- **Docker** — multi-stage image + compose stack

## Quickstart

```bash
pnpm install
cp .env.example .env          # set JWT_SECRET (and DATABASE_URL if not using compose)
docker compose up -d postgres
pnpm db:migrate
pnpm start:dev                # http://localhost:3000, Swagger at /api
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | Secret for signing access tokens |
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` / `production` / `test` |
| `JWT_ACCESS_EXPIRES_IN` | no | `300` | Access-token lifetime (seconds) |
| `JWT_REFRESH_EXPIRES_IN` | no | `604800` | Refresh-token lifetime (seconds) |
| `CORS_ORIGINS` | no | _(empty)_ | Comma-separated allowed origins; empty disables CORS |
| `THROTTLE_TTL` | no | `60` | Rate-limit window (seconds) |
| `THROTTLE_LIMIT` | no | `100` | Max requests per window |

## Project structure

```
src/
  auth/       login, register, refresh-token revocation, AuthGuard
  user/       authenticated user profile (GET /users/me)
  course/     demo resource — copy this to add your own
  database/   drizzle provider (DRIZZLE_ORM), schema/, pool lifecycle
  health/     GET /health (terminus + db ping)
  common/     response envelope, interceptor, exception filter
  config/     env validation
```

## Adding a new resource

Use `src/course/` as the reference. For a resource `book`:

1. Define the table in `src/database/schema/book.schema.ts` and **re-export it from `src/database/schema/index.ts`** (required for the runtime query API, e.g. `db.query.books` — `database.provider.ts` builds the Drizzle instance from that barrel). Migrations don't need it: `drizzle.config.ts` points at `src/database/schema/*` directly, so drizzle-kit discovers new schema files via that glob regardless.
2. `pnpm db:generate && pnpm db:migrate`
3. Create `src/book/` with `book.module.ts`, `book.controller.ts`, `book.service.ts`, `book.repository.ts`, and `dto/`. Inject the db in the repository via `@Inject(DRIZZLE_ORM)`; derive row types with `InferSelectModel`.
4. Guard routes with `@Auth()`; declare each route's success contract with `@ApiEnvelope(YourResponseDto, { message: '...' })` and error codes with `@ApiErrorResponses(...)`; return the raw service result — the global interceptor wraps it in the `{ success, status, message, payload }` envelope.
5. Register the module in `AppModule`; add unit tests mirroring `course.service.spec.ts`.

## Testing

```bash
pnpm test                # unit tests
docker compose up -d postgres
pnpm db:create:test && pnpm db:migrate:test
pnpm test:e2e            # full API flow against the test database
```

## Docker

```bash
docker build -t nestjs-starter .
JWT_SECRET=your-secret docker compose --profile full up   # postgres + api
```

Once postgres is up, apply migrations once (postgres publishes 5432 to the host): `pnpm db:migrate`.

## License

UNLICENSED — use as a template for your own projects.
