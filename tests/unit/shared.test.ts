import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  createUnitOfWork,
  DomainError,
  err,
  FixedClock,
  Money,
  NotFoundError,
  ok,
  systemClock,
  unwrap,
  ValidationError
} from '../../src/server/shared';

describe('Money', () => {
  it('guarda céntimos enteros y rechaza decimales flotantes', () => {
    expect(Money.fromCents(3490).cents).toBe(3490);
    expect(() => Money.fromCents(34.9)).toThrow(ValidationError);
    expect(() => Money.fromCents(Number.NaN)).toThrow(ValidationError);
  });

  it.each([
    ['34', 3400],
    ['34.9', 3490],
    ['34.90', 3490],
    [0.1, 10],
    ['-2.05', -205]
  ])('convierte %s soles a %i céntimos sin errores de punto flotante', (input, cents) => {
    expect(Money.fromSoles(input).cents).toBe(cents);
  });

  it.each(['', 'abc', '1.234', '1,50', '.5'])('rechaza el monto %j', input => {
    expect(() => Money.fromSoles(input)).toThrow(DomainError);
  });

  it('suma 0.1 + 0.2 exactamente', () => {
    expect(Money.fromSoles('0.10').add(Money.fromSoles('0.20')).equals(Money.fromSoles('0.30'))).toBe(true);
  });

  it('resta, multiplica por cantidad y suma listas', () => {
    const price = Money.fromSoles('34.00');
    expect(price.times(3).cents).toBe(10200);
    expect(price.subtract(Money.fromSoles('4.50')).cents).toBe(2950);
    expect(Money.sum([price, price, Money.fromSoles('15')]).cents).toBe(8300);
    expect(Money.sum([])).toEqual(Money.ZERO);
    expect(() => price.times(1.5)).toThrow(ValidationError);
  });

  it('compara y formatea', () => {
    expect(Money.fromCents(100).compareTo(Money.fromCents(200))).toBe(-1);
    expect(Money.fromCents(200).compareTo(Money.fromCents(200))).toBe(0);
    expect(Money.fromCents(300).compareTo(Money.fromCents(200))).toBe(1);
    expect(Money.ZERO.isZero()).toBe(true);
    expect(Money.fromCents(-5).isNegative()).toBe(true);
    expect(Money.fromCents(3490).toDecimalString()).toBe('34.90');
    expect(Money.fromCents(5).toDecimalString()).toBe('0.05');
    expect(Money.fromCents(-205).toDecimalString()).toBe('-2.05');
  });
});

describe('errores y Result', () => {
  it('cada error lleva un código estable', () => {
    expect(new NotFoundError('no existe').code).toBe('not_found');
    expect(new ConflictError('choca', 'stock_insufficient').code).toBe('stock_insufficient');
    expect(new ValidationError('mal')).toBeInstanceOf(DomainError);
    expect(new NotFoundError('x').name).toBe('NotFoundError');
  });

  it('Result representa éxito o fallo y unwrap lanza el error', () => {
    expect(unwrap(ok(5))).toBe(5);
    const failure = err(new ConflictError('ya pagado'));
    expect(failure.ok).toBe(false);
    expect(() => unwrap(failure)).toThrow('ya pagado');
  });
});

describe('Clock', () => {
  it('el reloj del sistema devuelve la hora actual', () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('el reloj fijo avanza solo cuando se le indica y no filtra su estado interno', () => {
    const clock = new FixedClock(new Date('2026-11-11T10:00:00Z'));
    const first = clock.now();
    first.setFullYear(2000);
    expect(clock.now().toISOString()).toBe('2026-11-11T10:00:00.000Z');
    clock.advance(30 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-11-11T10:30:00.000Z');
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now().getUTCFullYear()).toBe(2027);
  });
});

describe('UnitOfWork', () => {
  it('ejecuta el trabajo dentro de la transacción y devuelve su resultado', async () => {
    const tx = { marker: 'tx' };
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(tx));
    const uow = createUnitOfWork(() => ({ transaction }) as never);
    const result = await uow.run(async received => {
      expect(received).toBe(tx);
      return 42;
    });
    expect(result).toBe(42);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('propaga el error para que la base de datos deshaga la transacción', async () => {
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({}));
    const uow = createUnitOfWork(() => ({ transaction }) as never);
    await expect(uow.run(async () => Promise.reject(new ConflictError('sin stock')))).rejects.toThrow('sin stock');
  });

  it('abre la conexión recién al usarse, no al crear el UnitOfWork', () => {
    const getDatabase = vi.fn();
    createUnitOfWork(getDatabase as never);
    expect(getDatabase).not.toHaveBeenCalled();
  });
});

describe('límites de arquitectura de shared', () => {
  const dir = join(process.cwd(), 'src/server/shared');
  const files = readdirSync(dir).filter(name => name.endsWith('.ts'));

  it('solo unit-of-work conoce la base de datos; ninguno importa astro ni drizzle', () => {
    expect(files).toContain('money.ts');
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/from ['"]astro/);
      if (file !== 'unit-of-work.ts') {
        expect(source, file).not.toMatch(/drizzle|lib\/server\/db|postgres/);
      }
    }
  });
});
