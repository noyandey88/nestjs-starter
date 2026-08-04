# Multi-Instance Environment Management Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zod-validated, `APP_ENV`-selected instances (local, test, dev, staging, beta, production) managed from one committed `env/` directory, with behavior driven by explicit flags (`LOG_PRETTY`, `LOG_HTTP_BODIES`, `SWAGGER_ENABLED`, `LOG_LEVEL`) instead of `NODE_ENV` name-checks — and the logger config extracted out of `app.module.ts`.

**Architecture:** `src/config/env.validation.ts` becomes a zod schema (`validateEnv` keeps its name/signature so ConfigModule wiring is untouched); a pure `resolveEnvFiles` helper computes the envFilePath cascade; committed `env/.env.<stage>` files carry per-instance values (user's explicit decision: values are pushed to GitHub; injected process env always wins); `src/config/logger.config.ts` owns the pino options; `app.module.ts` shrinks to a thin module list; `main.ts` consults flags.

**Tech Stack:** NestJS 11 `@nestjs/config`, zod (new runtime dep), nestjs-pino, Jest 30, pnpm.

## Global Constraints

- Spec (v2): `docs/superpowers/specs/2026-08-04-multi-instance-env-design.md`.
- `APP_ENVS = ['local', 'test', 'dev', 'staging', 'beta', 'production']` exactly; default `local`. `NODE_ENV` keeps meaning `development|test|production` and is set by stage files.
- Boolean flags use the booleanString pattern — `z.enum(['true','false']).default('false').transform(v => v === 'true')` — never `z.coerce.boolean()` (it coerces the string "false" to true).
- Precedence (first wins): process env → `.env` → `env/.env.<APP_ENV>.local` → `env/.env.<APP_ENV>`. In `@nestjs/config`, process env beats files and earlier envFilePath entries beat later ones.
- `test/app.e2e-spec.ts` must not be edited. `test:e2e` keeps `NODE_ENV=test`.
- Committed `env/` files ARE pushed with values (user's call). Root `.env.test` is deleted; its `DATABASE_URL`/`JWT_SECRET` move verbatim into `env/.env.test` (CI depends on them).
- `THROTTLE_TTL`/`THROTTLE_LIMIT` are REQUIRED by the schema (no defaults) — every stage file must define them.
- App code never name-checks env stages for feature decisions — flags only. (The single allowed `NODE_ENV` read is the LOG_LEVEL fallback inside logger.config.)
- pnpm only; no console.log. Full suite, lint, build green after every task.

## File Structure

```
src/config/env.validation.ts       (full zod rewrite; validateEnv keeps name+signature)
src/config/env.validation.spec.ts  (full rewrite for zod cases)
src/config/env-files.ts            (new — resolveEnvFiles)
src/config/env-files.spec.ts       (new)
src/config/logger.config.ts        (new — createLoggerOptions, extracted from app.module)
src/app.module.ts                  (envFilePath + thin LoggerModule wiring)
src/main.ts                        (flag-gated DebugPayloadInterceptor + Swagger)
env/.env.{local,test,dev,staging,beta,production}  (new, committed with values)
.env.test                          (DELETED — content moves to env/.env.test)
.gitignore                         (env/.env.*.local)
package.json                       (+zod; db:*:test scripts point at env/.env.test)
docker-compose.yml, Dockerfile     (APP_ENV, copy env/)
.env.example, README.md, CLAUDE.md (docs)
```

---

### Task 1: Zod env schema + `resolveEnvFiles` helper

**Files:**
- Modify: `src/config/env.validation.ts` (full replacement)
- Modify: `src/config/env.validation.spec.ts` (full replacement)
- Create: `src/config/env-files.ts`
- Create: `src/config/env-files.spec.ts`
- Modify: `package.json` + `pnpm-lock.yaml` (add zod)

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 2 relies on these exact names): `validateEnv(config: Record<string, unknown>): Env`, `APP_ENVS`, `type Env` from `src/config/env.validation`; `resolveEnvFiles(env: { APP_ENV?: string; NODE_ENV?: string }): string[]` from `src/config/env-files`.
- Compatibility sweep before finishing: `grep -rn "EnvironmentVariables\|NodeEnv\|NODE_ENVS" src test` — those class-validator-era exports are removed; update or remove any stray importer (expected: none outside `src/config/`).

- [ ] **Step 1: Install zod**

```bash
pnpm add zod
```

- [ ] **Step 2: Write the failing tests**

`src/config/env-files.spec.ts`:

```typescript
import { resolveEnvFiles } from './env-files';

describe('resolveEnvFiles', () => {
  it('returns the local cascade by default', () => {
    expect(resolveEnvFiles({})).toEqual([
      '.env',
      'env/.env.local.local',
      'env/.env.local',
    ]);
  });

  it('returns the cascade for an explicit stage', () => {
    expect(resolveEnvFiles({ APP_ENV: 'staging' })).toEqual([
      '.env',
      'env/.env.staging.local',
      'env/.env.staging',
    ]);
  });

  it('maps NODE_ENV=test to the test stage regardless of APP_ENV', () => {
    expect(resolveEnvFiles({ NODE_ENV: 'test', APP_ENV: 'staging' })).toEqual([
      '.env',
      'env/.env.test.local',
      'env/.env.test',
    ]);
  });

  it('maps APP_ENV=test to the test stage', () => {
    expect(resolveEnvFiles({ APP_ENV: 'test' })).toEqual([
      '.env',
      'env/.env.test.local',
      'env/.env.test',
    ]);
  });

  it('passes an unknown stage through (validation rejects it at boot)', () => {
    expect(resolveEnvFiles({ APP_ENV: 'nonsense' })).toEqual([
      '.env',
      'env/.env.nonsense.local',
      'env/.env.nonsense',
    ]);
  });
});
```

`src/config/env.validation.spec.ts` (full replacement):

```typescript
import { validateEnv, APP_ENVS } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
  JWT_SECRET: 'secret',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '100',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const env = validateEnv(base);
    expect(env.APP_ENV).toBe('local');
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_PRETTY).toBe(false);
    expect(env.LOG_HTTP_BODIES).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe(300);
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe(604800);
    expect(env.CORS_ORIGINS).toBe('');
  });

  it('accepts each known APP_ENV stage', () => {
    for (const stage of APP_ENVS) {
      expect(validateEnv({ ...base, APP_ENV: stage }).APP_ENV).toBe(stage);
    }
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => validateEnv({ ...base, APP_ENV: 'qa' })).toThrow(/APP_ENV/);
  });

  it('parses boolean flags from strings — including the "false" trap', () => {
    expect(validateEnv({ ...base, LOG_PRETTY: 'true' }).LOG_PRETTY).toBe(true);
    expect(validateEnv({ ...base, LOG_PRETTY: 'false' }).LOG_PRETTY).toBe(
      false,
    );
  });

  it('rejects non true/false boolean flag values', () => {
    expect(() => validateEnv({ ...base, SWAGGER_ENABLED: 'yes' })).toThrow(
      /SWAGGER_ENABLED/,
    );
  });

  it('requires THROTTLE_TTL and THROTTLE_LIMIT', () => {
    const { THROTTLE_TTL: _t, ...withoutTtl } = base;
    expect(() => validateEnv(withoutTtl)).toThrow(/THROTTLE_TTL/);
    const { THROTTLE_LIMIT: _l, ...withoutLimit } = base;
    expect(() => validateEnv(withoutLimit)).toThrow(/THROTTLE_LIMIT/);
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({ ...base, PORT: '8080', THROTTLE_TTL: '30' });
    expect(env.PORT).toBe(8080);
    expect(env.THROTTLE_TTL).toBe(30);
  });

  it('rejects a non-URL DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('enforces the LOG_LEVEL enum and leaves it optional', () => {
    expect(validateEnv(base).LOG_LEVEL).toBeUndefined();
    expect(validateEnv({ ...base, LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
    expect(() => validateEnv({ ...base, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- env-files` and `pnpm test -- env.validation`
Expected: env-files FAILS (module not found); env.validation FAILS (old class-validator implementation).

- [ ] **Step 4: Implement**

Version note: `pnpm add zod` installs zod v4, where `z.string().url()`
is removed — use `z.url()` for `DATABASE_URL` in that case (identical
semantics). If v3 got installed, `z.string().url()` is correct. Check
`node_modules/zod/package.json` version and use the matching form; the
code below shows the v3 form.

`src/config/env.validation.ts` (full replacement):

```typescript
// src/config/env.validation.ts
import { z } from 'zod';

export const APP_ENVS = [
  'local',
  'test',
  'dev',
  'staging',
  'beta',
  'production',
] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
// NB: z.coerce.boolean() is a trap — it coerces the *string* "false" to true.

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_ENV: z.enum(APP_ENVS).default('local'),

  PORT: z.coerce.number().int().positive().default(3000),

  // Logging — values, not name-checks
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .optional(),
  LOG_PRETTY: booleanString,
  LOG_HTTP_BODIES: booleanString,

  SWAGGER_ENABLED: booleanString,

  // Same code everywhere, different numbers per stage file (required).
  THROTTLE_TTL: z.coerce.number().int().positive(),
  THROTTLE_LIMIT: z.coerce.number().int().positive(),

  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  /** Access-token lifetime in seconds. */
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().int().positive().default(300),
  /** Refresh-token lifetime in seconds. */
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
  /** Comma-separated list of allowed origins. Empty disables CORS. */
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

`src/config/env-files.ts`:

```typescript
/**
 * Computes the ordered envFilePath list for ConfigModule. Earlier entries
 * take precedence in @nestjs/config, and injected process env always
 * beats every file. Missing files are skipped silently, so an unknown
 * stage falls through to validateEnv, which rejects it at boot.
 * NODE_ENV=test (Jest) always resolves to the `test` stage.
 */
export function resolveEnvFiles(env: {
  APP_ENV?: string;
  NODE_ENV?: string;
}): string[] {
  const stage = env.NODE_ENV === 'test' ? 'test' : (env.APP_ENV ?? 'local');
  return ['.env', `env/.env.${stage}.local`, `env/.env.${stage}`];
}
```

- [ ] **Step 5: Compatibility sweep + full suite**

```bash
grep -rn "EnvironmentVariables\|NodeEnv\|NODE_ENVS" src test
```
Expected: no matches outside `src/config/` (fix any stray importer to use `Env`/`APP_ENVS`).

Run: `pnpm test`, `pnpm lint`, `pnpm build` — green. (Unit tests never boot the app; stage files arrive in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/config package.json pnpm-lock.yaml
git commit -m "feat: zod env schema with APP_ENV stages and behavior flags"
```

---

### Task 2: `env/` directory + logger extraction + flag-driven consumers (atomic)

The stage files, the ConfigModule wiring, the logger extraction, and the
flag gates land together so the app is bootable and the test cascade
never breaks mid-plan. Do not split.

**Files:**
- Create: `env/.env.local`, `env/.env.test`, `env/.env.dev`, `env/.env.staging`, `env/.env.beta`, `env/.env.production`
- Delete: `.env.test` (its DATABASE_URL/JWT_SECRET move verbatim into `env/.env.test`)
- Create: `src/config/logger.config.ts`
- Modify: `src/app.module.ts` (envFilePath; LoggerModule block shrinks to the extracted factory)
- Modify: `src/main.ts` (flag gates)
- Modify: `package.json` (`db:create:test`, `db:migrate:test` → `dotenv -e env/.env.test`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `resolveEnvFiles`, the zod flags (Task 1).
- Produces: `createLoggerOptions(config: ConfigService): Params` from `src/config/logger.config` (nestjs-pino `Params`); bootable per-stage instances Task 3 documents and verifies.

- [ ] **Step 1: Read the current root `.env.test`**

```bash
cat .env.test
```
Carry its `DATABASE_URL` and `JWT_SECRET` values into `env/.env.test`
byte-for-byte (CI's postgres service depends on them).

- [ ] **Step 2: Create the six stage files**

`env/.env.local`:

```bash
# Developer machine (default instance — APP_ENV unset resolves here).
# Personal overrides go in the gitignored .env; injected env always wins.
NODE_ENV=development
PORT=3000
LOG_PRETTY=true
LOG_HTTP_BODIES=true
SWAGGER_ENABLED=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nestjs_starter
JWT_SECRET=local-dev-secret-change-me
```

`env/.env.test` (DATABASE_URL/JWT_SECRET copied verbatim from the old
root `.env.test`; throttle generous so Jest never trips the limiter):

```bash
# Jest / e2e instance (NODE_ENV=test always resolves here).
NODE_ENV=test
PORT=3000
LOG_PRETTY=false
LOG_HTTP_BODIES=false
SWAGGER_ENABLED=false
THROTTLE_TTL=60
THROTTLE_LIMIT=1000
DATABASE_URL=<copied from old .env.test>
JWT_SECRET=<copied from old .env.test>
```

`env/.env.dev`:

```bash
# Deployed shared dev instance.
NODE_ENV=development
PORT=3000
LOG_PRETTY=false
LOG_HTTP_BODIES=true
SWAGGER_ENABLED=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
DATABASE_URL=postgresql://nestjs:change-me@dev-db:5432/nestjs_starter
JWT_SECRET=dev-secret-change-me
```

`env/.env.staging`:

```bash
# Staging — production runtime behavior, staging values.
# Real DATABASE_URL/JWT_SECRET are injected by the deployment (they win).
NODE_ENV=production
PORT=3000
LOG_PRETTY=false
LOG_HTTP_BODIES=false
SWAGGER_ENABLED=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
DATABASE_URL=postgresql://nestjs:change-me@staging-db:5432/nestjs_starter
JWT_SECRET=staging-secret-change-me
```

`env/.env.beta`:

```bash
# Beta — production runtime behavior, beta values.
# Real DATABASE_URL/JWT_SECRET are injected by the deployment (they win).
NODE_ENV=production
PORT=3000
LOG_PRETTY=false
LOG_HTTP_BODIES=false
SWAGGER_ENABLED=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
DATABASE_URL=postgresql://nestjs:change-me@beta-db:5432/nestjs_starter
JWT_SECRET=beta-secret-change-me
```

`env/.env.production`:

```bash
# Production. Real DATABASE_URL/JWT_SECRET are injected by the
# deployment (injected env always wins over this file).
NODE_ENV=production
PORT=3000
LOG_PRETTY=false
LOG_HTTP_BODIES=false
SWAGGER_ENABLED=false
THROTTLE_TTL=60
THROTTLE_LIMIT=60
DATABASE_URL=postgresql://nestjs:change-me@prod-db:5432/nestjs_starter
JWT_SECRET=production-secret-change-me
```

Then delete the root test file:

```bash
git rm .env.test
```

- [ ] **Step 3: Extract the logger config**

`src/config/logger.config.ts` (new — the pino options move here from
app.module verbatim except the flag-driven conditions):

```typescript
// src/config/logger.config.ts
import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';

/**
 * Pino options for LoggerModule.forRootAsync. Behavior is driven by
 * validated flags (LOG_LEVEL, LOG_PRETTY, LOG_HTTP_BODIES) — never by
 * env-name checks. Redaction is always on.
 */
export function createLoggerOptions(config: ConfigService): Params {
  const level =
    config.get<string>('LOG_LEVEL') ??
    (config.get<string>('NODE_ENV') === 'production' ? 'info' : 'debug');
  const httpBodies = config.get<boolean>('LOG_HTTP_BODIES');

  return {
    pinoHttp: {
      level,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.refreshToken',
        'payload.accessToken',
        'payload.refreshToken',
      ],
      // LOG_HTTP_BODIES: trim the per-request log to what debugging
      // needs (method, url, body, status). Otherwise pino-http defaults —
      // full headers, no bodies (PII-safe).
      serializers: httpBodies
        ? {
            req: (req: {
              method: string;
              url: string;
              raw?: { body?: unknown };
            }) => ({
              method: req.method,
              url: req.url,
              body: req.raw?.body,
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          }
        : undefined,
      transport: config.get<boolean>('LOG_PRETTY')
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              messageFormat:
                '{if req.method}{req.method} {req.url} {end}{if res.statusCode}→ {res.statusCode} ({responseTime}ms) {end}{msg}',
            },
          }
        : undefined,
    },
  };
}
```

- [ ] **Step 4: Slim `app.module.ts`**

Add imports:

```typescript
import { resolveEnvFiles } from './config/env-files';
import { createLoggerOptions } from './config/logger.config';
```

Replace the envFilePath line:

```typescript
      envFilePath: resolveEnvFiles(process.env),
```

Replace the entire `LoggerModule.forRootAsync({...})` block with:

```typescript
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createLoggerOptions,
    }),
```

- [ ] **Step 5: Flag gates in `main.ts`**

Replace the DebugPayloadInterceptor condition:

```typescript
  // Registered after ResponseInterceptor so it taps the raw payload.
  // Flag-gated: response payloads may contain PII.
  if (configService.get<boolean>('LOG_HTTP_BODIES')) {
    app.useGlobalInterceptors(new DebugPayloadInterceptor());
  }
```

Wrap the Swagger block (DocumentBuilder through `SwaggerModule.setup`,
lines unchanged inside) in:

```typescript
  if (configService.get<boolean>('SWAGGER_ENABLED')) {
    // ...existing DocumentBuilder + SwaggerModule.setup lines...
  }
```

- [ ] **Step 6: Scripts + gitignore**

`package.json` — change both test-DB scripts' `-e` path (inline node
script stays byte-identical):

```
"db:migrate:test": "dotenv -e env/.env.test -- drizzle-kit migrate",
"db:create:test": "dotenv -e env/.env.test -- node -e \"...unchanged...\"",
```

`.gitignore` — in the dotenv block, add:

```
env/.env.*.local
```

- [ ] **Step 7: Verify**

Run: `pnpm test`, `pnpm lint`, `pnpm build` — green.

Boot smokes (the machine's real `.env` may override PORT/DATABASE_URL —
assert on log format, not port):

```bash
timeout 15 pnpm start:dev 2>&1 | head -20                   # local: pretty lines
APP_ENV=staging timeout 15 pnpm start:dev 2>&1 | head -20   # staging: raw JSON lines
git check-ignore -v env/.env.staging.local && echo ignored-ok
git status --short   # six env/ files added, .env.test deleted
```

- [ ] **Step 8: Commit**

```bash
git add env .gitignore src/config/logger.config.ts src/app.module.ts src/main.ts package.json
git rm --cached .env.test 2>/dev/null || true
git commit -m "feat: committed per-stage env files, flag-driven behavior, extracted logger config"
```

---

### Task 3: Docker, docs, live verification

**Files:**
- Modify: `docker-compose.yml`, `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `env/` directory and flags from Tasks 1–2.

- [ ] **Step 1: Docker**

`docker-compose.yml` api service environment — add beside `NODE_ENV: production`:

```yaml
      APP_ENV: production
```

`Dockerfile` runtime stage — after `ENV NODE_ENV=production`:

```dockerfile
ENV APP_ENV=production
```

and after `COPY --from=build /app/dist ./dist`:

```dockerfile
COPY --from=build /app/env ./env
```

(`.dockerignore`'s `.env*` pattern matches root-level entries only, so
the `env/` directory ships — the docker build in step 4 verifies.)

- [ ] **Step 2: Rewrite `.env.example`**

```bash
# ── Instance selection ─────────────────────────────────────────────
# APP_ENV picks which committed env/.env.<stage> file loads:
#   local | test | dev | staging | beta | production   (default: local)
# NODE_ENV is set BY the stage file — don't set it by hand.
# Precedence (first wins): injected process env > .env (this file's
# gitignored sibling) > env/.env.<stage>.local > env/.env.<stage>
#APP_ENV=local

# ── Personal overrides (optional — stage files carry the values) ───
# Put machine-specific secrets/overrides in .env; they beat stage files.
#DATABASE_URL=postgresql://user:password@localhost:5432/nestjs_starter
#JWT_SECRET=my-strong-local-secret
#PORT=3000
#LOG_LEVEL=debug
#LOG_PRETTY=true
#LOG_HTTP_BODIES=true
#SWAGGER_ENABLED=true
#CORS_ORIGINS=
#THROTTLE_TTL=60
#THROTTLE_LIMIT=100
#JWT_ACCESS_EXPIRES_IN=300
#JWT_REFRESH_EXPIRES_IN=604800
```

- [ ] **Step 3: Docs**

`README.md` — add an "Environments" section after the setup/env section
(match surrounding heading style):

```markdown
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

Run a stage locally:

```bash
APP_ENV=staging pnpm start:dev
```

Jest/e2e always resolve to the `test` instance (`env/.env.test`).
```

Also update any README mention of `.env.test` (e2e prerequisites) to
`env/.env.test`.

`CLAUDE.md` — replace the paragraph starting "Requires a `.env` ..."
with:

```markdown
Config is zod-validated at boot (`src/config/env.validation.ts`,
`validateEnv`) — `DATABASE_URL`, `JWT_SECRET`, `THROTTLE_TTL`, and
`THROTTLE_LIMIT` are required; everything else has schema defaults; the
app fails fast with a descriptive error. `APP_ENV`
(`local|test|dev|staging|beta|production`, default `local`) selects the
instance: `ConfigModule` loads, in precedence order, process env →
`.env` → `env/.env.<APP_ENV>.local` → `env/.env.<APP_ENV>`
(`src/config/env-files.ts`). The committed `env/` files each set
`NODE_ENV` and the behavior flags (`LOG_LEVEL`, `LOG_PRETTY`,
`LOG_HTTP_BODIES`, `SWAGGER_ENABLED`) — app code reads flags, never
`NODE_ENV` names, for feature decisions; pino options live in
`src/config/logger.config.ts`. `NODE_ENV=test` (Jest) always resolves to
the `test` instance. Token lifetimes are in **seconds**.
`drizzle.config.ts` uses dotenv directly rather than Nest's ConfigModule.
```

Also update the CLAUDE.md test-command comment that references
`.env.test` (`db:create:test`/`db:migrate:test` read `env/.env.test`).

- [ ] **Step 4: Live verification**

Compose postgres (host port 5433 — local postgres owns 5432; docker via
`sg docker -c`; JWT_SECRET needed for compose interpolation):

```bash
cat > /tmp/compose-port-override.yml <<'EOF'
services:
  postgres:
    ports: !override
      - '5433:5432'
EOF
JWT_SECRET=x sg docker -c "docker compose -f docker-compose.yml -f /tmp/compose-port-override.yml up -d postgres"
sleep 5
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm db:create:test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm db:migrate:test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm test:e2e
```

Expected: e2e 15/15 with `test/app.e2e-spec.ts` unedited (proves the
`env/.env.test` cascade + injected-var precedence).

Swagger/pretty flag proof:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test JWT_SECRET=x PORT=3996 APP_ENV=staging timeout 20 pnpm start:dev > /tmp/stage.log 2>&1 &
sleep 13
curl -s -o /dev/null -w 'staging swagger: %{http_code}\n' http://localhost:3996/api
curl -s -o /dev/null -w 'staging health: %{http_code}\n' http://localhost:3996/health
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test JWT_SECRET=x PORT=3995 SWAGGER_ENABLED=false APP_ENV=staging timeout 20 pnpm start:dev > /tmp/stage2.log 2>&1 &
sleep 13
curl -s -o /dev/null -w 'flag-off swagger: %{http_code}\n' http://localhost:3995/api
pkill -f "nest start"; JWT_SECRET=x sg docker -c "docker compose -f docker-compose.yml -f /tmp/compose-port-override.yml down"
```

Expected: staging swagger 200 (stage file turns it on), health 200,
flag-off swagger 404 (injected `SWAGGER_ENABLED=false` wins), and
`/tmp/stage.log` shows raw JSON (non-pretty) lines.

Docker image sanity:

```bash
sg docker -c "docker build -t nestjs-starter:envcheck ."
sg docker -c "docker run --rm --entrypoint ls nestjs-starter:envcheck env"
```

Expected: build succeeds; `ls env` lists the six stage files.

- [ ] **Step 5: Full suite + commit**

Run: `pnpm test && pnpm lint && pnpm build` — green.

```bash
git add docker-compose.yml Dockerfile .env.example README.md CLAUDE.md
git commit -m "docs: document APP_ENV instances; ship env directory in docker image"
```
