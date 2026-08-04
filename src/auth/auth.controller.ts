import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/registerUser.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ResponseBuilder } from 'src/common/dto/api-response.dto';
import { AuthGuard } from './auth.guard';
import { UserService } from 'src/user/user.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: RegisterDto })
  @HttpCode(HttpStatus.OK)
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account using the provided first name, last name, email, and password.',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully.',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use.',
  })
  async register(@Body() registerUserDto: RegisterDto) {
    const result = await this.authService.registerUser(registerUserDto);
    return ResponseBuilder.success(
      result,
      'User registered successfully',
      HttpStatus.OK,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: 'user login',
    description: 'Login to your account with your credentials',
  })
  async login(@Body() loginUserDto: LoginDto) {
    const result = await this.authService.loginUser(loginUserDto);
    return ResponseBuilder.success(
      result,
      'User logged in successful',
      HttpStatus.OK,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('access-token/refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Refresh the access token using a valid refresh token',
  })
  async refreshAccessToken(
    @Body() refreshToken: RefreshTokenDto,
    @Request() req: { user: { sub: number } },
  ) {
    const userId = req.user.sub;

    if (!userId) {
      throw new BadRequestException('User id is missing');
    }

    const result = await this.authService.refreshAccessToken(
      userId,
      refreshToken.refreshToken,
    );
    return ResponseBuilder.success(
      result,
      'Data loaded successfully',
      HttpStatus.OK,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({
    summary: 'Logout everywhere',
    description: 'Revokes all refresh tokens for the current user',
  })
  async logout(@Request() req: { user: { sub: number } }) {
    const userId = req.user.sub;

    if (!userId) {
      throw new BadRequestException('User id is missing');
    }

    await this.authService.logout(userId);
    return ResponseBuilder.success(
      null,
      'Logged out successfully',
      HttpStatus.OK,
    );
  }
}
