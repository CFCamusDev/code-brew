import { systemClock } from '../../shared/clock';
import { createIdentityService } from './application/identity-service';
import { LoginThrottle } from './domain/identity';
import { drizzleSessionRepository, drizzleUserRepository, nodeTokenService, scryptHasher } from './infrastructure/adapters';

// API pública del módulo identity (sesiones y login del panel /admin). Raíz de composición.
// La cookie (`SESSION_COOKIE`) y el middleware que la lee siguen igual: solo cambió dónde vive el código.

export { SESSION_COOKIE, type AdminRole, type AdminUser, type LoginResult } from './domain/identity';
export { clientIp } from './http/client-ip';

const identity = createIdentityService({
  sessions: drizzleSessionRepository,
  users: drizzleUserRepository,
  hasher: scryptHasher,
  tokens: nodeTokenService,
  clock: systemClock,
  throttle: new LoginThrottle(systemClock)
});

export const { createSession, getSessionUser, deleteSession, deleteUserSessions, login, changePassword } = identity;
