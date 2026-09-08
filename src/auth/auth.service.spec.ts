import { vi, type Mocked } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';

describe('AuthService', () => {
  let service: AuthService;
  let userService: Mocked<UserService>;
  let jwtService: Mocked<JwtService>;
  let refreshTokenRepository: Mocked<RefreshTokenRepository>;

  const safeUser = {
    id: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    userService = {
      createUser: vi.fn(),
      findUser: vi.fn(),
      findUserById: vi.fn(),
    } as unknown as Mocked<UserService>;
    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as Mocked<JwtService>;
    refreshTokenRepository = {
      create: vi.fn(),
      findByHash: vi.fn(),
      revokeToken: vi.fn(),
      revokeAllForUser: vi.fn(),
      deleteStaleForUser: vi.fn(),
    } as unknown as Mocked<RefreshTokenRepository>;
    const configService = {
      get: vi.fn((key: string) =>
        key === 'JWT_ACCESS_EXPIRES_IN' ? 300 : 604800,
      ),
    } as unknown as ConfigService;

    service = new AuthService(
      userService,
      jwtService,
      refreshTokenRepository,
      configService,
    );
  });

  describe('registerUser', () => {
    it('hashes the password before delegating to userService', async () => {
      userService.createUser.mockResolvedValue(safeUser);
      const dto = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'plain-password',
      };

      await service.registerUser(dto);

      const passed = userService.createUser.mock.calls[0][0];
      expect(passed.password).not.toBe('plain-password');
      await expect(
        bcrypt.compare('plain-password', passed.password),
      ).resolves.toBe(true);
    });
  });

  describe('loginUser', () => {
    it('returns tokens and user on success', async () => {
      userService.findUser.mockResolvedValue(safeUser);
      refreshTokenRepository.create.mockResolvedValue([] as never);

      const result = await service.loginUser({
        email: safeUser.email,
        password: 'plain-password',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.accessTokenExpiresIn).toBe(300);
      expect(result.refreshTokenExpiresIn).toBe(604800);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: safeUser.id }),
      );
      // stored hash must not be the raw refresh token
      const stored = refreshTokenRepository.create.mock.calls[0][0];
      expect(stored.tokenHash).not.toBe(result.refreshToken);
      // and it must be the deterministic digest the refresh lookup uses
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(result.refreshToken).digest('hex'),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.deleteStaleForUser).toHaveBeenCalledWith(
        safeUser.id,
      );
    });
  });

  describe('refreshAccessToken', () => {
    const raw = 'raw-refresh-token';
    const makeStored = (overrides = {}) => ({
      id: 10,
      userId: 1,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      ...overrides,
    });

    it('looks the token up by its sha256 digest', async () => {
      refreshTokenRepository.findByHash.mockResolvedValue(makeStored());
      userService.findUserById.mockResolvedValue(safeUser);

      await service.refreshAccessToken(raw);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.findByHash).toHaveBeenCalledWith(
        createHash('sha256').update(raw).digest('hex'),
      );
    });

    it('revokes the presented token and issues a new pair', async () => {
      refreshTokenRepository.findByHash.mockResolvedValue(makeStored());
      userService.findUserById.mockResolvedValue(safeUser);

      const result = await service.refreshAccessToken(raw);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith(10);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(raw);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 }),
      );
    });

    it('throws when no stored token matches', async () => {
      refreshTokenRepository.findByHash.mockResolvedValue(undefined);

      await expect(service.refreshAccessToken(raw)).rejects.toThrow(
        UnauthorizedException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('treats a revoked token as reuse and revokes the whole family', async () => {
      refreshTokenRepository.findByHash.mockResolvedValue(
        makeStored({ revoked: true }),
      );

      await expect(service.refreshAccessToken(raw)).rejects.toThrow(
        UnauthorizedException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });

    it('throws when the matching token is expired', async () => {
      refreshTokenRepository.findByHash.mockResolvedValue(
        makeStored({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refreshAccessToken(raw)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes all refresh tokens for the user', async () => {
      await service.logout(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });
  });
});
