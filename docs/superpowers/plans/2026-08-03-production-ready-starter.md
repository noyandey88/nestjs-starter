# Production-Ready NestJS Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the NestJS + Drizzle starter template into a secure, observable, dockerized, CI-tested public template, with the `course` module as the canonical example resource.

**Architecture:** Keep the existing module-per-feature layout (controller → service → repository, global `DRIZZLE_ORM` provider, global ValidationPipe/ResponseInterceptor/AllExceptionsFilter). Layer in production concerns: validated env config, helmet/CORS/throttler, pino logging, terminus health check, graceful pool shutdown, Docker, GitHub Actions.

**Tech Stack:** NestJS 11, Drizzle ORM 0.45 + pg, pnpm 10, Jest 30, new deps: `helmet`, `@nestjs/throttler`, `@nestjs/terminus`, `nestjs-pino` + `pino-http` + `pino`, dev: `pino-pretty`, `dotenv-cli`.

**Spec:** `docs/superpowers/specs/2026-08-03-production-ready-starter-design.md`

## Global Constraints

- Package manager is **pnpm** (v10). Never use npm/yarn commands.
- Path alias `src/*` resolves from project root (tsconfig `paths` + jest `moduleNameMapper`).
- All API responses keep the envelope `{ success, status, message, payload }` via the existing `ResponseBuilder` / `ResponseInterceptor` — do not change this contract.
- Refresh tokens stay in the JSON response body (decided in spec).
- No `process.env` reads in application code after Task 1 — always `ConfigService` (exceptions: `drizzle.config.ts` which runs outside Nest, and `env.validation.ts` itself).
- Never log secrets, connection strings, passwords, or raw tokens.
- JWT expiry env vars are expressed in **seconds** (integers): `JWT_ACCESS_EXPIRES_IN` default 300, `JWT_REFRESH_EXPIRES_IN` default 604800. (Refines the spec's `5m`/`7d` strings — avoids a duration parser.)
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- After each task run `pnpm lint && pnpm test` and ensure both pass before committing (e2e only in Task 8+ when a DB is available).

---

### Task 1: Env validation & config-driven auth

**Files:**
- Create: `src/config/env.validation.ts`
- Test: `src/config/env.validation.spec.ts`
- Create: `.env.example`
- Modify: `src/app.module.ts` (ConfigModule options)
- Modify: `src/auth/auth.module.ts` (registerAsync, drop inner ConfigModule)
- Modify: `src/auth/auth.guard.ts` (drop explicit secret)
- Modify: `src/auth/auth.service.ts` (config-driven expiries)
- Modify: `src/main.ts` (port via ConfigService)
- Delete: `src/auth/constants.ts`

**Interfaces:**
- Produces: `validateEnv(config: Record<string, unknown>): EnvironmentVariables` and class `EnvironmentVariables` with typed fields `DATABASE_URL: string`, `JWT_SECRET: string`, `PORT: number`, `NODE_ENV: 'development'|'production'|'test'`, `JWT_ACCESS_EXPIRES_IN: number`, `JWT_REFRESH_EXPIRES_IN: number`, `CORS_ORIGINS: string`, `THROTTLE_TTL: number`, `THROTTLE_LIMIT: number`. Later tasks read these keys through `ConfigService`.

- [ ] **Step 1: Write the failing test** — `src/config/env.validation.spec.ts`:

```typescript
import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'test-secret',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const result = validateEnv({ ...validEnv });
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.JWT_ACCESS_EXPIRES_IN).toBe(300);
    expect(result.JWT_REFRESH_EXPIRES_IN).toBe(604800);
    expect(result.THROTTLE_TTL).toBe(60);
    expect(result.THROTTLE_LIMIT).toBe(100);
    expect(result.CORS_ORIGINS).toBe('');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_SECRET: 'x' })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('coerces numeric strings from the environment', () => {
    const result = validateEnv({ ...validEnv, PORT: '8080', THROTTLE_LIMIT: '5' });
    expect(result.PORT).toBe(8080);
    expect(result.THROTTLE_LIMIT).toBe(5);
  });

  it('throws on non-numeric PORT', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- env.validation`
Expected: FAIL — cannot find module `./env.validation`.

- [ ] **Step 3: Implement `src/config/env.validation.ts`**

```typescript
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsIn(NODE_ENVS)
  @IsOptional()
  NODE_ENV: NodeEnv = 'development';

  /** Access-token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: number = 300;

  /** Refresh-token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: number = 604800;

  /** Comma-separated list of allowed origins. Empty disables CORS. */
  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '';

  /** Rate-limit window in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_TTL: number = 60;

  /** Max requests per window per client. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 100;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Environment validation failed:\n  ${details}`);
  }
  return validated;
}
```

Note: `whitelist: true` means the validated object contains only declared keys; ConfigService will still fall back to raw `process.env` for others, which is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- env.validation`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire ConfigModule in `src/app.module.ts`** — change only the ConfigModule import options:

```typescript
import { validateEnv } from './config/env.validation';
// ...
ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
  envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
}),
```

- [ ] **Step 6: Make auth config-driven**

`src/auth/auth.module.ts` — full new content:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { RefreshTokenRepository } from './refresh-token.repository';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>('JWT_ACCESS_EXPIRES_IN'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenRepository],
})
export class AuthModule {}
```

`src/auth/auth.guard.ts` — the `verifyAsync` call drops the explicit secret (the globally registered JwtModule secret is used); also remove the two tutorial comments:

```typescript
      const payload: unknown = await this.jwtService.verifyAsync(token);
      request.user = payload;
```

`src/auth/auth.service.ts` — inject ConfigService and use configured lifetimes. Constructor gains `private readonly configService: ConfigService` (import from `@nestjs/config`). Replace the hardcoded lifetimes in the two private methods:

```typescript
  private async issueAccessToken(userId: number, email: string, role: string) {
    const payload = { sub: userId, email: email, role: role };
    const token = await this.jwtService.signAsync(payload);
    const expiresIn = this.configService.get<number>('JWT_ACCESS_EXPIRES_IN')!;

    return {
      accessToken: token,
      expiresIn,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    };
  }

  private async issueRefreshToken(userId: number) {
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await bcrypt.hash(rawRefreshToken, 10);
    const expiresIn = this.configService.get<number>('JWT_REFRESH_EXPIRES_IN')!;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.refreshTokenRepository.create({ userId, tokenHash, expiresAt });

    return {
      refreshToken: rawRefreshToken,
      expiresIn,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };
  }
```

Delete `src/auth/constants.ts` (unused; reads process.env at import time).

`src/main.ts` — resolve port via config (add near the end of `bootstrap`):

```typescript
import { ConfigService } from '@nestjs/config';
// ... after SwaggerModule.setup:
const configService = app.get(ConfigService);
await app.listen(configService.get<number>('PORT')!);
```

- [ ] **Step 7: Create `.env.example`** (committed; `.env` stays gitignored):

```bash
# --- Required ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nestjs_starter
JWT_SECRET=change-me-to-a-long-random-string

# --- Optional (defaults shown) ---
PORT=3000
NODE_ENV=development
# Token lifetimes in seconds (300 = 5 min, 604800 = 7 days)
JWT_ACCESS_EXPIRES_IN=300
JWT_REFRESH_EXPIRES_IN=604800
# Comma-separated allowed origins; empty disables CORS
CORS_ORIGINS=
# Rate limiting: max THROTTLE_LIMIT requests per THROTTLE_TTL seconds
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all pass. Also sanity-check fail-fast: `JWT_SECRET= DATABASE_URL= pnpm start` should exit with `Environment validation failed` mentioning both vars (Ctrl-C not needed; it aborts).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: validate environment at boot and make auth config-driven"
```

---

### Task 2: Security hardening (helmet, CORS, throttler, leak removal)

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/main.ts` (helmet, CORS)
- Modify: `src/app.module.ts` (ThrottlerModule + APP_GUARD)
- Modify: `src/auth/auth.controller.ts` (@Throttle overrides, remove password logging trigger — see below)
- Modify: `src/auth/auth.service.ts` (remove `Logger.log(dto)` lines)
- Modify: `src/database/database.provider.ts` (remove DATABASE_URL log)

**Interfaces:**
- Consumes: `THROTTLE_TTL`, `THROTTLE_LIMIT`, `CORS_ORIGINS` from Task 1's env schema.
- Produces: global `ThrottlerGuard` via `APP_GUARD`; later tasks must add `@SkipThrottle()` to the health endpoint (Task 4 does this).

- [ ] **Step 1: Install dependencies**

Run: `pnpm add helmet @nestjs/throttler`

- [ ] **Step 2: Remove the two secret/PII leaks**

In `src/database/database.provider.ts` delete the line `console.log('DATABASE_URL:', databaseUrl);`.

In `src/auth/auth.service.ts` delete both `Logger.log(registerUserDto);` and `Logger.log(loginDto);` lines (they log plaintext passwords) and the now-unused `Logger` import.

- [ ] **Step 3: helmet + CORS in `src/main.ts`** (after `NestFactory.create`):

```typescript
import helmet from 'helmet';
// ... inside bootstrap, before global pipes:
app.use(helmet());

const configService = app.get(ConfigService); // move the Task 1 lookup up here
const corsOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.enableCors({ origin: corsOrigins });
}
```

- [ ] **Step 4: Global throttling in `src/app.module.ts`**

```typescript
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
// imports array gains:
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [
      {
        ttl: config.get<number>('THROTTLE_TTL')! * 1000, // throttler expects ms
        limit: config.get<number>('THROTTLE_LIMIT')!,
      },
    ],
  }),
}),
// providers array gains:
{ provide: APP_GUARD, useClass: ThrottlerGuard },
```

- [ ] **Step 5: Stricter limits on auth endpoints** — in `src/auth/auth.controller.ts` add to each of `register`, `login`, and `refreshAccessToken` handlers:

```typescript
import { Throttle } from '@nestjs/throttler';
// on each of the three handlers:
@Throttle({ default: { limit: 10, ttl: 60_000 } })
```

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: pass. Optionally boot the app and confirm `429 Too Many Requests` after 11 rapid `POST /auth/login` attempts.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add helmet, config-driven CORS, rate limiting; stop logging secrets"
```

---

### Task 3: Structured logging with pino

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/app.module.ts` (LoggerModule)
- Modify: `src/main.ts` (bufferLogs + useLogger)

**Interfaces:**
- Consumes: `NODE_ENV` from env schema.
- Produces: app-wide logger; the existing `new Logger(...)` / `Logger.log` calls (e.g. in `AllExceptionsFilter`) automatically route through pino once `app.useLogger` is set — no filter changes needed.

- [ ] **Step 1: Install**

Run: `pnpm add nestjs-pino pino-http pino && pnpm add -D pino-pretty`

- [ ] **Step 2: Register LoggerModule in `src/app.module.ts`**

```typescript
import { LoggerModule } from 'nestjs-pino';
// imports array gains:
LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const nodeEnv = config.get<string>('NODE_ENV');
    return {
      pinoHttp: {
        level: nodeEnv === 'production' ? 'info' : 'debug',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport:
          nodeEnv === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    };
  },
}),
```

- [ ] **Step 3: Use it in `src/main.ts`**

```typescript
import { Logger } from 'nestjs-pino';
// change the create call and add useLogger immediately after:
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```

(Note: `Logger` here is nestjs-pino's, not `@nestjs/common`'s — keep imports distinct.)

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm build && pnpm test`, then `pnpm start:dev` briefly: startup logs are pretty-printed; a request to `/` produces a request log line; an `Authorization: Bearer xyz` header shows as `[Redacted]`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: structured request logging with nestjs-pino"
```

---

### Task 4: Health check & graceful shutdown

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/database/database.constants.ts` (add `PG_POOL`)
- Modify: `src/database/database.provider.ts` (split pool/drizzle providers)
- Modify: `src/database/database.module.ts` (register providers + lifecycle)
- Create: `src/health/health.module.ts`
- Create: `src/health/health.controller.ts`
- Create: `src/health/drizzle.health.ts`
- Test: `src/health/drizzle.health.spec.ts`
- Modify: `src/app.module.ts` (import HealthModule)
- Modify: `src/main.ts` (enableShutdownHooks)

**Interfaces:**
- Consumes: `DRIZZLE_ORM` token; `ThrottlerGuard` global guard from Task 2 (health opts out via `@SkipThrottle()`).
- Produces: `PG_POOL` injection token (a `pg.Pool`); `GET /health` endpoint; `DrizzleHealthIndicator.isHealthy(key: string): Promise<HealthIndicatorResult>`.

- [ ] **Step 1: Install**

Run: `pnpm add @nestjs/terminus`

- [ ] **Step 2: Write the failing indicator test** — `src/health/drizzle.health.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle.health';
import { DRIZZLE_ORM } from 'src/database/database.constants';

describe('DrizzleHealthIndicator', () => {
  const createIndicator = async (execute: jest.Mock) => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      providers: [
        DrizzleHealthIndicator,
        { provide: DRIZZLE_ORM, useValue: { execute } },
      ],
    }).compile();
    return moduleRef.get(DrizzleHealthIndicator);
  };

  it('reports up when SELECT 1 succeeds', async () => {
    const indicator = await createIndicator(jest.fn().mockResolvedValue([]));
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('up');
  });

  it('reports down when the query throws', async () => {
    const indicator = await createIndicator(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );
    const result = await indicator.isHealthy('database');
    expect(result.database.status).toBe('down');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- drizzle.health`
Expected: FAIL — cannot find module `./drizzle.health`.

- [ ] **Step 4: Implement**

`src/health/drizzle.health.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_ORM } from 'src/database/database.constants';
import * as schema from 'src/database/schema';

@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'query failed',
      });
    }
  }
}
```

`src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { DrizzleHealthIndicator } from './drizzle.health';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DrizzleHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.dbIndicator.isHealthy('database')]);
  }
}
```

`src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DrizzleHealthIndicator } from './drizzle.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator],
})
export class HealthModule {}
```

Add `HealthModule` to the imports array in `src/app.module.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- drizzle.health`
Expected: PASS (2 tests).

- [ ] **Step 6: Graceful shutdown — split the pool provider**

`src/database/database.constants.ts`:

```typescript
export const DRIZZLE_ORM = 'DRIZZLE_ORM';
export const PG_POOL = 'PG_POOL';
```

`src/database/database.provider.ts` — full new content:

```typescript
import { Inject, Injectable, OnApplicationShutdown, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DRIZZLE_ORM, PG_POOL } from './database.constants';
import * as schema from './schema';

export const PoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({ connectionString: config.get<string>('DATABASE_URL') }),
};

export const DatabaseProvider: Provider = {
  provide: DRIZZLE_ORM,
  inject: [PG_POOL],
  useFactory: (pool: Pool) => drizzle(pool, { schema }),
};

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
```

`src/database/database.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import {
  DatabaseLifecycle,
  DatabaseProvider,
  PoolProvider,
} from './database.provider';

@Global()
@Module({
  providers: [PoolProvider, DatabaseProvider, DatabaseLifecycle],
  exports: [DatabaseProvider],
})
export class DatabaseModule {}
```

(The previous `imports: [ConfigModule]` is unnecessary — ConfigModule is global.)

`src/main.ts` — add after `useLogger`:

```typescript
app.enableShutdownHooks();
```

- [ ] **Step 7: Verify**

Run: `pnpm lint && pnpm build && pnpm test`. With the app + DB running: `curl localhost:3000/health` → 200 with `"status":"up"` for database (wrapped in the response envelope — expected); SIGTERM (`kill <pid>`) exits cleanly without pg pool warnings.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: health endpoint with db ping and graceful pool shutdown"
```

---

### Task 5: Polish course module as canonical reference

**Files:**
- Modify: `src/course/course.controller.ts` (ParseIntPipe, duplicate decorator)
- Modify: `src/course/dto/update-course.dto.ts` (true PartialType)
- Modify: `src/course/dto/create-course.dto.ts` (@ApiProperty examples)
- Delete: `src/course/entities/` (empty placeholder class)

**Interfaces:**
- Consumes: existing `CourseService` methods (unchanged signatures).
- Produces: `update`/`findOne`/`remove` controller params become `@Param('id', ParseIntPipe) id: number` — service calls drop the `+id` coercion.

- [ ] **Step 1: DTO cleanup**

`src/course/dto/update-course.dto.ts` — full new content (the current version re-declares all fields as required, defeating `PartialType`):

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateCourseDto } from './create-course.dto';

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
```

`src/course/dto/create-course.dto.ts` — add examples so Swagger shows realistic payloads:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'Intro to TypeScript' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'A beginner-friendly TypeScript course' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;

  @ApiProperty({ example: 'beginner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  level!: string;
}
```

- [ ] **Step 2: Controller cleanup** — in `src/course/course.controller.ts`:

- Import `ParseIntPipe` from `@nestjs/common`.
- `findOne`, `update`, `remove`: change `@Param('id') id: string` to `@Param('id', ParseIntPipe) id: number` and pass `id` (drop the `+id`).
- Remove the duplicated `@HttpCode(HttpStatus.OK)` on `update` (it appears twice).

- [ ] **Step 3: Delete the placeholder entity**

Run: `rm -r src/course/entities` (the `Course {}` class is empty and unused; Drizzle `InferSelectModel` types in the repository are the source of truth).

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: pass. `GET /courses/get/abc` now returns 400 (ParseIntPipe) instead of passing `NaN` to the DB.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: polish course module as the template reference resource"
```

---

### Task 6: Real unit tests for CourseService; delete scaffold specs

**Files:**
- Rewrite: `src/course/course.service.spec.ts`
- Delete: `src/course/course.controller.spec.ts`, `src/auth/auth.controller.spec.ts`, `src/user/user.controller.spec.ts`, `src/user/user.service.spec.ts`
- Keep: `src/app.controller.spec.ts`, `src/common/filters/http-exception.filter.spec.ts` (they contain real assertions)

**Interfaces:**
- Consumes: `CourseService` (constructor takes `CourseRepository`), methods `create(dto, creatorEmail)`, `findAll()`, `findOne(id)`, `update(id, dto, updaterEmail)`, `remove(id)`; service throws `NotFoundException` for missing ids.

- [ ] **Step 1: Rewrite `src/course/course.service.spec.ts`**

```typescript
import { NotFoundException } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseRepository } from './course.repository';

describe('CourseService', () => {
  let service: CourseService;
  let repository: jest.Mocked<CourseRepository>;

  const course = {
    id: 1,
    name: 'Intro to TypeScript',
    description: 'A beginner-friendly TypeScript course',
    level: 'beginner',
    createdBy: 'creator@example.com',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CourseRepository>;
    service = new CourseService(repository);
  });

  describe('create', () => {
    it('delegates to the repository with the creator email', async () => {
      repository.create.mockResolvedValue(course);
      const dto = { name: course.name, description: course.description, level: course.level };

      const result = await service.create(dto, 'creator@example.com');

      expect(repository.create).toHaveBeenCalledWith(dto, 'creator@example.com');
      expect(result).toEqual(course);
    });
  });

  describe('findAll', () => {
    it('returns all courses', async () => {
      repository.findAll.mockResolvedValue([course]);
      await expect(service.findAll()).resolves.toEqual([course]);
    });
  });

  describe('findOne', () => {
    it('returns the course when it exists', async () => {
      repository.findOne.mockResolvedValue(course);
      await expect(service.findOne(1)).resolves.toEqual(course);
    });

    it('throws NotFoundException when it does not exist', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates when the course exists', async () => {
      repository.findOne.mockResolvedValue(course);
      repository.update.mockResolvedValue({ ...course, name: 'Renamed' });

      const result = await service.update(1, { name: 'Renamed' }, 'editor@example.com');

      expect(repository.update).toHaveBeenCalledWith(1, { name: 'Renamed' }, 'editor@example.com');
      expect(result?.name).toBe('Renamed');
    });

    it('throws NotFoundException and does not update when missing', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.update(999, {}, 'e@example.com')).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes when the course exists', async () => {
      repository.findOne.mockResolvedValue(course);
      repository.remove.mockResolvedValue(undefined);
      await service.remove(1);
      expect(repository.remove).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when missing', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run to verify they pass**

Run: `pnpm test -- course.service`
Expected: PASS (8 tests).

- [ ] **Step 3: Delete scaffold-only specs** (each contains only a `toBeDefined` smoke check):

```bash
rm src/course/course.controller.spec.ts src/auth/auth.controller.spec.ts \
   src/user/user.controller.spec.ts src/user/user.service.spec.ts
```

Before deleting, confirm each file only asserts `toBeDefined()`; if one contains real assertions, keep it.

- [ ] **Step 4: Full test run**

Run: `pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: real CourseService unit tests; drop scaffold specs"
```

---

### Task 7: Real unit tests for AuthService

**Files:**
- Rewrite: `src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `AuthService` constructor `(userService, jwtService, refreshTokenRepository, configService)` — order as modified in Task 1. Methods: `registerUser(dto)`, `loginUser(dto)`, `refreshAccessToken(userId, refreshToken)`, `logout(userId)`.

- [ ] **Step 1: Rewrite `src/auth/auth.service.spec.ts`**

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from 'src/user/user.service';
import { RefreshTokenRepository } from './refresh-token.repository';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let refreshTokenRepository: jest.Mocked<RefreshTokenRepository>;

  const safeUser = {
    id: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    userService = {
      createUser: jest.fn(),
      findUser: jest.fn(),
      findUserById: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as jest.Mocked<JwtService>;
    refreshTokenRepository = {
      create: jest.fn(),
      findActiveUserById: jest.fn(),
      revokeToken: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenRepository>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_EXPIRES_IN' ? 300 : 604800,
      ),
    } as unknown as ConfigService;

    service = new AuthService(
      userService,
      jwtService,
      refreshTokenRepository,
      configService,
    );
  });

  describe('registerUser', () => {
    it('hashes the password before delegating to userService', async () => {
      userService.createUser.mockResolvedValue(safeUser as never);
      const dto = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'plain-password',
      };

      await service.registerUser(dto);

      const passed = userService.createUser.mock.calls[0][0];
      expect(passed.password).not.toBe('plain-password');
      await expect(
        bcrypt.compare('plain-password', passed.password),
      ).resolves.toBe(true);
    });
  });

  describe('loginUser', () => {
    it('returns tokens and user on success', async () => {
      userService.findUser.mockResolvedValue(safeUser as never);
      refreshTokenRepository.create.mockResolvedValue([] as never);

      const result = await service.loginUser({
        email: safeUser.email,
        password: 'plain-password',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.accessTokenExpiresIn).toBe(300);
      expect(result.refreshTokenExpiresIn).toBe(604800);
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: safeUser.id }),
      );
      // stored hash must not be the raw refresh token
      const stored = refreshTokenRepository.create.mock.calls[0][0];
      expect(stored.tokenHash).not.toBe(result.refreshToken);
    });
  });

  describe('refreshAccessToken', () => {
    const makeStored = async (raw: string, overrides = {}) => ({
      id: 10,
      userId: 1,
      tokenHash: await bcrypt.hash(raw, 4),
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      ...overrides,
    });

    it('rotates the matching token and issues a new access token', async () => {
      const raw = 'raw-refresh-token';
      refreshTokenRepository.findActiveUserById.mockResolvedValue([
        await makeStored(raw),
      ]);
      userService.findUserById.mockResolvedValue(safeUser as never);

      const result = await service.refreshAccessToken(1, raw);

      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith(10);
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('revokes all tokens and throws when no stored token matches', async () => {
      refreshTokenRepository.findActiveUserById.mockResolvedValue([
        await makeStored('a-different-token'),
      ]);

      await expect(
        service.refreshAccessToken(1, 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });

    it('throws when the matching token is expired', async () => {
      const raw = 'raw-refresh-token';
      refreshTokenRepository.findActiveUserById.mockResolvedValue([
        await makeStored(raw, { expiresAt: new Date(Date.now() - 1000) }),
      ]);

      await expect(service.refreshAccessToken(1, raw)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes all refresh tokens for the user', async () => {
      await service.logout(1);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test -- auth.service`
Expected: PASS (7 tests). If constructor order differs from Task 1's result, fix the test to match the actual constructor.

- [ ] **Step 3: Full run and commit**

```bash
pnpm lint && pnpm test
git add -A
git commit -m "test: real AuthService unit tests covering register, login, refresh rotation"
```

---

### Task 8: Working e2e test against docker-compose Postgres

**Files:**
- Create: `docker-compose.yml` (postgres service only — the api service is added in Task 9)
- Create: `.env.test` (committed — contains only local test values, no secrets)
- Modify: `package.json` (scripts + dotenv-cli dev dep)
- Rewrite: `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: ConfigModule `envFilePath` test handling from Task 1 (`NODE_ENV=test` → `.env.test` preferred).
- Produces: `pnpm db:migrate:test` and `pnpm test:e2e` commands used verbatim by CI in Task 10.

- [ ] **Step 1: `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: nestjs_starter
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: `.env.test`**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nestjs_starter_test
JWT_SECRET=e2e-test-secret-not-for-production
NODE_ENV=test
THROTTLE_LIMIT=1000
```

(`THROTTLE_LIMIT` is raised so rapid e2e requests don't hit 429.)

- [ ] **Step 3: Scripts** — in `package.json`:

Run: `pnpm add -D dotenv-cli`

```json
"test:e2e": "NODE_ENV=test jest --config ./test/jest-e2e.json --runInBand",
"db:migrate:test": "dotenv -e .env.test -- drizzle-kit migrate",
"db:create:test": "dotenv -e .env.test -- node -e \"const {Client}=require('pg');const u=new URL(process.env.DATABASE_URL);const db=u.pathname.slice(1);u.pathname='/postgres';const c=new Client({connectionString:u.toString()});c.connect().then(()=>c.query('CREATE DATABASE '+db)).catch(e=>{if(e.code!=='42P04')throw e}).finally(()=>c.end());\""
```

- [ ] **Step 4: Rewrite `test/app.e2e-spec.ts`** as the full API flow:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './../src/common/filters/http-exception.filter';

describe('API flow (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'S3cure-password!';
  let accessToken: string;
  let refreshToken: string;
  let courseId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the enveloped hello response', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payload).toBe('Hello World!');
  });

  it('GET /health reports database up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(JSON.stringify(res.body)).toContain('"up"');
  });

  it('POST /auth/register creates a user without leaking the password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firstName: 'E2e', lastName: 'Tester', email, password })
      .expect(200);
    expect(res.body.payload.email).toBe(email);
    expect(res.body.payload.password).toBeUndefined();
  });

  it('POST /auth/register rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firstName: 'E2e', lastName: 'Tester', email, password })
      .expect(409);
  });

  it('POST /auth/login returns access and refresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = res.body.payload.accessToken;
    refreshToken = res.body.payload.refreshToken;
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));
  });

  it('GET /users/me requires auth', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('GET /users/me returns the current user', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.payload.email).toBe(email);
  });

  it('POST /courses/create creates a course', async () => {
    const res = await request(app.getHttpServer())
      .post('/courses/create')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'E2E Course',
        description: 'Created by the e2e suite',
        level: `e2e-level-${Date.now()}`,
      })
      .expect(200);
    courseId = res.body.payload.id;
    expect(res.body.payload.createdBy).toBe(email);
  });

  it('GET /courses/get/:id returns the course', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/get/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.payload.name).toBe('E2E Course');
  });

  it('PATCH /courses/update/:id updates the course', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/courses/update/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ description: 'Updated by the e2e suite' })
      .expect(200);
    expect(res.body.payload.description).toBe('Updated by the e2e suite');
  });

  it('DELETE /courses/delete/:id is forbidden for non-admins', async () => {
    await request(app.getHttpServer())
      .delete(`/courses/delete/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('GET /courses/get/:id with a non-numeric id returns 400', async () => {
    await request(app.getHttpServer())
      .get('/courses/get/not-a-number')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('POST /auth/access-token/refresh rotates and returns a new access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);
    expect(res.body.payload.accessToken).toEqual(expect.any(String));
  });

  it('reusing the same refresh token fails with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(401);
  });
});
```

- [ ] **Step 5: Run the suite**

```bash
docker compose up -d postgres
pnpm db:create:test
pnpm db:migrate:test
pnpm test:e2e
```

Expected: all e2e tests PASS. (Course `level` column is unique, hence the timestamped level value.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: end-to-end API flow against dockerized postgres"
```

---

### Task 9: Dockerfile & compose api service

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docker-compose.yml` (add api service)
- Modify: `package.json` (add `packageManager` field)

**Interfaces:**
- Consumes: `pnpm build` output in `dist/`, env schema from Task 1 (container fails fast if `DATABASE_URL`/`JWT_SECRET` missing).
- Produces: image runnable as `node dist/main`; compose profile `full` for the api.

- [ ] **Step 1: Pin the package manager** — add to `package.json` top level (needed by corepack in Docker/CI):

```json
"packageManager": "pnpm@10.33.4"
```

- [ ] **Step 2: `.dockerignore`**

```
node_modules
dist
coverage
.git
.env*
!.env.example
*.md
docs
test
drizzle/**/meta
```

- [ ] **Step 3: `Dockerfile`** (bcrypt 6 ships musl prebuilds, so alpine works without build tools):

```dockerfile
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
```

- [ ] **Step 4: Add the api service to `docker-compose.yml`** (behind a profile so `docker compose up` alone still starts only postgres):

```yaml
  api:
    build: .
    profiles: ['full']
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/nestjs_starter
      JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET in your shell or .env}
      NODE_ENV: production
    ports:
      - '3000:3000'
```

- [ ] **Step 5: Verify**

```bash
docker build -t nestjs-starter .
JWT_SECRET=local-docker-secret docker compose --profile full up -d --build
curl -s localhost:3000/health
docker compose --profile full down
```

Expected: build succeeds; health returns database `up` (migrations must have been applied to `nestjs_starter` first: `pnpm db:migrate`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: multi-stage Dockerfile and compose stack"
```

---

### Task 10: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:migrate:test`, `pnpm test:e2e`, `.env.test` (its DATABASE_URL host `localhost:5432` matches the service container mapping).

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: nestjs_starter_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:test
      - run: pnpm test:e2e
```

(`pnpm/action-setup@v4` reads the version from the `packageManager` field. The service container already creates `nestjs_starter_test`, so `db:create:test` is not needed in CI. A failing migration — drift — fails the e2e job.)

- [ ] **Step 2: Commit and verify**

```bash
git add -A
git commit -m "ci: lint, unit, build, and e2e with migrations on github actions"
```

If the repo has a GitHub remote, push a branch and confirm both jobs are green before merging.

---

### Task 11: README rewrite & CLAUDE.md update

**Files:**
- Rewrite: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite `README.md`** — replace the stock NestJS boilerplate entirely:

````markdown
# NestJS Starter

Production-ready NestJS 11 starter template with Drizzle ORM (PostgreSQL), JWT authentication with rotating refresh tokens, and a consistent API response envelope.

## Features

- **Auth** — register/login, short-lived JWT access tokens, rotating refresh tokens (revoked on use), logout-everywhere
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
  auth/       login, register, refresh rotation, AuthGuard
  user/       user CRUD + /users/me
  course/     demo resource — copy this to add your own
  database/   drizzle provider (DRIZZLE_ORM), schema/, pool lifecycle
  health/     GET /health (terminus + db ping)
  common/     response envelope, interceptor, exception filter
  config/     env validation
```

## Adding a new resource

Use `src/course/` as the reference. For a resource `book`:

1. Define the table in `src/database/schema/book.schema.ts` and **re-export it from `src/database/schema/index.ts`** (required for `db.query.books` and migrations).
2. `pnpm db:generate && pnpm db:migrate`
3. Create `src/book/` with `book.module.ts`, `book.controller.ts`, `book.service.ts`, `book.repository.ts`, and `dto/`. Inject the db in the repository via `@Inject(DRIZZLE_ORM)`; derive row types with `InferSelectModel`.
4. Guard routes with `@UseGuards(AuthGuard)` + `@ApiBearerAuth('access-token')`; return `ResponseBuilder.success(...)`.
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

## License

UNLICENSED — use as a template for your own projects.
````

- [ ] **Step 2: Update `CLAUDE.md`** to reflect the final state. Apply these changes:

- Commands section: add `pnpm test:e2e` prerequisites (`docker compose up -d postgres`, `db:create:test`, `db:migrate:test`), and the new scripts `db:create:test`, `db:migrate:test`.
- Note the env vars are validated at boot by `src/config/env.validation.ts` (required: `DATABASE_URL`, `JWT_SECRET`; JWT lifetimes are **seconds**).
- Architecture: mention `HealthModule` (`GET /health`), global `ThrottlerGuard` (new endpoints that must not be rate-limited need `@SkipThrottle()`), pino logging via `nestjs-pino` (never `console.log`), and the `PG_POOL` token + `DatabaseLifecycle` shutdown hook.
- Remove the statement that `AuthModule` reads `process.env` directly (no longer true).

- [ ] **Step 3: Final full verification**

```bash
pnpm lint && pnpm build && pnpm test
docker compose up -d postgres && pnpm db:create:test && pnpm db:migrate:test && pnpm test:e2e
```

Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: rewrite README for the template; update CLAUDE.md"
```
