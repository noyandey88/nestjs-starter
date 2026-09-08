import { UserRole } from '../user/user.types.js';

/** Payload signed into access tokens (see AuthService.issueAccessToken). */
export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
}
