import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service.js';
import { RegisterDto, LoginDto } from './dto/registerUser.dto.js';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from './refresh-token.repository.js';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly configService: ConfigService,
  ) {}

  async registerUser(registerUserDto: RegisterDto) {
    const hash = await bcrypt.hash(registerUserDto.password, 10);

    return this.userService.createUser({ ...registerUserDto, password: hash });
  }

  async loginUser(loginDto: LoginDto) {
    const user = await this.userService.findUser(loginDto);

    // Cheap, bounded housekeeping: every login sheds this user's dead rows
    // so the table never accumulates unbounded revoked/expired tokens.
    await this.refreshTokenRepository.deleteStaleForUser(user.id);

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);

    return { ...tokens, user };
  }

  /**
   * Redeems a refresh token: the presented token is revoked and a new
   * access/refresh pair is issued. Presenting an already-revoked token
   * is treated as theft and revokes every token the user holds.
   */
  async refreshAccessToken(rawRefreshToken: string) {
    const stored = await this.refreshTokenRepository.findByHash(
      this.hashRefreshToken(rawRefreshToken),
    );

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revoked) {
      await this.refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token reused');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.refreshTokenRepository.revokeToken(stored.id);

    const user = await this.userService.findUserById(stored.userId);

    return this.issueTokenPair(user.id, user.email, user.role);
  }

  async logout(userId: number) {
    return await this.refreshTokenRepository.revokeAllForUser(userId);
  }

  private async issueTokenPair(userId: number, email: string, role: string) {
    const [access, refresh] = await Promise.all([
      this.issueAccessToken(userId, email, role),
      this.issueRefreshToken(userId),
    ]);

    return {
      accessToken: access.accessToken,
      refreshToken: refresh.refreshToken,
      accessTokenExpiresIn: access.expiresIn,
      accessTokenExpiresAt: access.expiresAt,
      refreshTokenExpiresIn: refresh.expiresIn,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }

  private async issueAccessToken(userId: number, email: string, role: string) {
    const payload = { sub: userId, email: email, role: role };
    const token = await this.jwtService.signAsync(payload);
    const expiresIn = this.configService.get<number>('JWT_ACCESS_EXPIRES_IN')!;

    return {
      accessToken: token,
      expiresIn,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    };
  }

  private async issueRefreshToken(userId: number) {
    const rawRefreshToken = randomBytes(64).toString('hex');
    const expiresIn = this.configService.get<number>('JWT_REFRESH_EXPIRES_IN')!;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.refreshTokenRepository.create({
      userId,
      tokenHash: this.hashRefreshToken(rawRefreshToken),
      expiresAt,
    });

    return {
      refreshToken: rawRefreshToken,
      expiresIn,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };
  }

  /**
   * The raw token is 64 random bytes, so a fast unsalted digest is safe
   * (nothing to brute-force) and gives an indexable, deterministic key.
   * bcrypt would force a linear scan with a slow compare per row.
   */
  private hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
