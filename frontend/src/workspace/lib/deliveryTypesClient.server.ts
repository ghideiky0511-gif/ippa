import { DeliveryTypeSchema, type DeliveryType } from '@/domain/orders/types';
import { adminJsonServer } from './httpServer';

export function fetchDeliveryTypes(): Promise<DeliveryType[]> {
  return adminJsonServer(
    '/api/admin/delivery-types',
    DeliveryTypeSchema.array(),
    {},
    'Não foi possível carregar os tipos de entrega.',
  );
}
