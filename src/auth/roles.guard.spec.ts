import { vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '../user/user.types.js';

describe('RolesGuard', () => {
  const makeContext = (role: UserRole | undefined) =>
    ({
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { sub: 1, email: 'a', role } : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  const makeGuard = (required: UserRole[] | undefined) =>
    new RolesGuard({
      getAllAndOverride: vi.fn().mockReturnValue(required),
    } as unknown as Reflector);

  it('passes when the route declares no roles', () => {
    expect(
      makeGuard(undefined).canActivate(makeContext(UserRole.Student)),
    ).toBe(true);
    expect(makeGuard([]).canActivate(makeContext(UserRole.Student))).toBe(true);
  });

  it('passes when the user holds a required role', () => {
    expect(
      makeGuard([UserRole.Admin]).canActivate(makeContext(UserRole.Admin)),
    ).toBe(true);
  });

  it('throws 403 when the user lacks the role', () => {
    expect(() =>
      makeGuard([UserRole.Admin]).canActivate(makeContext(UserRole.Student)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when there is no user on the request', () => {
    expect(() =>
      makeGuard([UserRole.Admin]).canActivate(makeContext(undefined)),
    ).toThrow(ForbiddenException);
  });
});
