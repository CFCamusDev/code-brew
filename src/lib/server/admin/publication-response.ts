import { ISSUE_MESSAGES, PublicationError } from '../../../server/modules/catalog';
import { DomainError, NotFoundError } from '../../../server/shared/errors';

export function publicationErrorResponse(error: unknown): Response | null {
  if (error instanceof PublicationError) return Response.json({
    error: 'No se puede publicar el producto. Completa estos requisitos:',
    issues: error.issues.map(code => ({ code, message: ISSUE_MESSAGES[code] }))
  }, { status: 409 });
  if (error instanceof DomainError) return Response.json({ error: error.message }, { status: error instanceof NotFoundError ? 404 : 409 });
  return null;
}
