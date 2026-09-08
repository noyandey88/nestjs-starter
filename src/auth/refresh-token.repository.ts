import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_ORM } from '../database/database.constants.js';
import * as schema from '../database/schema/index.js';
import { refreshTokens } from '../database/schema/index.js';
import { and, eq, InferSelectModel, lt, or } from 'drizzle-orm';

export type RefreshToken = InferSelectModel<typeof refreshTokens>;

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: { userId: number; tokenHash: string; expiresAt: Date }) {
    return await this.db.insert(refreshTokens).values(data).returning();
  }

  /** Indexed lookup by hash; returns revoked rows too so reuse can be detected. */
  async findByHash(tokenHash: string): Promise<RefreshToken | undefined> {
    return await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
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
      .where(eq(refreshTokens.userId, userId));
  }

  /** Drops rows that can never be redeemed again (revoked or expired). */
  async deleteStaleForUser(userId: number, now: Date = new Date()) {
    await this.db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          or(eq(refreshTokens.revoked, true), lt(refreshTokens.expiresAt, now)),
        ),
      );
  }
}
