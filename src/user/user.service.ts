import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterDto } from 'src/auth/dto/registerUser.dto';
import { UserRepository } from './user.repository';

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
}
