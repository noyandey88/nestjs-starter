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
cp .env.example .env          # optional: personal overrides only — env/.env.local already has working compose defaults
docker compose up -d postgres
pnpm db:migrate
pnpm start:dev                # http://localhost:3000, Swagger at /api
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `APP_ENV` | no | `local` | `local` / `test` / `dev` / `staging` / `beta` / `production` — selects the `env/.env.<stage>` instance (see [Environments](#environments)) |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | Secret for signing access tokens |
| `THROTTLE_TTL` | yes | — | Rate-limit window (seconds) — set per stage file |
| `THROTTLE_LIMIT` | yes | — | Max requests per window — set per stage file |
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` / `production` / `test` — set BY the stage file, don't set by hand |
| `LOG_LEVEL` | no | `info` in production, else `debug` | pino log level |
| `LOG_PRETTY` | no | `false` | human-readable one-line logs (pino-pretty) |
| `LOG_HTTP_BODIES` | no | `false` | request bodies + response payloads in logs (redacted) |
| `SWAGGER_ENABLED` | no | `false` | serve Swagger UI at `/api` |
| `JWT_ACCESS_EXPIRES_IN` | no | `300` | Access-token lifetime (seconds) |
| `JWT_REFRESH_EXPIRES_IN` | no | `604800` | Refresh-token lifetime (seconds) |
| `CORS_ORIGINS` | no | _(empty)_ | Comma-separated allowed origins; empty disables CORS |

## Environments

The app runs as one of six instances selected by `APP_ENV`
(`local` | `test` | `dev` | `staging` | `beta` | `production`, default
`local`). Each instance's config lives in the committed `env/` directory
— one place to see and diff every instance. Behavior is driven by
explicit flags in those files, never by env-name checks:

| flag | does |
|---|---|
| `LOG_LEVEL` | pino level (defaults: `info` in production, else `debug`) |
| `LOG_PRETTY` | human-readable one-line logs (pino-pretty) |
| `LOG_HTTP_BODIES` | request bodies + response payloads in logs (redacted) |
| `SWAGGER_ENABLED` | serve Swagger UI at `/api` |

Precedence, first wins: injected process env → `.env` (gitignored
personal overrides) → `env/.env.<stage>.local` (gitignored) →
`env/.env.<stage>` (committed). Real deployments can inject secrets as
process env — injected values always beat the files.

Switch the instance by editing one constant — `APP_MODE` in
`src/config/app-mode.ts`:

```ts
export const APP_MODE: AppEnv = 'production';
```

Then run the app normally (`pnpm start:dev`, or `pnpm build && pnpm
start:prod`). The drizzle CLI follows the same switch, so `pnpm
db:migrate` targets the selected instance's database. An injected
`APP_ENV` env var overrides the constant (the Docker image sets
`APP_ENV=production`), and Jest/e2e always resolve to the `test`
instance (`env/.env.test`) regardless of the mode.

Drizzle commands (`db:generate`, `db:migrate`, `db:push`, `db:studio`) load the
same cascade, so they honor `APP_ENV` too, e.g. `APP_ENV=staging pnpm db:migrate`.

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
