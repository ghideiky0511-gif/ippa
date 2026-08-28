import { DeliveryTypeSchema, type DeliveryType, type UpdateDeliveryTypeInput } from '@/domain/orders/types';
import { adminJson } from './http';

export function fetchDeliveryTypes(): Promise<DeliveryType[]> {
  return adminJson(
    '/api/admin/delivery-types',
    DeliveryTypeSchema.array(),
    {},
    'Não foi possível carregar os tipos de entrega.',
  );
}

export function updateDeliveryType(id: string, value: UpdateDeliveryTypeInput): Promise<DeliveryType> {
  return adminJson(`/api/admin/delivery-types/${id}`, DeliveryTypeSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  }, 'Não foi possível salvar o tipo de entrega.');
}
