import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { RegisterDto, LoginDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from './refresh-token.repository';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly configService: ConfigService,
  ) {}
  async registerUser(registerUserDto: RegisterDto) {
    Logger.log(registerUserDto);

    const hash = await bcrypt.hash(registerUserDto.password, 10);

    return this.userService.createUser({ ...registerUserDto, password: hash });
  }

  async loginUser(loginDto: LoginDto) {
    Logger.log(loginDto);

    const user = await this.userService.findUser(loginDto);

    const {
      accessToken,
      expiresIn: accessTokenExpiresIn,
      expiresAt: accessTokenExpiresAt,
    } = await this.issueAccessToken(user.id, user.email, user.role);

    const {
      refreshToken,
      expiresIn: refreshTokenExpiresIn,
      expiresAt: refreshTokenExpiresAt,
    } = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessTokenExpiresIn,
      accessTokenExpiresAt: accessTokenExpiresAt,
      refreshTokenExpiresIn: refreshTokenExpiresIn,
      refreshTokenExpiresAt: refreshTokenExpiresAt,
      user: user,
    };
  }

  async refreshAccessToken(userId: number, refreshToken: string) {
    const storedTokens =
      await this.refreshTokenRepository.findActiveUserById(userId);

    const match = await this.findMatchingToken(storedTokens, refreshToken);

    if (!match) {
      await this.refreshTokenRepository.revokeAllForUser(userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if ((match.expiresAt && match.expiresAt < new Date()) || match.revoked) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    await this.refreshTokenRepository.revokeToken(match.id);

    const user = await this.userService.findUserById(userId);

    return await this.issueAccessToken(userId, user.email, user.role);
  }

  async logout(userId: number) {
    return await this.refreshTokenRepository.revokeAllForUser(userId);
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
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await bcrypt.hash(rawRefreshToken, 10);
    const expiresIn = this.configService.get<number>('JWT_REFRESH_EXPIRES_IN')!;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.refreshTokenRepository.create({ userId, tokenHash, expiresAt });

    return {
      refreshToken: rawRefreshToken,
      expiresIn,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };
  }

  private async findMatchingToken(
    storedTokens: {
      id: number;
      createdAt: Date | null;
      userId: number;
      tokenHash: string;
      revoked: boolean;
      expiresAt: Date | null;
    }[],
    plainToken: string,
  ) {
    for (const stored of storedTokens) {
      const isMatch = await bcrypt.compare(plainToken, stored.tokenHash);
      if (isMatch) return stored;
    }
    return null;
  }
}
