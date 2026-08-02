import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { ResponseBuilder } from 'src/common/dto/api-response.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Get('me')
  @ApiOperation({
    summary: 'current user',
    description: 'you can get currently logged in user data',
  })
  async getUserProfile(@Request() req: { user: { sub: number } }) {
    const userId = req.user.sub;

    if (!userId) {
      throw new BadRequestException('User id is missing');
    }

    const result = await this.userService.findUserById(userId);
    return ResponseBuilder.success(
      result,
      'Data loaded successfully',
      HttpStatus.OK,
    );
  }
}
