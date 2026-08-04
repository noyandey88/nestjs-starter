import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiEnvelope } from 'src/common/decorators/api-envelope.decorator';
import { ApiErrorResponses } from 'src/common/decorators/api-error-responses.decorator';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Auth()
  @Get('me')
  @ApiOperation({
    summary: 'current user',
    description: 'you can get currently logged in user data',
  })
  @ApiEnvelope(UserResponseDto, { message: 'Data loaded successfully' })
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async getUserProfile(@CurrentUser('sub') userId: number) {
    return this.userService.findUserById(userId);
  }
}
