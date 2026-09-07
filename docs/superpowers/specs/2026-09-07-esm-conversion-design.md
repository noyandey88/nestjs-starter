# ESM Conversion — Design

**Date:** 2026-09-07
**Status:** Approved
**Base:** chore/migrate-to-oxlint (7a729c1)

## Problem

NestJS 12 ships ESM-only packages. The project compiles to CommonJS and
relies on Node's `require(esm)` bridge at runtime and on Node 24.9+ for
Jest. That works, but it diverges from the Nest 12 scaffold: top-level
`await` is unavailable, Jest needs `--experimental-vm-modules`, and the
scaffold's tooling (vitest, `.js` import extensions) cannot be adopted
piecemeal.

## Goal

Make the project a native ESM project matching the Nest 12 scaffold
(`../nest-upgrade-test` is the reference), with no change to app
behavior, routes, or the response envelope.

## Decisions

- **Test runner: vitest 4** (scaffold default). Decorator metadata under
  Vite 8's transformer is verified working on the reference project.
- **Path alias `src/*` is removed.** All internal imports become relative
  with explicit `.js` extensions. No Node subpath-import mapping.
- **Node 24 stays pinned** (from 7a729c1). Not strictly required once
  Jest is gone, but it is the current LTS and the Dockerfile/CI already
  use it.

## Design

### 1. Module format

- `package.json`: add `"type": "module"`.
- `tsconfig.json`: keep `module`/`moduleResolution` = `nodenext`; remove
  the `paths` block; set `types` to `["node", "vitest/globals"]`.
  `rootDir`/`outDir`/`incremental` unchanged. `ignoreDeprecations` stays
  until TypeScript 7.
- `tsconfig.build.json`: unchanged except `exclude` gains the vitest
  config files.
- `src/main.ts`: `void bootstrap()` becomes `await bootstrap()`.
- `node dist/main` (Dockerfile `CMD`, `start:prod`) keeps working: Node
  resolves the entry file's extension regardless of module type.

### 2. Imports

- 92 relative imports gain a `.js` extension.
- 32 `src/*` alias imports are rewritten to relative paths with `.js`.
- Rewrite is scripted (one-off, not committed), then enforced by `tsc`:
  under `nodenext` + ESM, extensionless relative imports are a compile
  error, so nothing can be missed silently.
- `src/database/schema/index.ts` barrel re-exports get `.js` too;
  drizzle-kit's `schema: './src/database/schema/*'` glob is unaffected
  because it reads source files, not import specifiers. Verified by
  `pnpm db:generate` producing no diff.
- No source file uses `require`, `__dirname`, `__filename`, dynamic
  `import()`, or JSON imports (surveyed 2026-09-07), so no shims.
- Named imports from CommonJS dependencies (nestjs-pino, throttler,
  terminus, jwt, bcrypt, class-validator, class-transformer, helmet,
  drizzle-orm, pg, dotenv) were probed under ESM on 2026-09-07 and all
  resolve. Any regression surfaces as a boot failure, caught in §5.

### 3. Test runner

Remove: `jest`, `ts-jest`, `ts-node`, `tsconfig-paths`, `@types/jest`
(if present), the `jest` block in `package.json`, `test/jest-e2e.json`.

Add: `vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths` (kept for
parity with the scaffold even though no alias remains).

Config files, mirroring the scaffold:

- `vitest.config.ts`: `globals: true`, `root: './'`,
  `include: ['src/**/*.spec.ts']`.
- `vitest.config.e2e.ts`: same, `include: ['test/**/*.e2e-spec.ts']`,
  env `NODE_ENV=test`, sequential file execution (`fileParallelism:
  false`) because e2e tests share one database.

Spec files (12): `jest.fn` → `vi.fn`, `jest.spyOn` → `vi.spyOn`,
`jest.restoreAllMocks` → `vi.restoreAllMocks`, `jest.Mock` → `Mock`,
`jest.Mocked<T>` → `Mocked<T>`; types imported from `vitest`. Globals
(`describe`, `it`, `expect`, `beforeEach`) stay unimported via
`globals: true`, as in the scaffold.

Scripts:

| script       | new value                                             |
|--------------|-------------------------------------------------------|
| `test`       | `vitest run`                                          |
| `test:watch` | `vitest`                                              |
| `test:cov`   | `vitest run --coverage`                               |
| `test:debug` | `vitest --inspect-brk --no-file-parallelism`          |
| `test:e2e`   | `vitest run --config ./vitest.config.e2e.ts`          |

No `NODE_OPTIONS` flags remain.

### 4. Tooling that reads project files

- `drizzle.config.ts`: its relative import gains `.js`. drizzle-kit
  bundles the config itself, so `.ts` source with `.js` specifiers is
  fine (same pattern as the app).
- `.oxlintrc.json`: `env.jest` → `env.vitest`.
- `db:create:test` script uses `require`; it moves to
  `scripts/create-test-db.mjs` with the same logic, invoked as
  `dotenv -e env/.env.test -- node scripts/create-test-db.mjs`.
- Dockerfile and CI workflow: unchanged.
- `CLAUDE.md`: update Commands (vitest), remove the `src/*` alias note,
  add the `.js`-extension import convention, note `type: module`.

### 5. Verification (definition of done)

1. `pnpm exec tsc --noEmit -p tsconfig.json` clean.
2. `pnpm build` clean; `dist/main.js` contains `import`, not `require`.
3. `pnpm test`: all 52 unit tests pass.
4. `pnpm lint:check` passes (the 3 pre-existing `no-misused-spread`
   warnings are allowed).
5. `pnpm db:generate` produces no new migration.
6. Runtime boot: `node dist/main` with the local env, `GET /health`
   returns 200, process exits cleanly on SIGTERM.
7. `pnpm test:e2e` if Postgres is reachable; otherwise recorded as not
   run.

### 6. Out of scope

- Any change to app behavior, DTOs, routes, or the envelope.
- oxlint rule changes beyond `env`.
- The three `no-misused-spread` warnings.
- Removing `ignoreDeprecations` from tsconfig.

## Risks

- **Mocking differences.** vitest's `vi.fn` typing is stricter than
  Jest's in places; a few spec type errors are expected and fixed
  locally, not by loosening tsconfig.
- **Hidden CommonJS assumption in a dependency.** Probed clean, but the
  boot check in §5 is the real gate.
- **Editor tooling.** VS Code's TS server needs a restart after
  `paths` is removed.
