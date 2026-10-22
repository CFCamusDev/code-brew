import { randomBytes } from 'node:crypto';
import { and, asc, eq, ne } from 'drizzle-orm';
import { hashPassword } from '../../../../scripts/lib/password.mjs';
import { deleteUserSessions, type AdminRole } from '../auth';
import { getDb } from '../db';
import { adminUsers } from '../db/schema';
import { AdminActionError } from './orders';

export async function listUsers() {
  return getDb()
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      active: adminUsers.active,
      lastLoginAt: adminUsers.lastLoginAt
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.name));
}
export type AdminUserRow = Awaited<ReturnType<typeof listUsers>>[number];

const temporaryPassword = () => randomBytes(12).toString('base64url');

/** Crea el usuario con una contraseña temporal que se muestra una sola vez. */
export async function createUser(data: { email: string; name: string; role: AdminRole }) {
  const db = getDb();
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, data.email));
  if (existing) throw new AdminActionError('Ya existe un usuario con ese correo.');
  const password = temporaryPassword();
  await db.insert(adminUsers).values({ ...data, passwordHash: await hashPassword(password) });
  return password;
}

/** Evita que el panel quede sin ningún administrador activo. */
async function assertKeepsAnAdmin(userId: number) {
  const others = await getDb()
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(ne(adminUsers.id, userId), eq(adminUsers.role, 'admin'), eq(adminUsers.active, true)));
  if (!others.length) throw new AdminActionError('Debe quedar al menos un administrador activo.');
}

export async function updateUser(userId: number, actorId: number, data: { name: string; role: AdminRole; active: boolean }) {
  if (userId === actorId && (!data.active || data.role !== 'admin')) {
    throw new AdminActionError('No puedes desactivarte ni quitarte el rol de administrador a ti mismo.');
  }
  if (!data.active || data.role !== 'admin') await assertKeepsAnAdmin(userId);
  const [row] = await getDb().update(adminUsers).set(data).where(eq(adminUsers.id, userId)).returning({ id: adminUsers.id });
  if (!row) throw new AdminActionError('Usuario no encontrado.');
  if (!data.active) await deleteUserSessions(userId);
}

export async function resetUserPassword(userId: number) {
  const password = temporaryPassword();
  const [row] = await getDb()
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(adminUsers.id, userId))
    .returning({ id: adminUsers.id });
  if (!row) throw new AdminActionError('Usuario no encontrado.');
  await deleteUserSessions(userId);
  return password;
}
