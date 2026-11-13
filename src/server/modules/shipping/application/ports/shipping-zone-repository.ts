import type { ShippingZone } from '../../domain/shipping-zone';

export interface ShippingZoneRepository {
  /** Zonas activas, en el orden en que se muestran. */
  listActive(): Promise<ShippingZone[]>;
}
