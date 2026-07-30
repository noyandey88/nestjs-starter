// src/common/dto/api-response.dto.ts
import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '../interfaces/api-response.interface';

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

export class ResponseBuilder {
  static success<T>(
    payload: T,
    message = 'Request successful',
    status: HttpStatus | number | string = HttpStatus.OK,
  ): ApiResponse<T> {
    return {
      success: true,
      status: getHttpStatusName(status),
      message,
      payload,
    };
  }

  static error(
    message = 'Something went wrong',
    status: HttpStatus | number | string = HttpStatus.INTERNAL_SERVER_ERROR,
    payload: null = null,
  ): ApiResponse<null> {
    return {
      success: false,
      status: getHttpStatusName(status),
      message,
      payload,
    };
  }
}
