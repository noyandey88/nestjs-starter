/** Payload signed into access tokens (see AuthService.issueAccessToken). */
export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}
