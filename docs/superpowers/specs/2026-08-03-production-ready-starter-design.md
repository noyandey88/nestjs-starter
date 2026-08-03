# Production-Ready NestJS Starter — Design

**Date:** 2026-08-03
**Status:** Approved approach A (incremental hardening, no architectural changes)

## Context & Goals

This repository is a **public/team template**: a NestJS 11 + Drizzle (PostgreSQL) starter with JWT auth (access + refresh tokens in the response body), a global response envelope, and a demo `course` resource.

Goals:

1. Secure by default (headers, CORS, rate limiting, no secret leakage).
2. Fail fast on misconfiguration (validated env vars at boot).
3. Observable and lifecycle-correct (structured logs, health check, graceful shutdown).
4. Shippable (Docker, docker-compose, GitHub Actions CI).
5. Teachable: the `course` module is the polished canonical example users copy for new resources.

Non-goals (YAGNI for a template): cookie-based refresh tokens, namespaced config files, repository interfaces/abstract persistence, CQRS, correlation-ID infrastructure, testcontainers.

Existing architecture (module-per-feature, controller → service → repository, global `DRIZZLE_ORM` provider, global ValidationPipe / ResponseInterceptor / AllExceptionsFilter) is kept unchanged.

## 1. Configuration & env validation

- New `src/config/env.validation.ts`: an `EnvironmentVariables` class validated with class-validator, used by `ConfigModule.forRoot({ isGlobal: true, validate })`.
  - Required: `DATABASE_URL`, `JWT_SECRET`.
  - Optional with defaults: `PORT` (3000), `NODE_ENV` (`development`), `JWT_ACCESS_EXPIRES_IN` (`5m`), `JWT_REFRESH_EXPIRES_IN` (`7d`), `CORS_ORIGINS` (empty → CORS disabled), `THROTTLE_TTL` (60s), `THROTTLE_LIMIT` (100).
  - Invalid or missing required vars abort startup with a descriptive error.
- Remove all direct `process.env` reads from application code:
  - `AuthModule`: `JwtModule.registerAsync` using `ConfigService`; delete the redundant `ConfigModule.forRoot()` import inside it.
  - `AuthGuard`: secret via `ConfigService` (or rely on JwtModule's registered secret).
  - `main.ts`: port via `ConfigService`.
- Add `.env.example` (committed) documenting every variable; `.env` remains gitignored.

## 2. Security hardening

- `helmet` applied in `main.ts`.
- CORS: enabled only when `CORS_ORIGINS` is set (comma-separated origins), with `credentials` off (tokens are in the body).
- `@nestjs/throttler` registered globally via `APP_GUARD` using `THROTTLE_TTL`/`THROTTLE_LIMIT`; stricter `@Throttle` overrides on `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` (e.g. 5–10/min).
- Delete `console.log('DATABASE_URL: ...')` in `src/database/database.provider.ts`.
- Access-token lifetime moves from hardcoded `'5m'` to `JWT_ACCESS_EXPIRES_IN`; refresh lifetime to `JWT_REFRESH_EXPIRES_IN`.
- Refresh-token delivery stays in the JSON response body (decided; simplest for a generic API/mobile template).

## 3. Observability & lifecycle

- **Logging:** `nestjs-pino` as the app logger (`bufferLogs: true`, `app.useLogger(app.get(Logger))`).
  - Production: JSON lines. Development: `pino-pretty` transport.
  - Automatic HTTP request/response logging; `req.headers.authorization` redacted.
  - `AllExceptionsFilter` logs unexpected (5xx) errors through the logger with stack traces; 4xx pass through without noise.
- **Health:** `@nestjs/terminus` `GET /health` executing a `SELECT 1` through the Drizzle/pg pool. Excluded from auth and throttling.
- **Graceful shutdown:** `app.enableShutdownHooks()`; database provider refactored so the pg `Pool` is closed on shutdown (factory keeps a handle; an `OnApplicationShutdown` hook calls `pool.end()`).

## 4. Course as the canonical reference

Keep the `course` module and polish it into the pattern to copy:

- DTOs fully decorated with class-validator + `@ApiProperty`.
- `ParseIntPipe` on `:id` params.
- Service throws `NotFoundException` consistently when a course id does not exist (find, update, remove).
- All routes documented with `@ApiTags`/`@ApiOperation`/`@ApiBearerAuth` and guarded where appropriate.
- Responses use `ResponseBuilder`.
- Delete unused `src/course/entities/course.entity.ts` — Drizzle `InferSelectModel`/`InferInsertModel` types are the source of truth.

## 5. Testing foundation

- **Unit tests (examples to copy):**
  - `CourseService`: repository mocked; covers happy paths and `NotFoundException` cases.
  - `AuthService`: user repository, refresh-token repository, and `JwtService` mocked; covers register (hashing, duplicate email), login (bad credentials), refresh (invalid/expired token).
  - Delete auto-generated scaffold `.spec.ts` files that assert nothing (`should be defined` only) rather than leaving noise.
- **e2e:**
  - `test/jest-e2e.json` gains the `src/*` moduleNameMapper.
  - One end-to-end flow spec: register → login → `GET /users/me` → course CRUD → refresh, run against the docker-compose Postgres using `.env.test` (separate database name).
  - Documented command: bring up compose Postgres, run migrations, `pnpm test:e2e`.

## 6. Docker & CI

- **Dockerfile** (multi-stage): `deps` (pnpm install with lockfile) → `build` (nest build) → `runtime` (node:22-alpine, production deps only, non-root user, `CMD ["node", "dist/main"]`). `.dockerignore` added.
- **docker-compose.yml:** `postgres` service (volume, healthcheck) and an optional `api` service building from the Dockerfile for full local stack.
- **GitHub Actions** (`.github/workflows/ci.yml`):
  - Job 1: checkout → pnpm setup with cache → install → lint → unit tests → build.
  - Job 2 (e2e): Postgres service container → `drizzle-kit migrate` (migration drift breaks CI) → `pnpm test:e2e`.

## 7. Documentation

- README rewritten for this template (replacing Nest boilerplate): feature list, quickstart (clone → `.env` from example → compose up → migrate → `start:dev`), env var table, project structure overview, "adding a new resource" walkthrough referencing the course module, testing and deployment sections.
- CLAUDE.md updated after implementation to reflect the final state.

## Error handling

No architectural change: global `AllExceptionsFilter` + `ApiResponse` envelope stays. It gains pino-based logging of 5xx errors (with stacks) while keeping client responses in the existing envelope shape.

## New dependencies

Runtime: `helmet`, `@nestjs/throttler`, `@nestjs/terminus`, `nestjs-pino` (+ `pino-http`), `pino`.
Dev: `pino-pretty`.
All are mainstream, actively maintained packages; nothing else is added.

## Success criteria

- Boot fails with a clear message when `DATABASE_URL` or `JWT_SECRET` is missing.
- No secrets or connection strings ever logged.
- `GET /health` returns DB status; SIGTERM closes the pool cleanly.
- `docker compose up` + migrate + run works from a fresh clone following the README alone.
- CI is green and fails on lint, test, build, or migration errors.
- All unit and e2e tests pass; the course module compiles as a copyable exemplar.
