export type ComplaintType = 'reclamo' | 'queja';

/** Datos de un reclamo o queja ya validados (el formulario público los valida con zod). */
export interface ComplaintInput {
  type: ComplaintType;
  consumerName: string;
  consumerDocument?: string;
  consumerEmail: string;
  consumerPhone?: string;
  consumerAddress: string;
  isMinor: boolean;
  guardianName?: string;
  guardianDocument?: string;
  productOrService: string;
  /** Monto en soles, opcional. */
  amount?: number;
  detail: string;
  consumerRequest: string;
}

/** Reclamo registrado, con su número correlativo por año (2026-0001 = `year` + `sequence`). */
export interface ComplaintRecord {
  id: number;
  year: number;
  sequence: number;
  type: ComplaintType;
  consumerName: string;
  consumerEmail: string;
  productOrService: string;
  detail: string;
  consumerRequest: string;
}

/** Año calendario en hora de Lima: la numeración correlativa se reinicia el 1 de enero de allá. */
export function limaYear(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(date));
}

/** Monto en soles a céntimos (redondeado), o null si no se indicó. */
export function amountToCents(amount: number | undefined): number | null {
  return amount === undefined ? null : Math.round(amount * 100);
}
