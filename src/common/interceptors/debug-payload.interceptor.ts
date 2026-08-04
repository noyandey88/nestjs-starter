import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs each response payload at debug level so the full request/response
 * cycle is visible while debugging. Registered in main.ts only when the
 * `LOG_HTTP_BODIES` flag is true — any stage may enable it, not just
 * development. Payloads may contain PII, so keep the flag off wherever
 * that matters. Token/secret fields are redacted per the pino config in
 * src/config/logger.config.ts.
 */
@Injectable()
export class DebugPayloadInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    return next
      .handle()
      .pipe(
        tap((payload) =>
          this.logger.debug({ method: req.method, url: req.url, payload }),
        ),
      );
  }
}
