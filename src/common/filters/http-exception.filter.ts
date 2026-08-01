// src/common/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { getHttpStatusName } from '../dto/api-response.dto';

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';

    const pgError = this.extractPgError(exception);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (typeof exception.message === 'string') {
          message = exception.message;
        }
      }
    } else if (pgError) {
      // Database errors (PostgreSQL / Drizzle ORM), whether top-level or wrapped in .cause
      if (pgError.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = this.formatUniqueViolation(pgError);
      } else if (pgError.code === '23502') {
        status = HttpStatus.BAD_REQUEST;
        message = 'A required field is missing';
      } else if (pgError.code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced record does not exist';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Database error occurred';
      }
      this.logger.error(
        `Database Error [${pgError.code ?? ''}]: ${pgError.message || ''} ${pgError.detail || ''}`,
        pgError.stack,
      );
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception caught', JSON.stringify(exception));
    }

    response.status(status).json({
      success: false,
      status: getHttpStatusName(status),
      message,
      payload: null,
    });
  }

  private extractPgError(exception: unknown): PgError | null {
    const hasCode = (e: unknown): e is PgError =>
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      typeof (e as { code?: unknown }).code === 'string';

    const findPgError = (value: unknown): PgError | null => {
      if (hasCode(value)) {
        return value;
      }

      if (typeof value === 'object' && value !== null && 'cause' in value) {
        const cause = (value as { cause?: unknown }).cause;
        return findPgError(cause);
      }

      return null;
    };

    return findPgError(exception);
  }

  private formatUniqueViolation(pgError: PgError): string {
    const match = /Key \((.+)\)=\((.+)\) already exists/.exec(
      pgError.detail || '',
    );
    if (match) {
      const [, field, value] = match;
      return `A record with ${field} '${value}' already exists`;
    }
    return 'A record with this value already exists';
  }
}
