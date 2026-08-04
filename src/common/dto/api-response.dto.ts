// src/common/dto/api-response.dto.ts
import { HttpStatus } from '@nestjs/common';
export { getHttpStatusName } from '../utils/http-status.util';
import { getHttpStatusName } from '../utils/http-status.util';
import { ApiResponse } from '../interfaces/api-response.interface';

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
