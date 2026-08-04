import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';
import { getHttpStatusName } from '../utils/http-status.util';

/**
 * Documents error responses with the exact shape AllExceptionsFilter
 * emits: { success: false, status, message, payload: null }.
 */
export function ApiErrorResponses(...statuses: HttpStatus[]): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: getHttpStatusName(status),
        schema: {
          allOf: [
            { $ref: getSchemaPath(ErrorResponseDto) },
            {
              properties: {
                status: { type: 'string', example: getHttpStatusName(status) },
              },
            },
          ],
        },
      }),
    ),
  );
}
