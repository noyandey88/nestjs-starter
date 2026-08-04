# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 11 LMS API ("nestjs-lms") using Drizzle ORM on PostgreSQL, JWT auth with refresh tokens, and Swagger docs served at `/api`. Package manager is **pnpm**.

## Commands

```bash
pnpm start:dev          # run with watch mode (default port 3000, override with PORT)
pnpm build              # nest build
pnpm lint               # eslint with --fix
pnpm format             # prettier on src/ and test/

pnpm test               # run all unit tests (*.spec.ts under src/)
pnpm test -- course.service   # run a single test file (jest pattern match)
pnpm test:watch

pnpm db:generate        # generate a Drizzle migration from schema changes
pnpm db:migrate         # apply migrations
pnpm db:push            # push schema directly (no migration file)
pnpm db:studio          # Drizzle Studio UI

pnpm db:create:test     # create the test database (reads .env.test)
pnpm db:migrate:test    # apply migrations to the test database (reads .env.test)
pnpm test:e2e           # e2e tests (test/jest-e2e.json) — requires:
                        #   docker compose up -d postgres
                        #   pnpm db:create:test && pnpm db:migrate:test
```

Requires a `.env` with `DATABASE_URL` and `JWT_SECRET`. Env vars are validated at boot by `src/config/env.validation.ts` (`ConfigModule.forRoot({ validate: validateEnv })` in `app.module.ts`) — `DATABASE_URL` and `JWT_SECRET` are required, everything else has a default; the app fails fast with a descriptive error if validation fails. `JWT_ACCESS_EXPIRES_IN` and `JWT_REFRESH_EXPIRES_IN` are in **seconds** (defaults `300` / `604800`). `drizzle.config.ts` uses dotenv directly rather than Nest's ConfigModule.

## Architecture

Standard NestJS module-per-feature layout (`auth`, `user`, `course`, `health`), each following **controller → service → repository**. Repositories are the only layer that touches the database.

### Database (Drizzle)

- `src/database/database.module.ts` is a `@Global()` module providing a Drizzle instance via the `DRIZZLE_ORM` injection token and a `pg.Pool` via the `PG_POOL` token (`src/database/database.constants.ts`). Repositories inject Drizzle as `@Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>`.
- `DatabaseLifecycle` (`src/database/database.provider.ts`) implements `OnApplicationShutdown` and calls `pool.end()` on shutdown; `main.ts` calls `app.enableShutdownHooks()` so the pool closes cleanly on SIGTERM/SIGINT.
- Table definitions live in `src/database/schema/*.schema.ts` and must be re-exported from `src/database/schema/index.ts` — both the Drizzle query API (`db.query.<table>`) and drizzle-kit discover tables through that barrel/glob.
- Migrations are generated into `drizzle/migrations/`. Workflow for a schema change: edit schema file → `pnpm db:generate` → `pnpm db:migrate`.
- Row types are derived per-repository with `InferSelectModel` / `InferInsertModel` rather than shared entity classes.

### Auth

- `AuthModule` registers `JwtModule` as **global** via `registerAsync`, reading `JWT_SECRET` and `JWT_ACCESS_EXPIRES_IN` (seconds) from `ConfigService`; refresh tokens are persisted via `auth/refresh-token.repository.ts` (`refresh_tokens` table) and their lifetime is `JWT_REFRESH_EXPIRES_IN` (seconds).
- Protect routes with `@Auth()` (`src/common/decorators/auth.decorator.ts`), which bundles `AuthGuard`, the `access-token` Swagger bearer scheme, and the documented 401; the guard puts the JWT payload on `request.user`, accessed via `@CurrentUser()`.

### Health, rate limiting, logging

- `HealthModule` (`src/health/`) exposes `GET /health` via `@nestjs/terminus`, checking `DrizzleHealthIndicator` (runs `SELECT 1` through the injected `DRIZZLE_ORM` instance).
- `ThrottlerGuard` is registered globally as `APP_GUARD` in `app.module.ts` (limits from `THROTTLE_TTL`/`THROTTLE_LIMIT`, converted to ms). Endpoints that must not be rate-limited (e.g. `/health`) need `@SkipThrottle()` from `@nestjs/throttler`.
- Logging goes through `nestjs-pino` (`LoggerModule.forRootAsync` in `app.module.ts`, `app.useLogger(app.get(Logger))` in `main.ts`); `Authorization`/`Cookie` headers are redacted. **Never use `console.log`** — inject `Logger`/`PinoLogger` or use Nest's standard logger, which pino now backs.

### Response envelope (cross-cutting)

`main.ts` wires three global pieces: a `ValidationPipe` (`whitelist` + `transform`, so DTOs use class-validator decorators and unknown fields are stripped), `ResponseInterceptor`, and `AllExceptionsFilter`. Every response — success or error — is normalized to the `ApiResponse` shape `{ success, status, message, payload }` (`src/common/`). Controllers return the **raw payload** (usually the service result); the interceptor builds the envelope, deriving `status` from the response's HTTP status code and `message` from `@ApiEnvelope` route metadata.

Per-route contract lives in composed decorators (`src/common/decorators/`):
- `@ApiEnvelope(PayloadDto, { message })` — sets the HTTP code (default 200), the envelope message, and the Swagger success schema (envelope + payload DTO). Use `null` for null payloads, `isArray: true` for lists.
- `@Auth()` — `AuthGuard` + Swagger bearer (`access-token`) + documented 401. Class-level when every route is protected.
- `@ApiErrorResponses(HttpStatus.X, ...)` — documents error codes with the `ErrorResponseDto` shape emitted by `AllExceptionsFilter`.
- `@CurrentUser('sub' | 'email' | 'role')` — injects the verified JWT payload (or one field) from `request.user`.

Do not add `@ApiBody` (inferred from `@Body()` types) or per-route `@HttpCode`/`@UseGuards`/`@ApiBearerAuth` — the decorators above own those.

### Conventions

- Path alias `src/*` resolves from the project root (tsconfig + jest `moduleNameMapper`); imports mix relative and `src/...` forms.
- Swagger: tag controllers with `@ApiTags`, document endpoints with `@ApiOperation`.
