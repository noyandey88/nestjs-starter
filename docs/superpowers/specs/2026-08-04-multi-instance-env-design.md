# Multi-Instance Environment Management — Design (v2)

**Date:** 2026-08-04 (v2 — user-directed revision)
**Status:** Approved
**Base:** main (97e3e9a)

## Problem

The starter conflates runtime mode and deployment stage in `NODE_ENV`,
scatters behavior behind `NODE_ENV === 'development'` name-checks
(pino-pretty, body logging, debug interceptor), and has no per-instance
config. Swagger is always on. Env validation is class-validator, which
is verbose for this job.

## Goal

- Instances: **local, test, dev, staging, beta, production** selected by
  `APP_ENV` (default `local`).
- One management surface: a committed `env/` directory — one file per
  instance, **pushed to GitHub with real values** (user manages/rotates
  values; production-grade secrets can still be injected, and injected
  process env always wins).
- Behavior via explicit value flags, not env-name checks:
  `LOG_LEVEL`, `LOG_PRETTY`, `LOG_HTTP_BODIES`, `SWAGGER_ENABLED`.
- Env validation via **zod** (single typed schema, fail-fast boot).
  class-validator remains for request DTOs.

## Design

### 1. Variables

- **`APP_ENV`**: `local | test | dev | staging | beta | production`,
  default `local`. Names the instance; selects `env/.env.<APP_ENV>`.
- **`NODE_ENV`**: unchanged meaning (`development | test | production`),
  set inside each stage file. Frameworks keep keying off it; app code
  stops using it for feature decisions.
- **Flags** (all read from config, never inferred from env names):
  - `LOG_LEVEL`: `trace|debug|info|warn|error|fatal`, optional — when
    unset, falls back to `NODE_ENV === 'production' ? 'info' : 'debug'`.
  - `LOG_PRETTY` (booleanString, default `false`): pino-pretty transport.
  - `LOG_HTTP_BODIES` (booleanString, default `false`): trimmed dev
    serializers with request bodies + the `DebugPayloadInterceptor`
    response-payload logging.
  - `SWAGGER_ENABLED` (booleanString, default `false`): gates
    `SwaggerModule.setup` in `main.ts`.

### 2. Zod schema (`src/config/env.validation.ts` — full replacement)

```ts
import { z } from 'zod';

export const APP_ENVS = ['local', 'test', 'dev', 'staging', 'beta', 'production'] as const;

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
// NB: z.coerce.boolean() is a trap — it coerces the *string* "false" to true.

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(APP_ENVS).default('local'),

  PORT: z.coerce.number().int().positive().default(3000),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  LOG_PRETTY: booleanString,
  LOG_HTTP_BODIES: booleanString,

  SWAGGER_ENABLED: booleanString,

  // Same code everywhere, different numbers per stage file (required).
  THROTTLE_TTL: z.coerce.number().int().positive(),
  THROTTLE_LIMIT: z.coerce.number().int().positive(),

  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().int().positive().default(300),
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
  CORS_ORIGINS: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}
```

`ConfigModule.forRoot({ validate: validateEnv })` keeps working — the
returned object becomes the config store, so transformed values
(booleans, numbers) are what `ConfigService.get` returns. New runtime
dependency: `zod`.

### 3. The `env/` directory

```
env/
  .env.local        # developer machine (default instance)
  .env.test         # jest/e2e (replaces root .env.test)
  .env.dev          # deployed dev instance
  .env.staging
  .env.beta
  .env.production
.env                # gitignored — optional personal overrides
```

All committed and pushed, **including values** (user's explicit call;
they manage rotation). Each file sets `NODE_ENV`, `PORT`, the flags,
`THROTTLE_*`, and `DATABASE_URL`/`JWT_SECRET` values appropriate to the
stage. Production/staging/beta files carry obvious change-me secret
values plus a comment that real deployments inject the true values
(injected env always wins).

Flag matrix (initial values):

| stage | NODE_ENV | LOG_PRETTY | LOG_HTTP_BODIES | SWAGGER_ENABLED |
|---|---|---|---|---|
| local | development | true | true | true |
| test | test | false | false | false |
| dev | development | false | true | true |
| staging | production | false | false | true |
| beta | production | false | false | true |
| production | production | false | false | false |

### 4. Load order (first match wins)

1. Injected process env (always wins)
2. `.env` (gitignored personal overrides)
3. `env/.env.<APP_ENV>.local` (gitignored escape hatch)
4. `env/.env.<APP_ENV>` (committed stage file)

No shared defaults file — the zod schema's defaults are the baseline.
Helper `resolveEnvFiles(env): string[]` in `src/config/env-files.ts`;
test mode (`NODE_ENV === 'test'` or `APP_ENV === 'test'`) resolves the
same cascade with stage `test`. Root `.env.test` is deleted; scripts
that used it point at `env/.env.test`.

### 5. Consumers switch from name-checks to flags

- **Logger config extracted** (user request: `app.module.ts` is
  spaghetti): new `src/config/logger.config.ts` exports
  `createLoggerOptions(config: ConfigService): Params` (nestjs-pino
  `Params`), containing level =
  `LOG_LEVEL ?? (NODE_ENV === 'production' ? 'info' : 'debug')`,
  pino-pretty transport when `LOG_PRETTY`, trimmed body serializers when
  `LOG_HTTP_BODIES`, redaction list unchanged (always on).
  `app.module.ts`'s LoggerModule block shrinks to
  `useFactory: createLoggerOptions`.
- `main.ts`: register `DebugPayloadInterceptor` when `LOG_HTTP_BODIES`;
  run `SwaggerModule.setup` only when `SWAGGER_ENABLED`.
- `app.module.ts` envFilePath: `resolveEnvFiles(process.env)`.
- `package.json`: `db:create:test` / `db:migrate:test` use
  `dotenv -e env/.env.test`; `test:e2e` keeps `NODE_ENV=test`.
- Docker compose api: add `APP_ENV: production`; Dockerfile: add
  `ENV APP_ENV=production` and copy `env/` into the runtime image.
- CI: injected vars still win; the e2e job keeps working because
  `NODE_ENV=test` resolves to the committed `env/.env.test` plus the
  job's injected `DATABASE_URL`/`JWT_SECRET`.

### 6. Out of scope

- Secrets-manager integration; per-stage infrastructure.
- Converting request-DTO validation to zod (class-validator stays).

## Testing

- Unit: `resolveEnvFiles` (default local, explicit stage, test mode via
  NODE_ENV and via APP_ENV, unknown stage passthrough).
- Unit: zod `validateEnv` — defaults applied (`APP_ENV` local, `PORT`
  3000, flags false); booleanString accepts 'true'/'false', rejects
  'yes', and `"false"` parses to `false` (the coerce trap); `THROTTLE_*`
  required; `DATABASE_URL` must be a URL; unknown `APP_ENV` rejected;
  `LOG_LEVEL` enum enforced.
- Existing suite green; `test/app.e2e-spec.ts` unedited and green
  against `env/.env.test`.
- Live smokes: default boot = pretty logs + swagger on;
  `APP_ENV=staging` = JSON logs + swagger on;
  `SWAGGER_ENABLED=false` injected = `/api` 404.
