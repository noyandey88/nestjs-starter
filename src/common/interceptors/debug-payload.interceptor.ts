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
 * Development-only: logs each response payload at debug level so the
 * full request/response cycle is visible while debugging. Registered in
 * main.ts only when NODE_ENV === 'development' — never in production
 * (payloads may contain PII). Token fields are redacted by the pino
 * config in app.module.ts.
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
