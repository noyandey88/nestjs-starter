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
