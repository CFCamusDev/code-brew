import type { Clock } from '../../../shared/clock';
import { amountToCents, limaYear, type ComplaintInput, type ComplaintRecord } from '../domain/complaint';

export interface ComplaintRepository {
  /** Incrementa de forma atómica el contador del año y devuelve el nuevo correlativo. */
  nextSequence(year: number): Promise<number>;
  insert(complaint: { year: number; sequence: number; amountCents: number | null } & Omit<ComplaintInput, 'amount'>): Promise<ComplaintRecord>;
}

/** Aviso por correo al consumidor y al negocio (obligatorio por Indecopi). */
export interface ComplaintNotifier {
  notifyRegistered(complaint: ComplaintRecord): Promise<void>;
}

/**
 * Caso de uso RegistrarReclamo (Libro de Reclamaciones virtual). `persist` abre la transacción (UnitOfWork) que
 * numera y guarda el reclamo; los correos salen después, fuera de la transacción.
 */
export async function registerComplaint(
  deps: {
    clock: Clock;
    notifier: ComplaintNotifier;
    persist(work: (repository: ComplaintRepository) => Promise<ComplaintRecord>): Promise<ComplaintRecord>;
  },
  data: ComplaintInput
): Promise<ComplaintRecord> {
  const year = limaYear(deps.clock.now());
  const { amount, ...rest } = data;
  const complaint = await deps.persist(async repository => {
    const sequence = await repository.nextSequence(year);
    return repository.insert({
      ...rest,
      consumerDocument: rest.consumerDocument || undefined,
      year,
      sequence,
      amountCents: amountToCents(amount)
    });
  });
  await deps.notifier.notifyRegistered(complaint);
  return complaint;
}
