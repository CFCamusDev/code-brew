import { logger } from '../../../lib/server/logger';
import { systemClock } from '../../shared/clock';
import { createSettingReader } from './application/setting-reader';
import { drizzleSettingStore } from './infrastructure/drizzle-setting-store';

// API pública del módulo settings. Raíz de composición: aquí se enlaza el repositorio Drizzle y el reloj del sistema.

export { POLICY_KEYS, SOCIAL_LINKS_KEY, type PolicyContent, type PolicySlug, type SocialLinks } from './domain/settings';

const reader = createSettingReader({ store: drizzleSettingStore, clock: systemClock, logError: (message, error) => logger.error(message, error) });

export const getSetting = reader.get;
export const invalidateSetting = reader.invalidate;
