import { ValidationError } from './errors';

/** Monto en céntimos de sol (PEN). Siempre entero: nunca se hacen cuentas con decimales flotantes. */
export class Money {
  private constructor(public readonly cents: number) {}

  static readonly ZERO = new Money(0);

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) throw new ValidationError('El monto en céntimos debe ser un entero.', 'money_not_integer');
    return new Money(cents);
  }

  /** "34", "34.9" o "34.90" → 3490. Rechaza más de 2 decimales en vez de redondear en silencio. */
  static fromSoles(input: string | number): Money {
    const text = String(input).trim();
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) throw new ValidationError(`Monto inválido: "${text}".`, 'money_invalid');
    const [, sign, whole, fraction = ''] = match;
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Money.fromCents(sign ? -cents : cents);
  }

  static sum(values: Iterable<Money>): Money {
    let total = 0;
    for (const value of values) total += value.cents;
    return Money.fromCents(total);
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  /** Multiplica por una cantidad entera (unidades vendidas). */
  times(quantity: number): Money {
    if (!Number.isSafeInteger(quantity)) throw new ValidationError('La cantidad debe ser un entero.', 'money_quantity');
    return Money.fromCents(this.cents * quantity);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  compareTo(other: Money): -1 | 0 | 1 {
    return this.cents < other.cents ? -1 : this.cents > other.cents ? 1 : 0;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  /** "34.90" (sin símbolo; el formato de pantalla vive en la interfaz). */
  toDecimalString(): string {
    const abs = Math.abs(this.cents);
    return `${this.cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }
}
