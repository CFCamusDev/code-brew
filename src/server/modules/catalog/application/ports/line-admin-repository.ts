import type { LineStatus } from '../../domain/catalog';

export interface LineData {
  name: string;
  slug: string;
  description: string | null;
  template: string;
  theme: Record<string, string>;
  sortOrder: number;
}
export interface AdminLine extends LineData { id: number; status: LineStatus }
export interface LineAdminRepository {
  list(): Promise<AdminLine[]>;
  create(data: LineData): Promise<AdminLine>;
  update(id: number, data: LineData): Promise<AdminLine | null>;
}
