import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'src/auth/auth.types';

/**
 * Injects the verified JWT payload that AuthGuard put on request.user.
 * Only meaningful on routes behind @Auth(). Pass a key to get one field:
 * `@CurrentUser('sub') userId: number`.
 */
export const CurrentUser = createParamDecorator(
  (prop: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return prop ? request.user[prop] : request.user;
  },
);
