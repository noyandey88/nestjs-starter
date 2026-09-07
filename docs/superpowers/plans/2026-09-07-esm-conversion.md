# ESM Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the CommonJS NestJS 12 project to native ESM with vitest, matching the Nest 12 scaffold, with no change to app behavior.

**Architecture:** Three tasks, each leaving the tree green. Task 1 swaps Jest for vitest while still CommonJS (vitest runs either format). Task 2 flips the module format: `"type": "module"`, `.js` import extensions everywhere, alias removal, top-level await, and the one `require`-based script moved to a file. Task 3 updates docs and lint env and runs the full definition-of-done.

**Tech Stack:** NestJS 12, TypeScript 6 (`module: nodenext`), vitest 4 on Vite 8, oxlint, Drizzle, pnpm 10, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-07-esm-conversion-design.md`

## Global Constraints

- Node `>=24.9.0` (already pinned in `package.json` engines, `.nvmrc`, CI, Dockerfile). Run everything with `PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"` if `node -v` is not 24.
- Package manager is pnpm only.
- Branch: `chore/migrate-to-oxlint` (continue on it; base commit c8a5337).
- App behavior, DTOs, routes, envelope, and oxlint rules are unchanged. Only `env` changes in `.oxlintrc.json`.
- The 3 existing `no-misused-spread` oxlint warnings are allowed; no new warnings.
- Never use `console.log` in app code. The new `scripts/create-test-db.mjs` is a CLI script, not app code, and may print errors via `console.error`.
- Commit message trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CUEg5nxKLXCRPKWSJ8RcXT
  ```

---

## File map

| File | Task | Change |
|---|---|---|
| `package.json` | 1, 2 | scripts, devDeps, `jest` block removed, `"type": "module"` |
| `vitest.config.ts` | 1 | new: unit config |
| `vitest.config.e2e.ts` | 1 | new: e2e config |
| `test/jest-e2e.json` | 1 | delete |
| `tsconfig.json` | 1, 2 | `types` → vitest globals; remove `paths` |
| `tsconfig.build.json` | 1 | exclude vitest configs |
| 6 spec files under `src/` | 1 | `jest.*` → `vi.*` and vitest types |
| all 62 `.ts` files in `src/` and `test/` | 2 | `.js` extensions, alias → relative |
| `src/main.ts` | 2 | `await bootstrap()` |
| `drizzle.config.ts` | 2 | `.js` extension |
| `scripts/create-test-db.mjs` | 2 | new: replaces inline `db:create:test` |
| `.oxlintrc.json` | 3 | `env.jest` → `env.vitest` |
| `CLAUDE.md` | 3 | commands, conventions |

---

### Task 1: Replace Jest with vitest (still CommonJS)

**Files:**
- Create: `vitest.config.ts`, `vitest.config.e2e.ts`
- Delete: `test/jest-e2e.json`
- Modify: `package.json` (scripts, devDependencies, remove `jest` block), `tsconfig.json` (`types`), `tsconfig.build.json` (`exclude`)
- Modify: `src/auth/auth.controller.spec.ts`, `src/auth/auth.service.spec.ts`, `src/course/course.service.spec.ts`, `src/health/drizzle.health.spec.ts`, `src/common/filters/http-exception.filter.spec.ts`, `src/common/interceptors/debug-payload.interceptor.spec.ts`

**Interfaces:**
- Produces: `pnpm test` runs vitest over `src/**/*.spec.ts`; `pnpm test:e2e` runs vitest over `test/**/*.e2e-spec.ts`. Task 2 relies on both scripts existing with these globs.

- [ ] **Step 1: Record the baseline**

Run: `pnpm test 2>&1 | grep -E "^(Tests|Test Suites):"`
Expected: `Test Suites: 12 passed, 12 total` and `Tests: 52 passed, 52 total`. If it fails with "Must use import to load ES Module", you are on Node 22; fix PATH per Global Constraints.

- [ ] **Step 2: Swap dependencies**

```bash
pnpm remove jest ts-jest ts-node tsconfig-paths @types/jest @eslint/eslintrc
pnpm add -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

`@eslint/eslintrc` is a leftover from the ESLint removal; it has no consumer.

- [ ] **Step 3: Write the vitest configs**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
```

`vitest.config.e2e.ts`:
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // e2e specs share one database; never run files concurrently.
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
  },
});
```

- [ ] **Step 4: Update package.json scripts and remove the jest block**

Replace the five test scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage",
"test:debug": "vitest --inspect-brk --no-file-parallelism",
"test:e2e": "vitest run --config ./vitest.config.e2e.ts",
```
Delete the entire top-level `"jest": { ... }` object. Delete `test/jest-e2e.json`:
```bash
git rm test/jest-e2e.json
```

- [ ] **Step 5: Point TypeScript at vitest globals**

`tsconfig.json`: change `"types": ["node", "jest"]` to `"types": ["node", "vitest/globals"]`.

`tsconfig.build.json`: change `exclude` to
```json
"exclude": ["node_modules", "test", "dist", "**/*spec.ts", "drizzle.config.ts", "vitest.config.ts", "vitest.config.e2e.ts"]
```

- [ ] **Step 6: Run the suite to see the expected failures**

Run: `pnpm test 2>&1 | grep -E "ReferenceError|jest is not defined|Test Files|Tests " | head`
Expected: failures of the form `ReferenceError: jest is not defined` in the 6 spec files listed above. Any other error type means a config step above is wrong; fix it before continuing.

- [ ] **Step 7: Convert the spec files**

Mechanical replacements, applied to the 6 files:

| Jest | vitest |
|---|---|
| `jest.fn(` | `vi.fn(` |
| `jest.spyOn(` | `vi.spyOn(` |
| `jest.restoreAllMocks(` | `vi.restoreAllMocks(` |
| `jest.Mocked<` | `Mocked<` |
| `jest.Mock` (type, not followed by `ed`) | `Mock` |
| `jest.SpyInstance` | `MockInstance` |

```bash
for f in src/auth/auth.controller.spec.ts src/auth/auth.service.spec.ts src/course/course.service.spec.ts src/health/drizzle.health.spec.ts src/common/filters/http-exception.filter.spec.ts src/common/interceptors/debug-payload.interceptor.spec.ts; do
  sed -i -E \
    -e 's/\bjest\.fn\(/vi.fn(/g' \
    -e 's/\bjest\.spyOn\(/vi.spyOn(/g' \
    -e 's/\bjest\.restoreAllMocks\(/vi.restoreAllMocks(/g' \
    -e 's/\bjest\.Mocked</Mocked</g' \
    -e 's/\bjest\.SpyInstance\b/MockInstance/g' \
    -e 's/\bjest\.Mock\b/Mock/g' \
    "$f"
done
grep -rn "jest\." src test && echo "LEFTOVERS ABOVE" || echo "no jest.* left"
```

Then add one import at the top of each file, listing only what that file uses (check with `grep -oE '\b(vi|Mocked|Mock|MockInstance)\b' <file> | sort -u`):

```ts
import { vi, type Mocked } from 'vitest';
```
Variants per file, based on the survey:
- `auth.controller.spec.ts`: `import { vi } from 'vitest';`
- `auth.service.spec.ts`: `import { vi, type Mocked } from 'vitest';`
- `course.service.spec.ts`: `import { vi, type Mocked } from 'vitest';`
- `drizzle.health.spec.ts`: `import { vi, type Mock } from 'vitest';`
- `http-exception.filter.spec.ts`: `import { vi, type Mock } from 'vitest';`
- `debug-payload.interceptor.spec.ts`: `import { vi, type MockInstance } from 'vitest';`

`describe`/`it`/`expect`/`beforeEach`/`afterEach` stay as globals.

- [ ] **Step 8: Run the suite and the type check**

Run: `pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL|Error"`
Expected: `Test Files  12 passed (12)` and `Tests  52 passed (52)`.

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output. If a `vi.fn()` typing error appears (vitest's `Mock` is generic over the function type, Jest's was over args/return), fix it at the call site by giving `vi.fn` the function type, e.g. `vi.fn<() => Promise<void>>()`. Do not loosen tsconfig.

Run: `pnpm build && pnpm lint:check 2>&1 | tail -3`
Expected: build clean; lint passes with the 3 known `no-misused-spread` warnings.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "test: replace Jest with vitest

vitest runs under CommonJS and ESM alike, so this lands before the
module-format flip and keeps the tree green at every step. Matches
the Nest 12 scaffold (vitest 4, globals, vite-tsconfig-paths).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CUEg5nxKLXCRPKWSJ8RcXT"
```

---

### Task 2: Flip to ESM

**Files:**
- Modify: `package.json` (`"type": "module"`, `db:create:test` script)
- Modify: `tsconfig.json` (remove `paths`)
- Modify: every `.ts` under `src/` and `test/` (import specifiers), `drizzle.config.ts`
- Modify: `src/main.ts:66`
- Create: `scripts/create-test-db.mjs`

**Interfaces:**
- Consumes: `pnpm test` / `pnpm test:e2e` from Task 1.
- Produces: an ESM project. Task 3 relies on `pnpm build` emitting `import` statements in `dist/`.

- [ ] **Step 1: Add `"type": "module"` and see the compiler reject the old imports**

In `package.json`, add `"type": "module",` directly after the `"license"` line (mirrors the scaffold's placement).

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "TS2835\|TS2834"`
Expected: a positive count. TS2835 is "Relative import paths need explicit file extensions in ECMAScript imports". This is the failing check that Step 3 makes pass.

- [ ] **Step 2: Write the one-off import rewriter (scratch, not committed)**

Save as `$SCRATCH/rewrite-imports.mjs` where `$SCRATCH` is the session scratchpad directory. It rewrites `from '...'` and `export ... from '...'` specifiers that are either relative or start with `src/`, appending `.js`, or `/index.js` when the target is a directory.

```js
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

function resolveSpecifier(fromFile, spec) {
  const base = spec.startsWith('src/')
    ? resolve(SRC, spec.slice(4))
    : resolve(dirname(fromFile), spec);
  let target;
  if (existsSync(base + '.ts')) target = base + '.js';
  else if (existsSync(base) && statSync(base).isDirectory() && existsSync(join(base, 'index.ts')))
    target = join(base, 'index.js');
  else throw new Error(`${fromFile}: cannot resolve '${spec}'`);
  let rel = relative(dirname(fromFile), target).split('\\').join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

const SPEC_RE = /((?:import|export)\s[^'"]*?from\s*)(['"])([^'"]+)\2/g;
let changed = 0;
for (const dir of ['src', 'test']) {
  for (const file of walk(resolve(ROOT, dir))) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(SPEC_RE, (m, head, q, spec) => {
      if (!(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('src/'))) return m;
      if (/\.(js|json)$/.test(spec)) return m;
      return `${head}${q}${resolveSpecifier(file, spec)}${q}`;
    });
    if (after !== before) { writeFileSync(file, after); changed++; }
  }
}
console.log(`rewrote ${changed} files`);
```

- [ ] **Step 3: Run the rewriter, then the compiler**

```bash
node "$SCRATCH/rewrite-imports.mjs"
grep -rnE "from '(\.\.?/[^']*[^s]|src/)[^']*'" src test | grep -v "\.js'" ; echo "(above must be empty)"
pnpm exec tsc --noEmit -p tsconfig.json
```
Expected: `rewrote N files` (N around 55), the grep prints nothing, and tsc is clean except possibly one error on `src/main.ts` about `void` vs top-level await — none expected yet since `void bootstrap()` is still valid ESM.

Sanity-check the barrel and one alias rewrite by eye:
```bash
cat src/database/schema/index.ts
grep -n "from '" src/course/course.controller.ts
```
Expected: barrel lines end in `.schema.js'`; the controller's former `src/common/...` imports are now `../common/....js`.

- [ ] **Step 4: Remove the tsconfig path alias**

In `tsconfig.json`, delete the `"paths": { "src/*": ["./src/*"] }` block. Then:

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```
Expected: clean. If anything still imports `src/...`, the rewriter missed it; fix by hand with a relative `.js` path.

- [ ] **Step 5: Top-level await in main.ts and drizzle config extension**

`src/main.ts` last line: `void bootstrap();` → `await bootstrap();`

`drizzle.config.ts` line 3: `from './src/config/env-files';` → `from './src/config/env-files.js';`

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm build && grep -c "^import " dist/main.js && ! grep -q "require(" dist/main.js && echo "dist is ESM"`
Expected: tsc clean, build clean, a positive import count, and `dist is ESM`.

- [ ] **Step 6: Move the `require`-based script to a file**

Create `scripts/create-test-db.mjs`:
```js
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
```

In `package.json`, replace the `db:create:test` value with:
```json
"db:create:test": "dotenv -e env/.env.test -- node scripts/create-test-db.mjs"
```

Run: `node --check scripts/create-test-db.mjs && echo syntax-ok`
Expected: `syntax-ok`. (A live run needs Postgres; it is exercised in Task 3 if available.)

- [ ] **Step 7: Full green check**

```bash
pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL"
pnpm lint:check 2>&1 | grep -cE "warning|error"
pnpm db:generate 2>&1 | tail -2
git status --short drizzle/
```
Expected: `12 passed`, `52 passed`; lint count is exactly `3` (the known warnings); db:generate reports no schema changes and `git status` shows nothing new under `drizzle/`.

- [ ] **Step 8: Runtime boot check**

Build already ran in Step 5. Start the app against the local env, hit health, stop it:
```bash
(node dist/main > "$SCRATCH/boot.log" 2>&1 &) ; sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
pkill -TERM -f "node dist/main"; sleep 1
grep -iE "error|cannot find|ERR_" "$SCRATCH/boot.log" || echo "boot log clean"
```
Expected: `200` if Postgres is up (the health check runs `SELECT 1`), or `503` with a log line about the database if it is not. Either proves the ESM bundle loaded every dependency. Any `ERR_MODULE_NOT_FOUND`, `ERR_REQUIRE_ESM`, or `SyntaxError: The requested module ... does not provide an export named` line is a real failure: identify the package and switch that import to a default import plus destructure.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "build: convert project to native ESM

- package.json type: module; tsconfig paths alias removed
- all internal imports relative with explicit .js extensions
- main.ts uses top-level await
- db:create:test moved to scripts/create-test-db.mjs (was inline require)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CUEg5nxKLXCRPKWSJ8RcXT"
```

---

### Task 3: Lint env, docs, and definition-of-done

**Files:**
- Modify: `.oxlintrc.json`, `CLAUDE.md`

**Interfaces:**
- Consumes: the ESM project from Task 2.
- Produces: nothing downstream; this closes the spec.

- [ ] **Step 1: oxlint env**

In `.oxlintrc.json`, change `"jest": true` to `"vitest": true`.

Run: `pnpm lint:check 2>&1 | grep -cE "warning|error"`
Expected: `3`. If `vitest` is rejected as an env name, check `pnpm exec oxlint --help` and the configuration schema at `node_modules/oxlint/configuration_schema.json` for the accepted key.

- [ ] **Step 2: CLAUDE.md**

Edit these spots:

1. Commands block, replace the three test lines:
   ```
   pnpm test               # run all unit tests with vitest (*.spec.ts under src/)
   pnpm test -- course.service   # run a single test file (vitest filename filter)
   pnpm test:watch
   ```
   and the e2e line's comment becomes `# e2e tests (vitest.config.e2e.ts) — requires:`.
2. Under **Conventions**, replace the path-alias bullet with:
   ```
   - The project is native ESM (`"type": "module"`, `module: nodenext`). Every relative import must carry an explicit `.js` extension (`./foo.js`, `../bar/index.js`), even though the source is `.ts`; tsc rejects extensionless imports. There is no `src/*` alias.
   ```
3. In **Architecture**, the sentence describing `main.ts` gains: `main.ts` ends in top-level `await bootstrap()`.
4. Under **Commands** after the db lines, note: `pnpm db:create:test` runs `scripts/create-test-db.mjs`.

- [ ] **Step 3: Definition of done, end to end**

```bash
node -v
pnpm exec tsc --noEmit -p tsconfig.json && echo tsc-ok
pnpm build && echo build-ok
pnpm test 2>&1 | grep -E "Test Files|Tests "
pnpm lint:check 2>&1 | grep -cE "warning|error"
pnpm db:generate 2>&1 | tail -1 && git status --short drizzle/
```
Expected: v24.x, `tsc-ok`, `build-ok`, `12 passed` / `52 passed`, `3`, no schema change.

E2E, only if Postgres is reachable (`docker compose ps postgres` shows running, or `pg_isready`):
```bash
pnpm db:create:test && pnpm db:migrate:test && pnpm test:e2e 2>&1 | grep -E "Test Files|Tests |FAIL"
```
Expected: all e2e tests pass. If Postgres is not reachable, record "e2e not run: no database" in the commit message and the final report.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: ESM and vitest conventions; oxlint vitest env

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CUEg5nxKLXCRPKWSJ8RcXT"
```

---

## Self-review

- **Spec coverage.** §1 module format → Task 2 Steps 1, 4, 5. §2 imports → Task 2 Steps 2–4, barrel checked in Step 3, db:generate in Step 7. §3 test runner → Task 1 entirely. §4 tooling → drizzle config Task 2 Step 5, oxlint env Task 3 Step 1, create-test-db Task 2 Step 6, CLAUDE.md Task 3 Step 2. §5 verification → Task 2 Steps 7–8 and Task 3 Step 3. §6 out of scope → no task touches those.
- **Placeholders.** None; every code step has its content.
- **Consistency.** Script names (`test`, `test:e2e`, `db:create:test`), file names (`vitest.config.ts`, `vitest.config.e2e.ts`, `scripts/create-test-db.mjs`), and the `$SCRATCH` convention are used identically across tasks.
