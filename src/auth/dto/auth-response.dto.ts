import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../user/dto/user-response.dto.js';

/** Return shape of AuthService.issueAccessToken / refreshAccessToken. */
export class AccessTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 300, description: 'Access token lifetime, seconds' })
  expiresIn!: number;

  @ApiProperty({ example: 1754300000, description: 'Unix timestamp (seconds)' })
  expiresAt!: number;
}

/** Return shape of AuthService.loginUser. */
export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 'a3f9c2...64-byte-hex' })
  refreshToken!: string;

  @ApiProperty({ example: 300, description: 'Seconds' })
  accessTokenExpiresIn!: number;

  @ApiProperty({ example: 1754300000, description: 'Unix timestamp (seconds)' })
  accessTokenExpiresAt!: number;

  @ApiProperty({ example: 604800, description: 'Seconds' })
  refreshTokenExpiresIn!: number;

  @ApiProperty({ example: 1754900000, description: 'Unix timestamp (seconds)' })
  refreshTokenExpiresAt!: number;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
