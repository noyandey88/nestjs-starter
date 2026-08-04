# Dev Request/Response Debug Logging — Design

**Date:** 2026-08-04
**Status:** Approved
**Base:** main (57c242f)

## Problem

pino-http logs each request as one huge JSON blob (full headers, no
request body, no response payload) — unusable for everyday debugging.
Developers need to see: method, endpoint, status, timing, request body,
and response payload. Production logging must stay lean and must never
log secrets or PII.

## Design (development only; production behavior unchanged)

All changes live in the `LoggerModule.forRootAsync` factory
(`src/app.module.ts`), a new dev-only interceptor, and one conditional
line in `main.ts`.

1. **Readable line format** — pino-pretty options in development:
   `messageFormat: '{req.method} {req.url} → {res.statusCode} ({responseTime}ms) {msg}'`,
   `translateTime: 'HH:MM:ss'`, `ignore: 'pid,hostname'`, keep
   `singleLine: true`.

2. **Trimmed serializers (dev only)** — custom `req` serializer returns
   `{ method, url, body }` (body from `req.raw.body`, populated by the
   body parser); custom `res` serializer returns `{ statusCode }`.
   Headers disappear from dev output. Production keeps pino-http's
   default serializers (full headers, no bodies).

3. **Extended redaction (all environments)** — add
   `req.body.password`, `req.body.refreshToken`, `payload.accessToken`,
   `payload.refreshToken` to the existing redact list (authorization/
   cookie headers). Secrets never reach logs even in dev.

4. **Response payload (dev only)** — new
   `src/common/interceptors/debug-payload.interceptor.ts`: a
   `DebugPayloadInterceptor` using Nest's `Logger` (pino-backed via
   `app.useLogger`) to `debug`-log `{ method, url, payload }` per
   request via `tap`. Registered in `main.ts` only when
   `NODE_ENV === 'development'`, AFTER `ResponseInterceptor` so it taps
   the raw payload (inner interceptor). It never modifies the stream.

## Testing

- Unit spec for `DebugPayloadInterceptor`: passes values through
  unchanged; calls logger.debug with method/url/payload.
- Full suite + lint + build green. e2e unaffected (NODE_ENV=test — no
  dev transport, no debug interceptor).

## Out of scope

- Production body logging (deliberately excluded — PII).
- Log shipping/formatting beyond pino-pretty.
