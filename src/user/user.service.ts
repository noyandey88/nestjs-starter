import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoginDto, RegisterDto } from 'src/auth/dto/registerUser.dto';
import { UserRepository } from './user.repository';
import bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}
  async createUser(registerUserDto: RegisterDto) {
    const existing = await this.userRepository.findByEmail(
      registerUserDto.email,
    );

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const user = await this.userRepository.createUser(registerUserDto);
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async findUser(loginDto: LoginDto) {
    const user = await this.userRepository.findByEmail(loginDto.email);

    if (user) {
      const isPasswordMatched = await bcrypt.compare(
        loginDto.password,
        user.password,
      );

      if (isPasswordMatched) {
        const { password: _password, ...safeUser } = user;
        return safeUser;
      } else {
        throw new BadRequestException(
          'The email or password you entered is incorrect',
        );
      }
    } else {
      throw new NotFoundException('User not found');
    }
  }
}
