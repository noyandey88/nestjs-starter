# API Envelope Decorators & Redundancy Removal — Design

**Date:** 2026-08-04
**Status:** Approved
**Base:** main (177615d)

## Problem

Controllers repeat the same boilerplate on nearly every route, and Swagger
documents almost no response schemas (and the few it has are wrong):

| Repetition | Count |
|---|---|
| `@HttpCode(HttpStatus.OK)` | 10 of 11 routes |
| `@ApiBearerAuth('access-token')` + `@UseGuards(AuthGuard)` pair | 8 routes |
| `ResponseBuilder.success(..., HttpStatus.OK)` (3rd arg is the default) | 5 routes |
| `@Throttle({default: {limit: 10, ttl: 60_000}})` | 4 routes (all in AuthController) |
| `req.user.sub` + `if (!userId) throw BadRequestException` dead-code block | 3 routes |
| Inline `req: { user: {...} }` types | 5 routes |
| Response schemas in Swagger | ~none; register declares a wrong `201` |

Success payloads are inferred Drizzle row types, invisible to Swagger, so
the UI shows empty or default shapes for 200s and nothing correct for
errors.

## Goal

Zero per-route redundancy; Swagger shows the real envelope
(`{success, status, message, payload}`) with exact payload fields for
200s, and the real error shape (`{success: false, status, message,
payload: null}`) for documented error codes. **The wire format does not
change** — the e2e suite is the safety net.

## Design

### 1. Interceptor owns the success envelope; ResponseBuilder is deleted

Controllers return raw payloads (the service result). The global
`ResponseInterceptor` builds the envelope:

- `status`: derived from `res.statusCode` (set per route by `@HttpCode`
  via `ApiEnvelope`, or Nest defaults) and converted to its name with
  `getHttpStatusName`.
- `message`: read from route metadata (`RESPONSE_MESSAGE` key) via
  `Reflector`; default `'Request successful'`.
- `payload`: the controller's return value, verbatim (`null` allowed).

Consequences:
- `src/common/dto/api-response.dto.ts` is deleted. `getHttpStatusName`
  moves to `src/common/utils/http-status.util.ts`. `ResponseBuilder` has
  no remaining callers after the controller sweep; `AllExceptionsFilter`
  and the interceptor import the util.
- The interceptor drops its envelope-detection branch and the
  `extractMessage`/`extractPayload` heuristics — nothing pre-wraps
  anymore. It keeps wrapping any raw return (e.g. terminus health output,
  `getHello()` string).

### 2. Composed decorators (`src/common/decorators/`)

**`@ApiEnvelope(payloadDto, options?)`** — the per-route success contract:
- `payloadDto`: a class reference, or `null` for null-payload routes
  (logout).
- `options`: `{ message?: string; description?: string; status?: HttpStatus;
  isArray?: boolean }`.
- Composes: `HttpCode(status ?? 200)`, `SetMetadata(RESPONSE_MESSAGE,
  message)`, `ApiExtraModels(...)` + `ApiResponse({...})` whose schema is
  the envelope (`success: true`, `status` name string, `message` example)
  with `payload` as `$ref` to the DTO (`allOf` composition; array wrapper
  when `isArray`; `nullable` when `payloadDto` is `null`).

**`@Auth()`** — protected-route contract:
- Composes `UseGuards(AuthGuard)`, `ApiBearerAuth('access-token')`, and a
  documented `401` using `ErrorResponseDto`.

**`@ApiErrorResponses(...statuses: HttpStatus[])`** — documents each
status with the `ErrorResponseDto` schema and a sensible default
description (Swagger's reason phrase).

**`@CurrentUser(prop?)`** — `createParamDecorator` returning the typed
JWT payload from `request.user`, or one property of it
(`@CurrentUser('sub')`). Backed by a `JwtPayload` interface
(`sub`, `email`, `role`) in `src/auth/auth.types.ts` (align fields with
what `AuthService` actually signs). The guard guarantees presence — the
`if (!userId) throw BadRequestException` blocks are deleted as dead code.

### 3. DTOs (`src/common/dto/` + per-feature `dto/`)

- `ErrorResponseDto` — `success: false`, `status` (name string, example
  `'BAD_REQUEST'`), `message`, `payload: null`, with `@ApiProperty`
  examples. Must mirror `AllExceptionsFilter` output exactly.
- Per-feature response DTOs with `@ApiProperty` (explicit — no CLI
  plugin): `CourseResponseDto`, `UserResponseDto` (no password field),
  `TokensResponseDto` (`accessToken`, `refreshToken`), plus a refresh
  response shape if it differs (align with `AuthService` returns).
  These are documentation classes; services keep returning Drizzle-derived
  types (structurally compatible).

### 4. Controller sweep

Every route becomes: `@ApiOperation` + (`@Auth()` if protected) +
`@ApiEnvelope(Dto, { message })` + relevant `@ApiErrorResponses` +
plain body returning the service call.

- AuthController: class-level `@Throttle`; remove stale
  `@ApiResponse(201/409)` pair (replaced by `@ApiErrorResponses(409)` on
  register); document 401 on login/refresh.
- CourseController: 400 on `ParseIntPipe` routes, 403 + admin note on
  delete, 409 on create (unique `level`).
- UserController: standard protected route.
- HealthController: left as-is (terminus has its own doc shape); the
  interceptor still wraps it, unchanged from today.

### 5. Out of scope

- No change to `AllExceptionsFilter` logic (only its import path for the
  util).
- No change to auth flows, guards, or the response wire format.
- Health endpoint Swagger polish.

## Testing

- E2E suite must pass unchanged — it asserts the envelope on every route;
  any wire-format drift fails it.
- Unit: interceptor spec updated/added (message metadata, status
  derivation, raw-wrap); filter spec unchanged; controller specs updated
  where constructor/return shapes changed.
- Swagger verification: boot the app, inspect `/api` — 200s show envelope
  + real payload fields; documented errors show `ErrorResponseDto` shape.
