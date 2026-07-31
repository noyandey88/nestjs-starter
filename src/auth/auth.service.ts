import { Injectable, Logger } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { RegisterDto, LoginDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService) {}
  async registerUser(registerUserDto: RegisterDto) {
    Logger.log(registerUserDto);

    const hash = await bcrypt.hash(registerUserDto.password, 10);

    return this.userService.createUser({ ...registerUserDto, password: hash });
  }

  async loginUser(loginDto: LoginDto) {
    Logger.log(loginDto);

    return this.userService.findUser(loginDto);
  }
}
