/** Motivos de devolución que acepta la pasarela y que registra el panel. */
export const REFUND_REASONS = ['solicitud_comprador', 'duplicado', 'fraudulento'] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];
