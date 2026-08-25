import { z } from 'zod';
import type { AdminUser } from '@/domain/clients/types';
import { adminJsonServer } from './httpServer';

// Auth/Usuários é um domínio próprio, sem contrato/schema compartilhado
// ainda (fora do escopo da validação Zod na fronteira da API) — z.unknown()
// aqui só preserva o comportamento de hoje (sem validar a resposta) pra
// continuar compilando com a nova assinatura de adminJsonServer.
export function fetchUsers(): Promise<AdminUser[]> {
  return adminJsonServer('/api/admin/users', z.unknown(), {}, 'Não foi possível carregar os usuários.') as Promise<AdminUser[]>;
}
