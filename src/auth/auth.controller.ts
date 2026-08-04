import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/registerUser.dto';
import {
  AccessTokenResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { ApiEnvelope } from 'src/common/decorators/api-envelope.decorator';
import { ApiErrorResponses } from 'src/common/decorators/api-error-responses.decorator';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account using the provided first name, last name, email, and password.',
  })
  @ApiEnvelope(UserResponseDto, { message: 'User registered successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  async register(@Body() registerUserDto: RegisterDto) {
    return this.authService.registerUser(registerUserDto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'user login',
    description: 'Login to your account with your credentials',
  })
  @ApiEnvelope(LoginResponseDto, { message: 'User logged in successful' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async login(@Body() loginUserDto: LoginDto) {
    return this.authService.loginUser(loginUserDto);
  }

  @Auth()
  @Post('access-token/refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Refresh the access token using a valid refresh token',
  })
  @ApiEnvelope(AccessTokenResponseDto, { message: 'Data loaded successfully' })
  async refreshAccessToken(
    @Body() refreshToken: RefreshTokenDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.authService.refreshAccessToken(
      userId,
      refreshToken.refreshToken,
    );
  }

  @Auth()
  @Post('logout')
  @ApiOperation({
    summary: 'Logout everywhere',
    description: 'Revokes all refresh tokens for the current user',
  })
  @ApiEnvelope(null, { message: 'Logged out successfully' })
  async logout(@CurrentUser('sub') userId: number) {
    await this.authService.logout(userId);
    return null;
  }
}
