import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiErrorResponses } from './api-error-responses.decorator';

/**
 * Protected route: AuthGuard + Swagger bearer scheme ('access-token',
 * registered in main.ts) + documented 401.
 */
export function Auth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(AuthGuard),
    ApiBearerAuth('access-token'),
    ApiErrorResponses(HttpStatus.UNAUTHORIZED),
  );
}
