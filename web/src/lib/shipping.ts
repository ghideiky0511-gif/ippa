// Mock de frete — sem integração real com transportadora ainda. O CEP hoje
// não influencia o resultado; a função já existe separada pra quando entrar
// uma cotação de verdade (Correios/transportadora), sem precisar mexer na
// página de frete.

import type { ShippingOption } from './types';

export const MOCK_SHIPPING_OPTIONS: ShippingOption[] = [
  { id: 'retirada', label: 'Retirada no showroom', price: 0, prazo: 'Combinar retirada' },
  { id: 'padrao', label: 'Entrega padrão', price: 19.9, prazo: '5 a 8 dias úteis' },
  { id: 'expressa', label: 'Entrega expressa', price: 39.9, prazo: '2 a 3 dias úteis' },
];

export function calculateShipping(cep: string): ShippingOption[] {
  return MOCK_SHIPPING_OPTIONS;
}
