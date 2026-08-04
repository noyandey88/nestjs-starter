# Multi-Instance Environment Management — Design

**Date:** 2026-08-04
**Status:** Approved
**Base:** main (eb3ba8f)

## Problem

The starter conflates two axes in one variable: `NODE_ENV` names both the
runtime mode frameworks key off (`development|production|test`) and,
implicitly, the deployment stage. There is no way to run distinct
instances (dev, staging, beta, production) with per-instance config, and
no single place to see or manage each instance's values.

## Goal

- Instances: **dev, staging, beta, production** (plus the existing `test`
  runtime mode for Jest — a mode, not a stage).
- One management surface: a committed `env/` directory holding per-stage
  non-secret config, diffable in PRs.
- Secrets never enter git; injected process env always wins, so Docker,
  CI, and any PaaS keep working unchanged.
- Everything remains validated through the single typed schema in
  `src/config/env.validation.ts`.

## Design

### 1. Two variables, two jobs

- **`APP_ENV`** (new): `dev | staging | beta | production`, default
  `dev`. Names the instance; selects which stage file loads.
- **`NODE_ENV`**: unchanged meaning (`development | production | test`) —
  what frameworks/pino/Express key off. Each committed stage file sets
  the correct `NODE_ENV` (`development` for dev; `production` for
  staging, beta, production), so operators set only `APP_ENV` and the
  runtime mode follows automatically. An explicitly injected `NODE_ENV`
  still wins (process env precedence).

### 2. The `env/` directory (the "one place")

```
env/
  .env.defaults      # values shared by all stages (committed)
  .env.dev           # per-stage non-secret overrides (committed)
  .env.staging
  .env.beta
  .env.production
.env                 # gitignored — machine-local secrets + overrides
.env.test            # unchanged (Jest/e2e, local test values only)
```

Committed stage files contain only non-secrets: `NODE_ENV`, `PORT`,
`CORS_ORIGINS`, `THROTTLE_*`, `JWT_ACCESS_EXPIRES_IN`,
`JWT_REFRESH_EXPIRES_IN`. Secrets (`DATABASE_URL`, `JWT_SECRET`) come
from the gitignored `.env` locally or injected vars in real deployments.
Committed files carry placeholder-free comments pointing at where secrets
come from.

### 3. Load order (first match wins)

`@nestjs/config` gives process env top precedence, then earlier
`envFilePath` entries over later ones:

1. Injected process env (always wins — 12-factor)
2. `.env` (local secrets/overrides)
3. `env/.env.<APP_ENV>.local` (gitignored per-stage local overrides, optional)
4. `env/.env.<APP_ENV>` (stage values)
5. `env/.env.defaults` (shared baseline)

Test mode keeps its existing special case: when `NODE_ENV === 'test'`,
`envFilePath` stays `['.env.test', '.env']` — Jest runs are stage-less.

`APP_ENV` is read via `process.env.APP_ENV ?? 'dev'` at module-definition
time (before ConfigModule parses files), because it chooses which files
to parse. A stage file therefore cannot set `APP_ENV` — by design.

### 4. Validation

`EnvironmentVariables` gains:

```ts
export const APP_ENVS = ['dev', 'staging', 'beta', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

@IsIn(APP_ENVS)
@IsOptional()
APP_ENV: AppEnv = 'dev';
```

Invalid `APP_ENV` fails boot with the existing descriptive error.

### 5. Touchpoints

- `docker-compose.yml` api service: add `APP_ENV: production` beside the
  existing `NODE_ENV: production` (illustrates injected-var precedence).
- `.env.example`: rewritten to document the two-variable model, the
  `env/` directory, and which values are secret.
- `README.md` + `CLAUDE.md`: new "Environments" section — how to run a
  stage locally (`APP_ENV=staging pnpm start:dev`), where values live,
  precedence order.
- `.gitignore`: ensure `.env` stays ignored and `env/*.local` pattern is
  ignored (escape hatch for uncommitted per-stage local overrides:
  `env/.env.<stage>.local` loads between `.env` and the stage file).

### 6. Out of scope

- Secrets-manager integration (Doppler/Vault) — later add-on.
- Per-stage infrastructure (separate databases, deploy pipelines).
- Config namespaces/registerAs refactor — the flat validated schema
  stays.

## Testing

- Unit tests for the envFilePath resolution helper (pure function
  `resolveEnvFiles(appEnv, nodeEnv)` returning the ordered file list —
  extracted so it's testable without booting Nest).
- Unit test: `APP_ENV` validation accepts the four stages, rejects
  garbage, defaults to `dev`.
- Existing suite + live boot smoke per stage (`APP_ENV=staging`) showing
  the right values loaded (non-secret, e.g. PORT differs per stage).
- e2e unaffected (test mode path unchanged).
