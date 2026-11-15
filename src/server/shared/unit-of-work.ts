import { getDb } from '../../lib/server/db';

type Db = ReturnType<typeof getDb>;
export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Límite de transacción (ACID) de un caso de uso: todo lo que pasa dentro de `run` se confirma junto o se deshace junto.
 * Los casos de uso lo reciben por constructor; el dominio nunca abre transacciones.
 */
export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** Implementación sobre Drizzle. Único archivo de `shared` que conoce la base de datos. */
export function createUnitOfWork(getDatabase: () => Pick<Db, 'transaction'>): UnitOfWork {
  return { run: work => getDatabase().transaction(work) };
}

/** Instancia por defecto de la aplicación (la conexión se abre al primer uso). */
export const unitOfWork: UnitOfWork = createUnitOfWork(getDb);
