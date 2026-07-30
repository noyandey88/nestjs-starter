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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';

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
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception
    ) {
      // Database errors (PostgreSQL / Drizzle ORM)
      const dbError = exception as {
        code?: string;
        message?: string;
        detail?: string;
        stack?: string;
      };
      if (dbError.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Email or unique field already exists';
      } else if (dbError.code === '23502' || dbError.code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Database constraint violation';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Database error occurred';
      }
      this.logger.error(
        `Database Error [${dbError.code ?? ''}]: ${dbError.message || ''}`,
        dbError.stack,
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
}
