export interface SettingStore {
  /** Valor guardado de la clave, o null si no existe. Puede lanzar si la base no responde. */
  find(key: string): Promise<{ value: unknown } | null>;
}
