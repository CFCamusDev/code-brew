import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../../../../scripts/lib/password.mjs';
import { getDb } from '../../../../lib/server/db';
import { adminSessions, adminUsers } from '../../../../lib/server/db/schema';
import type { PasswordHasher, SessionRepository, TokenService, UserRepository } from '../application/ports';

/** Los adaptadores abren la conexión en cada operación (la base se conecta al primer uso, no al importar). */

export const drizzleSessionRepository: SessionRepository = {
  async insert({ id, userId, expiresAt, userAgent }) {
    await getDb().insert(adminSessions).values({ id, userId, expiresAt, userAgent });
  },
  async deleteExpired(now) {
    await getDb().delete(adminSessions).where(lt(adminSessions.expiresAt, now));
  },
  async findActiveUser(sessionId, now) {
    const [row] = await getDb()
      .select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
      .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, now), eq(adminUsers.active, true)));
    return row ?? null;
  },
  async delete(sessionId) {
    await getDb().delete(adminSessions).where(eq(adminSessions.id, sessionId));
  },
  async deleteAllOf(userId) {
    await getDb().delete(adminSessions).where(eq(adminSessions.userId, userId));
  }
};

export const drizzleUserRepository: UserRepository = {
  async findByEmail(email) {
    const [user] = await getDb().select().from(adminUsers).where(eq(adminUsers.email, email));
    return user ?? null;
  },
  async touchLastLogin(userId, at) {
    await getDb().update(adminUsers).set({ lastLoginAt: at }).where(eq(adminUsers.id, userId));
  },
  async findPasswordHash(userId) {
    const [user] = await getDb().select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, userId));
    return user?.passwordHash ?? null;
  },
  async updatePasswordHash(userId, passwordHash) {
    await getDb().update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, userId));
  }
};

/** scrypt, el mismo que usa scripts/admin/create-user.mjs. */
export const scryptHasher: PasswordHasher = { hash: hashPassword, verify: verifyPassword };

export const nodeTokenService: TokenService = {
  generate: () => randomBytes(32).toString('base64url'),
  digest: value => createHash('sha256').update(value).digest('hex')
};
