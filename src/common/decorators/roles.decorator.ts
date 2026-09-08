import { applyDecorators, HttpStatus, SetMetadata } from '@nestjs/common';
import { UserRole } from '../../user/user.types.js';
import { ApiErrorResponses } from './api-error-responses.decorator.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or whole controller) to the given roles. Enforced by
 * RolesGuard, which @Auth() installs, so this only has effect on routes
 * that are already behind @Auth(). Documents the 403.
 */
export function Roles(...roles: UserRole[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiErrorResponses(HttpStatus.FORBIDDEN),
  );
}
