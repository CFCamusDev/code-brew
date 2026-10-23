import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../../scripts/lib/password.mjs';
import { getDb } from './db';
import { adminSessions, adminUsers } from './db/schema';

export const SESSION_COOKIE = 'cb_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminRole = 'admin' | 'operator';
export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(userId: number, userAgent: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();
  await db.insert(adminSessions).values({ id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  // Limpieza oportunista de sesiones vencidas.
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<AdminUser | null> {
  const [row] = await getDb()
    .select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.id, sha256(token)), gt(adminSessions.expiresAt, new Date()), eq(adminUsers.active, true)));
  return row ?? null;
}

export async function deleteSession(token: string) {
  await getDb().delete(adminSessions).where(eq(adminSessions.id, sha256(token)));
}

export async function deleteUserSessions(userId: number) {
  await getDb().delete(adminSessions).where(eq(adminSessions.userId, userId));
}

// ---------- Login con límite de intentos ----------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function isLocked(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else entry.count++;
}

// Hash de relleno para que un correo inexistente tarde lo mismo que uno real.
let dummyHash: Promise<string> | undefined;

export type LoginResult = { ok: true; user: AdminUser } | { ok: false; reason: 'invalid' | 'locked' };

export async function login(email: string, password: string, ip: string): Promise<LoginResult> {
  const keys = [`ip:${ip}`, `email:${email}`];
  if (keys.some(isLocked)) return { ok: false, reason: 'locked' };

  const db = getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

  if (!user || !user.active || !valid) {
    keys.forEach(recordFailure);
    return { ok: false, reason: 'invalid' };
  }
  keys.forEach(key => failures.delete(key));
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function changePassword(userId: number, current: string, next: string) {
  const db = getDb();
  const [user] = await db.select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) return false;
  await db.update(adminUsers).set({ passwordHash: await hashPassword(next) }).where(eq(adminUsers.id, userId));
  return true;
}

/** IP real del cliente detrás de Cloudflare y nginx. */
export function clientIp(request: Request, fallback: string) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    fallback
  );
}
