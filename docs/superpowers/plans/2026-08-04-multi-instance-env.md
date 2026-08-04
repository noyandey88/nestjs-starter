# Multi-Instance Environment Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `APP_ENV`-selected instances (dev, staging, beta, production) managed from one committed `env/` directory, with secrets kept out of git and injected process env always winning.

**Architecture:** A pure `resolveEnvFiles` helper computes the ordered `envFilePath` list for `ConfigModule` from `APP_ENV`/`NODE_ENV`. Committed `env/.env.<stage>` files hold non-secret per-stage values (each sets the right `NODE_ENV`); the gitignored `.env` holds local secrets; `@nestjs/config` gives process env top precedence and earlier files precedence over later ones. `APP_ENV` joins the validated schema.

**Tech Stack:** NestJS 11 `@nestjs/config`, class-validator, Jest 30, pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-multi-instance-env-design.md`.
- Stages are exactly `dev | staging | beta | production` (constant `APP_ENVS`); default `dev`. `NODE_ENV` meaning is unchanged (`development | production | test`).
- Precedence (first wins): process env → `.env` → `env/.env.<APP_ENV>.local` → `env/.env.<APP_ENV>` → `env/.env.defaults`. In `@nestjs/config`, process env beats files by default and **earlier `envFilePath` entries beat later ones** — the returned array order IS the precedence order.
- Test mode unchanged: when `NODE_ENV === 'test'`, the file list stays `['.env.test', '.env']` (Jest runs are stage-less). `test/app.e2e-spec.ts` must not be edited.
- Committed `env/` files contain **no secrets** — never `DATABASE_URL` or `JWT_SECRET` values.
- pnpm only; no console.log.
- The full suite (`pnpm test`), lint, and build must stay green after every task.

## File Structure

```
src/config/env-files.ts            (new — resolveEnvFiles helper)
src/config/env-files.spec.ts       (new)
src/config/env.validation.ts       (add APP_ENVS/AppEnv/APP_ENV field)
src/config/env.validation.spec.ts  (add APP_ENV cases)
src/app.module.ts                  (envFilePath: resolveEnvFiles(process.env))
env/.env.defaults                  (new, committed)
env/.env.dev                       (new, committed)
env/.env.staging                   (new, committed)
env/.env.beta                      (new, committed)
env/.env.production                (new, committed)
.gitignore                         (ignore env/.env.*.local)
docker-compose.yml                 (api: APP_ENV)
Dockerfile                         (ENV APP_ENV + copy env/)
.env.example                       (rewritten)
README.md, CLAUDE.md               (Environments docs)
```

---

### Task 1: `resolveEnvFiles` helper + `APP_ENV` validation

**Files:**
- Create: `src/config/env-files.ts`
- Create: `src/config/env-files.spec.ts`
- Modify: `src/config/env.validation.ts`
- Modify: `src/config/env.validation.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 2 relies on these exact names): `resolveEnvFiles(env: { APP_ENV?: string; NODE_ENV?: string }): string[]` from `src/config/env-files`; `APP_ENVS`, `AppEnv`, and the `APP_ENV` field on `EnvironmentVariables` from `src/config/env.validation`.

- [ ] **Step 1: Write the failing tests**

`src/config/env-files.spec.ts`:

```typescript
import { resolveEnvFiles } from './env-files';

describe('resolveEnvFiles', () => {
  it('returns the dev cascade by default', () => {
    expect(resolveEnvFiles({})).toEqual([
      '.env',
      'env/.env.dev.local',
      'env/.env.dev',
      'env/.env.defaults',
    ]);
  });

  it('returns the cascade for an explicit stage', () => {
    expect(resolveEnvFiles({ APP_ENV: 'staging' })).toEqual([
      '.env',
      'env/.env.staging.local',
      'env/.env.staging',
      'env/.env.defaults',
    ]);
  });

  it('keeps the stage-less test cascade when NODE_ENV is test', () => {
    expect(resolveEnvFiles({ NODE_ENV: 'test', APP_ENV: 'staging' })).toEqual([
      '.env.test',
      '.env',
    ]);
  });

  it('passes an unknown stage through (validation rejects it at boot)', () => {
    expect(resolveEnvFiles({ APP_ENV: 'nonsense' })).toEqual([
      '.env',
      'env/.env.nonsense.local',
      'env/.env.nonsense',
      'env/.env.defaults',
    ]);
  });
});
```

Append to `src/config/env.validation.spec.ts` (inside the existing
`describe('validateEnv', ...)` block, using the same base-config pattern
the file already uses for other cases — reuse its existing minimal valid
config object/helper):

```typescript
  it('defaults APP_ENV to dev', () => {
    const result = validateEnv({
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: 's',
    });
    expect(result.APP_ENV).toBe('dev');
  });

  it('accepts each known APP_ENV stage', () => {
    for (const stage of ['dev', 'staging', 'beta', 'production']) {
      const result = validateEnv({
        DATABASE_URL: 'postgresql://x',
        JWT_SECRET: 's',
        APP_ENV: stage,
      });
      expect(result.APP_ENV).toBe(stage);
    }
  });

  it('throws on an unknown APP_ENV', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://x',
        JWT_SECRET: 's',
        APP_ENV: 'qa',
      }),
    ).toThrow(/APP_ENV/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- env-files` and `pnpm test -- env.validation`
Expected: env-files FAILS (module not found); the three new validation cases FAIL (`APP_ENV` stripped by whitelist, so `result.APP_ENV` is undefined and the unknown-stage case does not throw).

- [ ] **Step 3: Implement**

`src/config/env-files.ts`:

```typescript
/**
 * Computes the ordered envFilePath list for ConfigModule. Earlier entries
 * take precedence in @nestjs/config, and injected process env always
 * beats every file. Missing files are skipped silently, so an unknown
 * stage falls through to validation, which rejects it at boot.
 */
export function resolveEnvFiles(env: {
  APP_ENV?: string;
  NODE_ENV?: string;
}): string[] {
  if (env.NODE_ENV === 'test') {
    return ['.env.test', '.env'];
  }
  const stage = env.APP_ENV ?? 'dev';
  return [
    '.env',
    `env/.env.${stage}.local`,
    `env/.env.${stage}`,
    'env/.env.defaults',
  ];
}
```

`src/config/env.validation.ts` — add below the `NODE_ENVS` export:

```typescript
export const APP_ENVS = ['dev', 'staging', 'beta', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];
```

and add the field to `EnvironmentVariables` directly under the
`NODE_ENV` property:

```typescript
  /** Deployment instance; selects which env/.env.<stage> file loads. */
  @IsIn(APP_ENVS)
  @IsOptional()
  APP_ENV: AppEnv = 'dev';
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- env-files`, `pnpm test -- env.validation`, then `pnpm test`, `pnpm lint`, `pnpm build`.
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/config
git commit -m "feat: add APP_ENV stage validation and env-file resolution helper"
```

---

### Task 2: `env/` directory + ConfigModule wiring + gitignore

**Files:**
- Create: `env/.env.defaults`, `env/.env.dev`, `env/.env.staging`, `env/.env.beta`, `env/.env.production`
- Modify: `src/app.module.ts` (envFilePath)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `resolveEnvFiles` from `src/config/env-files` (Task 1).
- Produces: the committed stage files Task 3 documents.

- [ ] **Step 1: Create the stage files**

`env/.env.defaults`:

```bash
# Shared baseline for every stage. Overridden by env/.env.<APP_ENV>,
# then .env, then injected process env (which always wins).
# Secrets (DATABASE_URL, JWT_SECRET) NEVER live in committed files —
# put them in the gitignored .env locally, or inject them in deployments.
JWT_ACCESS_EXPIRES_IN=300
JWT_REFRESH_EXPIRES_IN=604800
CORS_ORIGINS=
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

`env/.env.dev`:

```bash
# Local development instance (default when APP_ENV is unset).
NODE_ENV=development
PORT=3000
```

`env/.env.staging`:

```bash
# Staging instance — production runtime behavior, staging values.
NODE_ENV=production
PORT=3000
```

`env/.env.beta`:

```bash
# Beta instance — production runtime behavior, beta values.
NODE_ENV=production
PORT=3000
```

`env/.env.production`:

```bash
# Production instance.
NODE_ENV=production
PORT=3000
```

- [ ] **Step 2: Wire ConfigModule**

In `src/app.module.ts`, add the import:

```typescript
import { resolveEnvFiles } from './config/env-files';
```

and replace:

```typescript
      envFilePath:
        process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
```

with:

```typescript
      envFilePath: resolveEnvFiles(process.env),
```

- [ ] **Step 3: gitignore the local-override escape hatch**

In `.gitignore`, in the existing "dotenv environment variable files"
block, add one line:

```
env/.env.*.local
```

- [ ] **Step 4: Verify**

Run: `pnpm test`, `pnpm lint`, `pnpm build` — green.
Then a boot smoke proving stage selection (uses the real local `.env`
for secrets; PORT comes from the stage file unless `.env` overrides it —
temporarily ensure `.env` has no PORT line for this check, or accept
that `.env`'s PORT wins and assert on NODE_ENV-driven log format
instead):

```bash
APP_ENV=staging timeout 15 pnpm start:dev 2>&1 | head -30
```

Expected: app boots; because staging sets `NODE_ENV=production`, the log
output is JSON (no pino-pretty) — that alone proves the staging file
loaded. Confirm also that plain `pnpm start:dev` (no APP_ENV) still
boots with pretty dev logs.

Then confirm git sees the right things:

```bash
git status --short   # env/ files staged as new; no .env.*.local anywhere
git check-ignore -v env/.env.staging.local && echo ignored-ok
```

- [ ] **Step 5: Commit**

```bash
git add env .gitignore src/app.module.ts
git commit -m "feat: per-stage env directory selected by APP_ENV"
```

---

### Task 3: Docker, .env.example, docs

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the `env/` directory and `APP_ENV` semantics from Tasks 1–2.

- [ ] **Step 1: Docker**

`docker-compose.yml`, api service environment — add one line beside
`NODE_ENV: production`:

```yaml
      APP_ENV: production
```

`Dockerfile`, runtime stage — after `ENV NODE_ENV=production` add:

```dockerfile
ENV APP_ENV=production
```

and after the `COPY --from=build /app/dist ./dist` line add:

```dockerfile
COPY --from=build /app/env ./env
```

(The build stage's `COPY . .` already includes `env/`; `.dockerignore`
must not exclude it — check `.dockerignore` and, if it has a broad
`.env*` pattern, ensure it does not match the `env/` directory; add an
explicit `!env/` negation only if needed.)

- [ ] **Step 2: Rewrite `.env.example`**

```bash
# ── Instance selection ─────────────────────────────────────────────
# APP_ENV names the instance and picks which env/.env.<stage> file
# loads: dev | staging | beta | production   (default: dev)
# NODE_ENV is set BY the stage file — don't set it by hand.
# Precedence (first wins): injected process env > .env (this file's
# gitignored sibling) > env/.env.<stage>.local > env/.env.<stage>
# > env/.env.defaults
#APP_ENV=dev

# ── Secrets (required — keep in .env or inject; never commit) ──────
DATABASE_URL=postgresql://nestjs:strongpassword@localhost:5432/nestjs_starter
JWT_SECRET=change-me-strong-random-secret

# ── Optional local overrides (stage files carry the defaults) ──────
#PORT=3000
#CORS_ORIGINS=
#JWT_ACCESS_EXPIRES_IN=300
#JWT_REFRESH_EXPIRES_IN=604800
#THROTTLE_TTL=60
#THROTTLE_LIMIT=100
```

- [ ] **Step 3: Docs**

`README.md` — add an "Environments" section after the setup/env section
(match surrounding heading style):

```markdown
## Environments

The app runs as one of four instances selected by `APP_ENV`
(`dev` | `staging` | `beta` | `production`, default `dev`). Per-stage
non-secret config lives in the committed `env/` directory — one place to
see and diff every instance:

- `env/.env.defaults` — shared baseline
- `env/.env.<stage>` — stage values; each sets the right `NODE_ENV`
  (staging/beta/production run with `NODE_ENV=production`)
- `.env` (gitignored) — your machine's secrets (`DATABASE_URL`,
  `JWT_SECRET`) and personal overrides
- `env/.env.<stage>.local` (gitignored) — optional per-stage local
  overrides

Precedence, first wins: injected process env → `.env` →
`env/.env.<stage>.local` → `env/.env.<stage>` → `env/.env.defaults`.
Real deployments inject secrets as process env (see docker-compose.yml);
committed files never contain secrets.

Run a stage locally:

```bash
APP_ENV=staging pnpm start:dev
```
```

`CLAUDE.md` — in the paragraph about `.env`/validation (the one
starting "Requires a `.env` ..."), append:

```markdown
`APP_ENV` (`dev|staging|beta|production`, default `dev`) selects the
instance: `ConfigModule` loads, in precedence order, process env →
`.env` → `env/.env.<APP_ENV>.local` → `env/.env.<APP_ENV>` →
`env/.env.defaults` (`src/config/env-files.ts`). Committed `env/` files
hold non-secret per-stage values and set `NODE_ENV`; secrets stay in the
gitignored `.env` or injected vars. `NODE_ENV=test` keeps the stage-less
`['.env.test', '.env']` path.
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm test && pnpm lint && pnpm build` — green.
Docker sanity (config render only, no build):

```bash
JWT_SECRET=x sg docker -c "docker compose config" | grep -A2 APP_ENV
```

Expected: `APP_ENV: production` on the api service.

```bash
git add docker-compose.yml Dockerfile .env.example README.md CLAUDE.md
git commit -m "docs: document APP_ENV instances; wire docker stage selection"
```
