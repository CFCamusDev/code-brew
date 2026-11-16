import type { AdminUser } from '../domain/identity';

export interface StoredUser extends AdminUser {
  active: boolean;
  passwordHash: string;
}

export interface SessionRepository {
  insert(session: { id: string; userId: number; expiresAt: Date; userAgent?: string }): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
  /** Usuario activo de una sesión vigente, o null. */
  findActiveUser(sessionId: string, now: Date): Promise<AdminUser | null>;
  delete(sessionId: string): Promise<void>;
  deleteAllOf(userId: number): Promise<void>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  touchLastLogin(userId: number, at: Date): Promise<void>;
  findPasswordHash(userId: number): Promise<string | null>;
  updatePasswordHash(userId: number, passwordHash: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export interface TokenService {
  /** Token opaco para la cookie de sesión. */
  generate(): string;
  /** Lo que se guarda en la base: nunca el token en claro. */
  digest(token: string): string;
}
