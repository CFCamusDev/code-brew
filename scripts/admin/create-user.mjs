// Crea un usuario del panel (o restablece su contraseña si ya existe).
// Uso: pnpm admin:create correo@dominio.com "Nombre" [admin|operator]
// En Docker: docker exec -it codebrew-app node scripts/admin/create-user.mjs correo@dominio.com "Nombre" admin
// La contraseña se genera al azar y se muestra una sola vez; cámbiala al entrar.
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPassword } from '../lib/password.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const [email, name, role = 'admin'] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !['admin', 'operator'].includes(role)) {
  console.error('Uso: node scripts/admin/create-user.mjs correo@dominio.com "Nombre" [admin|operator]');
  process.exit(1);
}

const password = randomBytes(12).toString('base64url');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [user] = await sql`
    insert into admin_users (email, name, password_hash, role)
    values (${email.toLowerCase()}, ${name}, ${await hashPassword(password)}, ${role})
    on conflict (email) do update set password_hash = excluded.password_hash, active = true, updated_at = now()
    returning id, (xmax = 0) as created`;
  // Cierra sesiones abiertas si se restableció la contraseña.
  await sql`delete from admin_sessions where user_id = ${user.id}`;
  console.log(`${user.created ? 'Usuario creado' : 'Contraseña restablecida'}: ${email.toLowerCase()} (${role})`);
  console.log(`Contraseña temporal: ${password}`);
} finally {
  await sql.end();
}
