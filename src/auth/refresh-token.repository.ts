import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_ORM } from 'src/database/database.constants';
import * as schema from '../database/schema';
import { refreshTokens } from '../database/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: { userId: number; tokenHash: string; expiresAt: Date }) {
    return await this.db.insert(refreshTokens).values(data).returning();
  }

  async findActiveUserById(userId: number) {
    return await this.db.query.refreshTokens.findMany({
      where: and(
        eq(refreshTokens.userId, userId),
        eq(refreshTokens.revoked, false),
      ),
    });
  }

  async revokeToken(id: number) {
    return await this.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, id))
      .returning();
  }

  async revokeAllForUser(userId: number) {
    await this.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.userId, userId))
      .returning();
  }
}
