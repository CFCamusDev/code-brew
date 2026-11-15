/** Error de regla de negocio. `code` es estable para que las capas externas lo traduzcan (HTTP, mensajes). */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Dato inválido según el dominio (no confundir con validación de formato de entrada, que hace zod). */
export class ValidationError extends DomainError {
  constructor(message: string, code = 'validation') {
    super(code, message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, code = 'not_found') {
    super(code, message);
  }
}

/** La operación choca con el estado actual (pedido ya pagado, reserva vencida, stock insuficiente…). */
export class ConflictError extends DomainError {
  constructor(message: string, code = 'conflict') {
    super(code, message);
  }
}

export type Result<T, E extends DomainError = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E extends DomainError>(error: E): Result<never, E> => ({ ok: false, error });

/** Devuelve el valor o lanza el error: para casos de uso que prefieren excepciones. */
export function unwrap<T, E extends DomainError>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}
