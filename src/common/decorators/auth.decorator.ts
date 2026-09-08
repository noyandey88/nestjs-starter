import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { ApiErrorResponses } from './api-error-responses.decorator.js';

/**
 * Protected route: AuthGuard + RolesGuard (enforces @Roles(), no-op
 * otherwise) + Swagger bearer scheme ('access-token', registered in
 * bootstrap.ts) + documented 401.
 */
export function Auth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth('access-token'),
    ApiErrorResponses(HttpStatus.UNAUTHORIZED),
  );
}
