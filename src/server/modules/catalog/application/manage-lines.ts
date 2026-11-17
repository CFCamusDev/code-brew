import { NotFoundError } from '../../../shared/errors';
import type { LineAdminRepository, LineData } from './ports/line-admin-repository';

export const createLine = (repository: LineAdminRepository, data: LineData) => repository.create(data);
export async function editLine(repository: LineAdminRepository, id: number, data: LineData) {
  const line = await repository.update(id, data);
  if (!line) throw new NotFoundError('Línea no encontrada.');
  return line;
}
