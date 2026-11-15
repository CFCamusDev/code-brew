// La regla vive en el dominio del módulo shipping; se reexporta aquí para el checkout (navegador), que no debe
// importar el índice del módulo (arrastraría la base de datos).
export { isFreeShipping } from '../../server/modules/shipping/domain/shipping-zone';
