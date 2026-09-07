import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema/index.js';
import { users } from '../database/schema/index.js';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_ORM } from '../database/database.constants.js';
import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { RegisterDto } from '../auth/dto/registerUser.dto.js';

type User = InferSelectModel<typeof users>;
type NewUser = InferInsertModel<typeof users>;

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    return await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  async findById(id: number): Promise<User | undefined> {
    return await this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async createUser(userData: RegisterDto): Promise<NewUser> {
    const [user] = await this.db.insert(users).values(userData).returning();
    return user;
  }
}
