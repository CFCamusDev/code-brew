import { describe, expect, it } from 'vitest';
import { amountToCents, limaYear, type ComplaintInput, type ComplaintRecord } from '../../src/server/modules/complaints/domain/complaint';
import {
  registerComplaint,
  type ComplaintNotifier,
  type ComplaintRepository
} from '../../src/server/modules/complaints/application/register-complaint';
import { FixedClock } from '../../src/server/shared/clock';

const input: ComplaintInput = {
  type: 'reclamo', consumerName: 'Ana Pérez', consumerEmail: 'ana@example.com', consumerAddress: 'Av. Prueba 123', isMinor: false,
  productOrService: 'Espresso 250 g', amount: 32.5, detail: 'Llegó tarde', consumerRequest: 'Quiero una compensación'
};

function harness(startAt: Record<number, number> = {}) {
  const counters = { ...startAt };
  const inserted: Record<string, unknown>[] = [];
  const sent: ComplaintRecord[] = [];
  const events: string[] = [];
  const repository: ComplaintRepository = {
    async nextSequence(year) {
      return (counters[year] = (counters[year] ?? 0) + 1);
    },
    async insert(data) {
      inserted.push(data);
      return { id: inserted.length, year: data.year, sequence: data.sequence, type: data.type, consumerName: data.consumerName,
        consumerEmail: data.consumerEmail, productOrService: data.productOrService, detail: data.detail, consumerRequest: data.consumerRequest };
    }
  };
  const notifier: ComplaintNotifier = { notifyRegistered: async c => void (events.push('correo'), sent.push(c)) };
  const persist = async (work: (r: ComplaintRepository) => Promise<ComplaintRecord>) => {
    events.push('transacción');
    return work(repository);
  };
  const register = (date: string, data = input) => registerComplaint({ clock: new FixedClock(new Date(date)), notifier, persist }, data);
  return { register, inserted, sent, events };
}

describe('año en hora de Lima', () => {
  it('Año Nuevo se cuenta en Lima, no en UTC', () => {
    expect(limaYear(new Date('2027-01-01T04:59:00Z'))).toBe(2026); // 23:59 del 31/12 en Lima
    expect(limaYear(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  });

  it('monto en soles a céntimos', () => {
    expect(amountToCents(32.5)).toBe(3250);
    expect(amountToCents(0)).toBe(0);
    expect(amountToCents(undefined)).toBeNull();
  });
});

describe('RegistrarReclamo', () => {
  it('numera correlativamente por año y guarda el monto en céntimos', async () => {
    const { register, inserted } = harness();
    const first = await register('2026-03-01T12:00:00Z');
    const second = await register('2026-03-02T12:00:00Z');
    expect([first.year, first.sequence, second.sequence]).toEqual([2026, 1, 2]);
    expect(inserted[0]).toMatchObject({ year: 2026, sequence: 1, amountCents: 3250 });
    expect(inserted[0]).not.toHaveProperty('amount');
  });

  it('el correlativo se reinicia al cambiar de año', async () => {
    const { register } = harness({ 2026: 41 });
    expect((await register('2026-12-31T12:00:00Z')).sequence).toBe(42);
    expect(await register('2027-01-01T12:00:00Z')).toMatchObject({ year: 2027, sequence: 1 });
  });

  it('sin monto guarda null, y el correo sale después de la transacción', async () => {
    const { register, inserted, sent, events } = harness();
    await register('2026-03-01T12:00:00Z', { ...input, amount: undefined });
    expect(inserted[0]).toMatchObject({ amountCents: null });
    expect(events).toEqual(['transacción', 'correo']);
    expect(sent[0]).toMatchObject({ year: 2026, sequence: 1, consumerEmail: 'ana@example.com' });
  });
});
