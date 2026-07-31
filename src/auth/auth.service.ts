import { Injectable, Logger } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { RegisterDto, LoginDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
  async registerUser(registerUserDto: RegisterDto) {
    Logger.log(registerUserDto);

    const hash = await bcrypt.hash(registerUserDto.password, 10);

    return this.userService.createUser({ ...registerUserDto, password: hash });
  }

  async loginUser(loginDto: LoginDto) {
    Logger.log(loginDto);

    const user = await this.userService.findUser(loginDto);

    const payload = { sub: user.id };
    const token = await this.jwtService.signAsync(payload);

    const expiresIn = 5 * 60; // 300 ms

    return {
      accessToken: token,
      expiresIn,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      user: user,
    };
  }
}
