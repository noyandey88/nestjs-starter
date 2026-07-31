import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/registerUser.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseBuilder } from 'src/common/dto/api-response.dto';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
