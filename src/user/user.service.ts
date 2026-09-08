import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDto, RegisterDto } from '../auth/dto/registerUser.dto.js';
import { UserRepository } from './user.repository.js';
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

  /**
   * Verifies credentials. Unknown email and wrong password both yield the
   * same 401 so the endpoint cannot be used to enumerate accounts.
   */
  async findUser(loginDto: LoginDto) {
    const user = await this.userRepository.findByEmail(loginDto.email);
    const isPasswordMatched = user
      ? await bcrypt.compare(loginDto.password, user.password)
      : false;

    if (!user || !isPasswordMatched) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async findUserById(id: number) {
    const user = await this.userRepository.findById(id);

    if (user) {
      const { password: _password, ...safeUser } = user;
      return safeUser;
    }

    throw new NotFoundException('User not found');
  }
}
