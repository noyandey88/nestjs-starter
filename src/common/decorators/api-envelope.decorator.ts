import {
  applyDecorators,
  HttpCode,
  HttpStatus,
  SetMetadata,
  Type,
} from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { getHttpStatusName } from '../utils/http-status.util';

export const RESPONSE_MESSAGE_KEY = 'response_message';

export interface ApiEnvelopeOptions {
  /** Envelope message; also the Swagger example. Default: 'Request successful'. */
  message?: string;
  /** Swagger response description. Defaults to the message. */
  description?: string;
  /** HTTP status for the route. Default: 200. */
  status?: HttpStatus;
  /** Document the payload as an array of payloadDto. */
  isArray?: boolean;
}

/**
 * Declares a route's success contract in one place: HTTP status,
 * envelope message (read by ResponseInterceptor), and the Swagger
 * schema `{ success, status, message, payload: <dto> }`.
 * Pass `null` as payloadDto for routes whose payload is null.
 */
export function ApiEnvelope(
  payloadDto: Type<unknown> | null,
  options: ApiEnvelopeOptions = {},
): MethodDecorator {
  const status = options.status ?? HttpStatus.OK;
  const message = options.message ?? 'Request successful';

  const payloadSchema = payloadDto
    ? options.isArray
      ? { type: 'array', items: { $ref: getSchemaPath(payloadDto) } }
      : { $ref: getSchemaPath(payloadDto) }
    : { type: 'object', nullable: true, example: null };

  const decorators: MethodDecorator[] = [
    HttpCode(status),
    SetMetadata(RESPONSE_MESSAGE_KEY, message),
    ApiResponse({
      status,
      description: options.description ?? message,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          status: { type: 'string', example: getHttpStatusName(status) },
          message: { type: 'string', example: message },
          payload: payloadSchema,
        },
      },
    }),
  ];

  if (payloadDto) {
    decorators.push(ApiExtraModels(payloadDto));
  }

  return applyDecorators(...decorators);
}
