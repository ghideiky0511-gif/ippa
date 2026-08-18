// Separado de clients.ts de propósito: aquele arquivo importa
// node:fs/promises (só roda em rota de API/servidor); este aqui é puro e
// precisa ser importável por componente client também (ver
// useTalaoClientGate.ts) — juntos no mesmo arquivo, o bundler do client
// tenta empacotar o node:fs/promises e quebra a build.

import type { Client } from './types';

// "Completo" = o mínimo pra fechar um pedido de verdade (fluxo de frete) —
// combinado com o usuário: CPF/CNPJ, nome, email e CEP. Uma sessão pode
// existir e ter itens adicionados sem isso (a vendedora monta o carrinho
// livre), só não pode avançar pro frete sem completar.
export function isClientComplete(client: Pick<Client, 'name' | 'cpfCnpj' | 'email' | 'cep'>): boolean {
  return Boolean(client.name?.trim() && client.cpfCnpj?.trim() && client.email?.trim() && client.cep?.trim());
}
