# API Envelope Decorators & Redundancy Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all per-route boilerplate (HttpCode/guard/bearer/ResponseBuilder/req.user blocks) via composed decorators, and make Swagger show the real success envelope and real error shape for every documented status.

**Architecture:** The global `ResponseInterceptor` becomes the only place the success envelope is built (`status` from `res.statusCode`, `message` from route metadata, `payload` = controller return value). Four composed decorators (`ApiEnvelope`, `Auth`, `ApiErrorResponses`, `CurrentUser`) replace the repeated stacks. `ResponseBuilder` is deleted. Response DTO classes give Swagger real payload schemas.

**Tech Stack:** NestJS 11, @nestjs/swagger 11 (`applyDecorators`, `ApiExtraModels`, `getSchemaPath`), Jest 30, pnpm.

## Global Constraints

- **The wire format does not change.** Every response stays `{ success, status, message, payload }` with `status` as the HTTP status *name* string (e.g. `'OK'`). The e2e suite (`test/app.e2e-spec.ts`, 15 tests) must pass unchanged — do not edit it.
- Package manager is **pnpm** (never npm/yarn).
- Never use `console.log`; never log secrets or tokens.
- Existing route paths, HTTP methods, and status codes are unchanged (all current success responses are 200).
- Keep each route's current success `message` string verbatim (listed per route in Task 3) — messages move from `ResponseBuilder` args into `@ApiEnvelope` options.
- `main.ts` and `test/app.e2e-spec.ts` construct the interceptor as `new ResponseInterceptor()` — the rewrite must keep that call form working (default-constructed `Reflector`).
- Path alias `src/*` works in imports (tsconfig + jest moduleNameMapper).

## File Structure

```
src/common/
  utils/http-status.util.ts          (new — getHttpStatusName moves here)
  utils/http-status.util.spec.ts     (new)
  dto/error-response.dto.ts          (new — ErrorResponseDto)
  dto/api-response.dto.ts            (Task 1: shim; DELETED in Task 3)
  decorators/api-envelope.decorator.ts   (new — ApiEnvelope + RESPONSE_MESSAGE_KEY)
  decorators/api-envelope.decorator.spec.ts (new)
  decorators/api-error-responses.decorator.ts (new)
  decorators/auth.decorator.ts       (new — Auth)
  decorators/current-user.decorator.ts (new — CurrentUser)
  interceptors/response.interceptor.ts (rewritten Task 3)
  interceptors/response.interceptor.spec.ts (new Task 3)
  filters/http-exception.filter.ts   (import path update only, Task 3)
src/auth/
  auth.types.ts                      (new — JwtPayload)
  dto/auth-response.dto.ts           (new — LoginResponseDto, AccessTokenResponseDto)
  auth.controller.ts                 (rewritten Task 3)
  auth.controller.spec.ts            (rewritten Task 3)
src/user/
  dto/user-response.dto.ts           (new)
  user.controller.ts                 (rewritten Task 3)
src/course/
  dto/course-response.dto.ts         (new)
  course.controller.ts               (rewritten Task 3)
CLAUDE.md, README.md                 (envelope/convention sections, Task 4)
```

---

### Task 1: Foundation — status util, error DTO, JWT payload type, composed decorators

**Files:**
- Create: `src/common/utils/http-status.util.ts`
- Create: `src/common/utils/http-status.util.spec.ts`
- Create: `src/common/dto/error-response.dto.ts`
- Create: `src/auth/auth.types.ts`
- Create: `src/common/decorators/api-envelope.decorator.ts`
- Create: `src/common/decorators/api-envelope.decorator.spec.ts`
- Create: `src/common/decorators/api-error-responses.decorator.ts`
- Create: `src/common/decorators/auth.decorator.ts`
- Create: `src/common/decorators/current-user.decorator.ts`
- Modify: `src/common/dto/api-response.dto.ts` (replace local `getHttpStatusName` with re-export from the util; keep `ResponseBuilder` compiling)

**Interfaces:**
- Consumes: `AuthGuard` from `src/auth/auth.guard` (existing).
- Produces (later tasks rely on these exact names):
  - `getHttpStatusName(status: number | string): string` from `src/common/utils/http-status.util`
  - `ErrorResponseDto` from `src/common/dto/error-response.dto`
  - `JwtPayload { sub: number; email: string; role: string }` from `src/auth/auth.types`
  - `RESPONSE_MESSAGE_KEY: string` and `ApiEnvelope(payloadDto: Type<unknown> | null, options?: { message?: string; description?: string; status?: HttpStatus; isArray?: boolean }): MethodDecorator` from `src/common/decorators/api-envelope.decorator`
  - `ApiErrorResponses(...statuses: HttpStatus[]): MethodDecorator` from `src/common/decorators/api-error-responses.decorator`
  - `Auth(): MethodDecorator & ClassDecorator` from `src/common/decorators/auth.decorator`
  - `CurrentUser` param decorator (optionally `CurrentUser('sub')`) from `src/common/decorators/current-user.decorator`

- [ ] **Step 1: Write the failing tests**

`src/common/utils/http-status.util.spec.ts`:

```typescript
import { getHttpStatusName } from './http-status.util';

describe('getHttpStatusName', () => {
  it('converts a numeric status to its name', () => {
    expect(getHttpStatusName(200)).toBe('OK');
    expect(getHttpStatusName(404)).toBe('NOT_FOUND');
  });

  it('converts a numeric string to its name', () => {
    expect(getHttpStatusName('409')).toBe('CONFLICT');
  });

  it('passes through a non-numeric string', () => {
    expect(getHttpStatusName('OK')).toBe('OK');
  });

  it('returns UNKNOWN_STATUS for an unmapped number', () => {
    expect(getHttpStatusName(999)).toBe('UNKNOWN_STATUS');
  });
});
```

`src/common/decorators/api-envelope.decorator.spec.ts`:

```typescript
import { HttpStatus } from '@nestjs/common';
import {
  ApiEnvelope,
  RESPONSE_MESSAGE_KEY,
} from './api-envelope.decorator';

class DummyDto {}

describe('ApiEnvelope', () => {
  it('stores the message as route metadata', () => {
    class TestController {
      @ApiEnvelope(DummyDto, { message: 'Created it' })
      handler() {}
    }
    const meta: unknown = Reflect.getMetadata(
      RESPONSE_MESSAGE_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toBe('Created it');
  });

  it('defaults the message to "Request successful"', () => {
    class TestController {
      @ApiEnvelope(DummyDto)
      handler() {}
    }
    const meta: unknown = Reflect.getMetadata(
      RESPONSE_MESSAGE_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toBe('Request successful');
  });

  it('sets the HTTP code metadata (default 200)', () => {
    class TestController {
      @ApiEnvelope(DummyDto)
      handler() {}
    }
    // __httpCode__ is the metadata key Nest's @HttpCode uses
    const code: unknown = Reflect.getMetadata(
      '__httpCode__',
      TestController.prototype.handler,
    );
    expect(code).toBe(HttpStatus.OK);
  });

  it('accepts null payload DTOs', () => {
    expect(() => {
      class TestController {
        @ApiEnvelope(null, { message: 'Logged out successfully' })
        handler() {}
      }
      void TestController;
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- http-status.util` and `pnpm test -- api-envelope`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement**

`src/common/utils/http-status.util.ts` (logic moved verbatim from `api-response.dto.ts`):

```typescript
import { HttpStatus } from '@nestjs/common';

export function getHttpStatusName(status: number | string): string {
  if (typeof status === 'number') {
    return HttpStatus[status] || 'UNKNOWN_STATUS';
  }
  const numeric = Number(status);
  if (!isNaN(numeric) && HttpStatus[numeric]) {
    return HttpStatus[numeric];
  }
  return status;
}
```

`src/common/dto/api-response.dto.ts` — delete the local `getHttpStatusName` function and its `HttpStatus` usage-only import if now unused; add at the top:

```typescript
export { getHttpStatusName } from '../utils/http-status.util';
import { getHttpStatusName } from '../utils/http-status.util';
```

(`ResponseBuilder` stays as-is in this task; the whole file is deleted in Task 3.)

`src/common/dto/error-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';

/** Shape emitted by AllExceptionsFilter for every error response. */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'BAD_REQUEST',
    description: 'HTTP status name',
  })
  status!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ example: null, type: 'object', nullable: true })
  payload!: null;
}
```

`src/auth/auth.types.ts`:

```typescript
/** Payload signed into access tokens (see AuthService.issueAccessToken). */
export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}
```

`src/common/decorators/api-envelope.decorator.ts`:

```typescript
import {
  applyDecorators,
  HttpCode,
  HttpStatus,
  SetMetadata,
  Type,
} from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { getHttpStatusName } from '../utils/http-status.util';

export const RESPONSE_MESSAGE_KEY = 'response_message';

export interface ApiEnvelopeOptions {
  /** Envelope message; also the Swagger example. Default: 'Request successful'. */
  message?: string;
  /** Swagger response description. Defaults to the message. */
  description?: string;
  /** HTTP status for the route. Default: 200. */
  status?: HttpStatus;
  /** Document the payload as an array of payloadDto. */
  isArray?: boolean;
}

/**
 * Declares a route's success contract in one place: HTTP status,
 * envelope message (read by ResponseInterceptor), and the Swagger
 * schema `{ success, status, message, payload: <dto> }`.
 * Pass `null` as payloadDto for routes whose payload is null.
 */
export function ApiEnvelope(
  payloadDto: Type<unknown> | null,
  options: ApiEnvelopeOptions = {},
): MethodDecorator {
  const status = options.status ?? HttpStatus.OK;
  const message = options.message ?? 'Request successful';

  const payloadSchema = payloadDto
    ? options.isArray
      ? { type: 'array', items: { $ref: getSchemaPath(payloadDto) } }
      : { $ref: getSchemaPath(payloadDto) }
    : { type: 'object', nullable: true, example: null };

  const decorators: MethodDecorator[] = [
    HttpCode(status),
    SetMetadata(RESPONSE_MESSAGE_KEY, message),
    ApiResponse({
      status,
      description: options.description ?? message,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          status: { type: 'string', example: getHttpStatusName(status) },
          message: { type: 'string', example: message },
          payload: payloadSchema,
        },
      },
    }),
  ];

  if (payloadDto) {
    decorators.push(ApiExtraModels(payloadDto));
  }

  return applyDecorators(...decorators);
}
```

`src/common/decorators/api-error-responses.decorator.ts`:

```typescript
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';
import { getHttpStatusName } from '../utils/http-status.util';

/**
 * Documents error responses with the exact shape AllExceptionsFilter
 * emits: { success: false, status, message, payload: null }.
 */
export function ApiErrorResponses(
  ...statuses: HttpStatus[]
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: getHttpStatusName(status),
        schema: {
          allOf: [
            { $ref: getSchemaPath(ErrorResponseDto) },
            {
              properties: {
                status: { type: 'string', example: getHttpStatusName(status) },
              },
            },
          ],
        },
      }),
    ),
  );
}
```

`src/common/decorators/auth.decorator.ts`:

```typescript
import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiErrorResponses } from './api-error-responses.decorator';

/**
 * Protected route: AuthGuard + Swagger bearer scheme ('access-token',
 * registered in main.ts) + documented 401.
 */
export function Auth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(AuthGuard),
    ApiBearerAuth('access-token'),
    ApiErrorResponses(HttpStatus.UNAUTHORIZED),
  );
}
```

`src/common/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'src/auth/auth.types';

/**
 * Injects the verified JWT payload that AuthGuard put on request.user.
 * Only meaningful on routes behind @Auth(). Pass a key to get one field:
 * `@CurrentUser('sub') userId: number`.
 */
export const CurrentUser = createParamDecorator(
  (prop: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return prop ? request.user[prop] : request.user;
  },
);
```

- [ ] **Step 4: Run tests and full suite**

Run: `pnpm test -- http-status.util`, `pnpm test -- api-envelope`, then `pnpm test` and `pnpm lint` and `pnpm build`.
Expected: new tests PASS; whole suite green (7+2 suites); lint/build clean.

- [ ] **Step 5: Commit**

```bash
git add src/common src/auth/auth.types.ts
git commit -m "feat: add envelope/auth/error-response composed decorators and status util"
```

---

### Task 2: Response DTOs for Swagger payload schemas

**Files:**
- Create: `src/user/dto/user-response.dto.ts`
- Create: `src/course/dto/course-response.dto.ts`
- Create: `src/auth/dto/auth-response.dto.ts`

**Interfaces:**
- Consumes: `UserRole` enum from `src/user/user.types`.
- Produces (Task 3 imports these exact names): `UserResponseDto`, `CourseResponseDto`, `AccessTokenResponseDto`, `LoginResponseDto`.
- These are documentation classes only — services keep returning Drizzle-derived types. Field lists mirror the actual runtime payloads: user = `users` table minus `password`; course = `courses` table; auth shapes = `AuthService.loginUser` / `issueAccessToken` returns.

- [ ] **Step 1: Create the DTOs**

`src/user/dto/user-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../user.types';

/** users row minus password (see UserService safeUser destructuring). */
export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Ada' })
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  lastName!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.Student })
  role!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}
```

`src/course/dto/course-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CourseResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Intro to TypeScript' })
  name!: string;

  @ApiProperty({ example: 'A beginner-friendly TypeScript course' })
  description!: string;

  @ApiProperty({ example: 'beginner' })
  level!: string;

  @ApiProperty({ example: 'ada@example.com' })
  createdBy!: string;

  @ApiProperty({ example: 'ada@example.com', nullable: true, type: String })
  updatedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}
```

`src/auth/dto/auth-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from 'src/user/dto/user-response.dto';

/** Return shape of AuthService.issueAccessToken / refreshAccessToken. */
export class AccessTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 300, description: 'Access token lifetime, seconds' })
  expiresIn!: number;

  @ApiProperty({ example: 1754300000, description: 'Unix timestamp (seconds)' })
  expiresAt!: number;
}

/** Return shape of AuthService.loginUser. */
export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 'a3f9c2...64-byte-hex' })
  refreshToken!: string;

  @ApiProperty({ example: 300, description: 'Seconds' })
  accessTokenExpiresIn!: number;

  @ApiProperty({ example: 1754300000, description: 'Unix timestamp (seconds)' })
  accessTokenExpiresAt!: number;

  @ApiProperty({ example: 604800, description: 'Seconds' })
  refreshTokenExpiresIn!: number;

  @ApiProperty({ example: 1754900000, description: 'Unix timestamp (seconds)' })
  refreshTokenExpiresAt!: number;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm build` and `pnpm lint`.
Expected: clean (no tests — pure documentation classes with no logic).

- [ ] **Step 3: Commit**

```bash
git add src/user/dto/user-response.dto.ts src/course/dto/course-response.dto.ts src/auth/dto/auth-response.dto.ts
git commit -m "feat: add response DTOs for Swagger payload schemas"
```

---

### Task 3: The swap — interceptor owns the envelope; controllers go raw; ResponseBuilder deleted

This task is atomic on purpose: the interceptor stops unwrapping pre-built envelopes in the same commit that stops controllers from building them. Do not split it.

**Files:**
- Modify: `src/common/interceptors/response.interceptor.ts` (rewrite)
- Create: `src/common/interceptors/response.interceptor.spec.ts`
- Modify: `src/common/filters/http-exception.filter.ts` (import path only)
- Delete: `src/common/dto/api-response.dto.ts`
- Modify: `src/auth/auth.controller.ts` (rewrite)
- Modify: `src/auth/auth.controller.spec.ts` (rewrite)
- Modify: `src/user/user.controller.ts` (rewrite)
- Modify: `src/course/course.controller.ts` (rewrite)

**Interfaces:**
- Consumes: everything Tasks 1–2 produced (`ApiEnvelope`, `Auth`, `ApiErrorResponses`, `CurrentUser`, `RESPONSE_MESSAGE_KEY`, `getHttpStatusName`, the four response DTOs).
- Produces: `ResponseInterceptor` with constructor `(reflector: Reflector = new Reflector())` — `main.ts`/e2e keep calling `new ResponseInterceptor()` unchanged.
- `AllExceptionsFilter` behavior unchanged (import path only).

- [ ] **Step 1: Write the failing interceptor spec**

`src/common/interceptors/response.interceptor.spec.ts`:

```typescript
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { RESPONSE_MESSAGE_KEY } from '../decorators/api-envelope.decorator';

describe('ResponseInterceptor', () => {
  const makeContext = (statusCode: number, handler: object) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
      getHandler: () => handler,
    }) as unknown as ExecutionContext;

  const makeNext = (value: unknown): CallHandler => ({
    handle: () => of(value),
  });

  it('wraps the payload with status name from the response status code', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, () => {}), makeNext({ id: 1 })),
    );
    expect(result).toEqual({
      success: true,
      status: 'OK',
      message: 'Request successful',
      payload: { id: 1 },
    });
  });

  it('uses the message from ApiEnvelope route metadata', async () => {
    const handler = () => {};
    Reflect.defineMetadata(RESPONSE_MESSAGE_KEY, 'Course created successfully', handler);
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, handler), makeNext({ id: 7 })),
    );
    expect(result.message).toBe('Course created successfully');
  });

  it('passes null payloads through as null', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, () => {}), makeNext(null)),
    );
    expect(result.payload).toBeNull();
  });

  it('converts undefined payloads to null', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, () => {}), makeNext(undefined)),
    );
    expect(result.payload).toBeNull();
  });

  it('works when constructed with no arguments (main.ts call form)', async () => {
    const interceptor = new ResponseInterceptor();
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, () => {}), makeNext('Hello World!')),
    );
    expect(result).toEqual({
      success: true,
      status: 'OK',
      message: 'Request successful',
      payload: 'Hello World!',
    });
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `pnpm test -- response.interceptor`
Expected: FAIL (constructor takes no Reflector yet; envelope-detection branch changes shapes).

- [ ] **Step 3: Rewrite the interceptor**

`src/common/interceptors/response.interceptor.ts` (full replacement):

```typescript
// src/common/interceptors/response.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { RESPONSE_MESSAGE_KEY } from '../decorators/api-envelope.decorator';
import { getHttpStatusName } from '../utils/http-status.util';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const res = context.switchToHttp().getResponse<Response>();
    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler()) ??
      'Request successful';

    return next.handle().pipe(
      map((payload: T) => ({
        success: true,
        status: getHttpStatusName(res.statusCode),
        message,
        payload: payload ?? null,
      })),
    );
  }
}
```

- [ ] **Step 4: Run interceptor spec**

Run: `pnpm test -- response.interceptor`
Expected: PASS.

- [ ] **Step 5: Rewrite the three controllers**

`src/auth/auth.controller.ts` (full replacement). Notes: `@Throttle` moves to class level (same limits); the stale `@ApiResponse(201/409)` pair is replaced by `@ApiErrorResponses`; the dead `if (!userId)` checks are gone; messages preserved verbatim.

```typescript
import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/registerUser.dto';
import {
  AccessTokenResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { ApiEnvelope } from 'src/common/decorators/api-envelope.decorator';
import { ApiErrorResponses } from 'src/common/decorators/api-error-responses.decorator';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account using the provided first name, last name, email, and password.',
  })
  @ApiEnvelope(UserResponseDto, { message: 'User registered successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  async register(@Body() registerUserDto: RegisterDto) {
    return this.authService.registerUser(registerUserDto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'user login',
    description: 'Login to your account with your credentials',
  })
  @ApiEnvelope(LoginResponseDto, { message: 'User logged in successful' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async login(@Body() loginUserDto: LoginDto) {
    return this.authService.loginUser(loginUserDto);
  }

  @Auth()
  @Post('access-token/refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Refresh the access token using a valid refresh token',
  })
  @ApiEnvelope(AccessTokenResponseDto, { message: 'Data loaded successfully' })
  async refreshAccessToken(
    @Body() refreshToken: RefreshTokenDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.authService.refreshAccessToken(
      userId,
      refreshToken.refreshToken,
    );
  }

  @Auth()
  @Post('logout')
  @ApiOperation({
    summary: 'Logout everywhere',
    description: 'Revokes all refresh tokens for the current user',
  })
  @ApiEnvelope(null, { message: 'Logged out successfully' })
  async logout(@CurrentUser('sub') userId: number) {
    await this.authService.logout(userId);
    return null;
  }
}
```

Note: `AuthController`'s constructor drops the unused `UserService` — it was only injected for the (already removed) `@UseGuards` DI in tests; the guard resolves its own dependencies. Also add `@ApiTags('Auth')` (it was missing — every other controller has one).

`src/user/user.controller.ts` (full replacement):

```typescript
import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiEnvelope } from 'src/common/decorators/api-envelope.decorator';
import { ApiErrorResponses } from 'src/common/decorators/api-error-responses.decorator';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Auth()
  @Get('me')
  @ApiOperation({
    summary: 'current user',
    description: 'you can get currently logged in user data',
  })
  @ApiEnvelope(UserResponseDto, { message: 'Data loaded successfully' })
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async getUserProfile(@CurrentUser('sub') userId: number) {
    return this.userService.findUserById(userId);
  }
}
```

`src/course/course.controller.ts` (full replacement). The admin check keeps using the JWT payload, now via `@CurrentUser()`:

```typescript
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';
import { UserRole } from 'src/user/user.types';
import { JwtPayload } from 'src/auth/auth.types';
import { ApiEnvelope } from 'src/common/decorators/api-envelope.decorator';
import { ApiErrorResponses } from 'src/common/decorators/api-error-responses.decorator';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Courses')
@Auth()
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Create a new course',
    description: 'Creates a new course using the provided details.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course created successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser('email') creatorEmail: string,
  ) {
    return this.courseService.create(createCourseDto, creatorEmail);
  }

  @Get('get/all')
  @ApiOperation({
    summary: 'Retrieve all courses',
    description: 'Fetches a list of all available courses.',
  })
  @ApiEnvelope(CourseResponseDto, {
    message: 'Courses retrieved successfully',
    isArray: true,
  })
  async findAll() {
    return this.courseService.findAll();
  }

  @Get('get/:id')
  @ApiOperation({
    summary: 'Retrieve a course by ID',
    description: 'Fetches a course by its unique identifier.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course retrieved successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.findOne(id);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Update a course',
    description: 'Updates the details of an existing course.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course updated successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser('email') updaterEmail: string,
  ) {
    return this.courseService.update(id, updateCourseDto, updaterEmail);
  }

  @Delete('delete/:id')
  @ApiOperation({
    summary: 'Remove a course',
    description: 'Deletes an existing course by its unique identifier.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course removed successfully' })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role !== UserRole.Admin) {
      throw new ForbiddenException(
        'You do not have permission to delete this course',
      );
    }
    return this.courseService.remove(id);
  }
}
```

Note the class-level `@Auth()` on `CourseController` — every route is protected, so it lives once on the class (guards/`ApiBearerAuth` compose at class level; the 401 doc applies to all routes). The previous per-route `@ApiBody` decorators are dropped everywhere: `@nestjs/swagger` infers the body schema from the `@Body()` parameter type.

- [ ] **Step 6: Delete ResponseBuilder, fix the filter import**

Delete `src/common/dto/api-response.dto.ts`:

```bash
git rm src/common/dto/api-response.dto.ts
```

In `src/common/filters/http-exception.filter.ts` change:

```typescript
import { getHttpStatusName } from '../dto/api-response.dto';
```

to:

```typescript
import { getHttpStatusName } from '../utils/http-status.util';
```

Then verify nothing else references the deleted file:

```bash
grep -rn "api-response.dto" src test --include='*.ts'
```

Expected: no matches.

- [ ] **Step 7: Rewrite `src/auth/auth.controller.spec.ts`**

Controller methods now return raw payloads and take plain values (the param decorator resolves before the method in real requests; unit tests pass values directly). The `UserService` provider goes away with the constructor change, but **keep the `JwtService` mock** — `@Auth()` still applies `UseGuards(AuthGuard)` and the testing module resolves the guard's `JwtService` dependency at compile time:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            registerUser: jest.fn(),
            logout: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the registered user payload raw (interceptor wraps it)', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };
    jest.spyOn(authService, 'registerUser').mockResolvedValue(mockUser);

    const dto = {
      email: 'test@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
    };
    const response = await controller.register(dto);

    expect(response).toEqual(mockUser);
  });

  it('revokes tokens for the current user and returns null', async () => {
    jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

    const response = await controller.logout(1);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(authService.logout).toHaveBeenCalledWith(1);
    expect(response).toBeNull();
  });
});
```

Note: `mockResolvedValue` types must satisfy the service signatures; if TS complains about `mockUser` missing fields of the service return type, use `jest.spyOn(...).mockResolvedValue(mockUser as never)` — prefer widening the mock object with the missing fields (`role`, `createdAt`, `updatedAt`) over `as never`.

- [ ] **Step 8: Run everything**

Run: `pnpm test` then `pnpm lint` then `pnpm build`.
Expected: all suites pass (including the new interceptor and decorator specs), lint and build clean. If `auth.service.spec.ts` or other specs reference `ResponseBuilder`, update those imports the same way (grep first: `grep -rln ResponseBuilder src test`).

- [ ] **Step 9: Live e2e (wire-format proof)**

The local postgresql owns 5432 — run the compose postgres on 5433 with an override file:

```bash
cat > /tmp/compose-port-override.yml <<'EOF'
services:
  postgres:
    ports: !override
      - '5433:5432'
EOF
JWT_SECRET=x sg docker -c "docker compose -f docker-compose.yml -f /tmp/compose-port-override.yml up -d postgres"
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm db:create:test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm db:migrate
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test pnpm test:e2e
```

Expected: **15/15 pass with zero edits to `test/app.e2e-spec.ts`** — this is the proof the wire format didn't change. When done: `JWT_SECRET=x sg docker -c "docker compose -f docker-compose.yml -f /tmp/compose-port-override.yml down"` (add `docker compose` teardown only after e2e passes; leave postgres up if Task 4's Swagger check runs next).

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "refactor: interceptor-owned envelope, composed decorators, delete ResponseBuilder"
```

---

### Task 4: Docs + live Swagger verification

**Files:**
- Modify: `CLAUDE.md` (Response envelope section, ~line 60)
- Modify: `README.md` (adding-a-resource conventions, ~line 61)

**Interfaces:**
- Consumes: the decorator names from Task 1 (documentation only).

- [ ] **Step 1: Live Swagger verification**

With the Task 3 compose postgres still up:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nestjs_starter_test JWT_SECRET=dev-secret PORT=3999 pnpm start:dev &
sleep 8
curl -s http://localhost:3999/api-json | node -e "
const doc = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const paths = doc.paths;
const ok = paths['/courses/get/{id}'].get.responses['200'];
const err = paths['/courses/get/{id}'].get.responses['404'];
console.log('200 schema:', JSON.stringify(ok.content?.['application/json']?.schema ?? ok.schema ?? ok, null, 2).slice(0, 600));
console.log('404 schema:', JSON.stringify(err, null, 2).slice(0, 600));
console.log('has CourseResponseDto:', JSON.stringify(doc.components.schemas).includes('CourseResponseDto'));
console.log('has ErrorResponseDto:', JSON.stringify(doc.components.schemas).includes('ErrorResponseDto'));
"
kill %1
```

Expected: the 200 response schema shows `success/status/message` properties with `payload` referencing `CourseResponseDto`; the 404 references `ErrorResponseDto`; both `has ...` lines print `true`. If the `payload` ref is missing, the likely cause is `ApiExtraModels` not applied — fix in the decorator, not per-route. Tear down compose afterwards:

```bash
JWT_SECRET=x sg docker -c "docker compose -f docker-compose.yml -f /tmp/compose-port-override.yml down"
```

- [ ] **Step 2: Update CLAUDE.md**

Replace the "Response envelope (cross-cutting)" paragraph body with:

```markdown
`main.ts` wires three global pieces: a `ValidationPipe` (`whitelist` + `transform`, so DTOs use class-validator decorators and unknown fields are stripped), `ResponseInterceptor`, and `AllExceptionsFilter`. Every response — success or error — is normalized to the `ApiResponse` shape `{ success, status, message, payload }` (`src/common/`). Controllers return the **raw payload** (usually the service result); the interceptor builds the envelope, deriving `status` from the response's HTTP status code and `message` from `@ApiEnvelope` route metadata.

Per-route contract lives in composed decorators (`src/common/decorators/`):
- `@ApiEnvelope(PayloadDto, { message })` — sets the HTTP code (default 200), the envelope message, and the Swagger success schema (envelope + payload DTO). Use `null` for null payloads, `isArray: true` for lists.
- `@Auth()` — `AuthGuard` + Swagger bearer (`access-token`) + documented 401. Class-level when every route is protected.
- `@ApiErrorResponses(HttpStatus.X, ...)` — documents error codes with the `ErrorResponseDto` shape emitted by `AllExceptionsFilter`.
- `@CurrentUser('sub' | 'email' | 'role')` — injects the verified JWT payload (or one field) from `request.user`.

Do not add `@ApiBody` (inferred from `@Body()` types) or per-route `@HttpCode`/`@UseGuards`/`@ApiBearerAuth` — the decorators above own those.
```

Also update the Auth section sentence "Protect routes with `@UseGuards(AuthGuard)` ... plus `@ApiBearerAuth('access-token')`" to say: Protect routes with `@Auth()` (`src/common/decorators/auth.decorator.ts`), which bundles `AuthGuard`, the `access-token` Swagger bearer scheme, and the documented 401; the guard puts the JWT payload on `request.user`, accessed via `@CurrentUser()`.

- [ ] **Step 3: Update README.md**

In the "adding a resource" steps (~line 61), replace the guard/ResponseBuilder step with:

```markdown
4. Guard routes with `@Auth()`; declare each route's success contract with `@ApiEnvelope(YourResponseDto, { message: '...' })` and error codes with `@ApiErrorResponses(...)`; return the raw service result — the global interceptor wraps it in the `{ success, status, message, payload }` envelope.
```

Check for other stale mentions: `grep -n "ResponseBuilder\|HttpCode" README.md CLAUDE.md` — update any remaining.

- [ ] **Step 4: Final full check + commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: green.

```bash
git add CLAUDE.md README.md
git commit -m "docs: document envelope decorators convention"
```
