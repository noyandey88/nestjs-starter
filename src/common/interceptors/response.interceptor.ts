// src/common/interceptors/response.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { getHttpStatusName } from '../dto/api-response.dto';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((payload) => {
        if (
          typeof payload === 'object' &&
          payload !== null &&
          'success' in payload &&
          'status' in payload &&
          'message' in payload &&
          'payload' in payload
        ) {
          const apiRes = payload as ApiResponse<T>;
          return {
            ...apiRes,
            status: getHttpStatusName(apiRes.status),
          };
        }

        return {
          success: true,
          status: getHttpStatusName(res.statusCode),
          message: this.extractMessage(payload),
          payload: this.extractPayload(payload),
        };
      }),
    );
  }

  private extractMessage(payload: unknown): string {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
    ) {
      return (payload as { message?: string }).message as string;
    }

    return 'Request successful';
  }

  private extractPayload(payload: unknown): T {
    if (typeof payload === 'object' && payload !== null && 'data' in payload) {
      return (payload as { data?: T }).data as T;
    }

    return payload as T;
  }
}
