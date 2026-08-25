import { z } from 'zod';
import {
  CommercialGroupSchema,
  CommercialGroupWithMembersSchema,
  CommercialGroupMemberWithClientSchema,
  ErpRelatedPartySchema,
  type CommercialGroup,
  type CommercialGroupWithMembers,
  type CommercialGroupMemberWithClient,
  type AddCommercialGroupMemberInput,
  type ErpRelatedParty,
} from '@/domain/commercialGroups/types';
import { ClientLookupSourceSchema, type ClientLookupSource } from '@/domain/clients/types';
import { adminJson } from './http';

export type { CommercialGroup, CommercialGroupWithMembers, CommercialGroupMemberWithClient, ErpRelatedParty };

const AddCommercialGroupMemberResponseSchema = z.object({
  member: CommercialGroupMemberWithClientSchema,
  source: ClientLookupSourceSchema,
});
export type AddCommercialGroupMemberResponse = z.infer<typeof AddCommercialGroupMemberResponseSchema>;

function groupsPath({ q = '', includeInactive = false }: { q?: string; includeInactive?: boolean } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (includeInactive) params.set('includeInactive', '1');
  const qs = params.toString();
  return `/api/commercial-groups${qs ? `?${qs}` : ''}`;
}

export function fetchCommercialGroups(params?: { q?: string; includeInactive?: boolean }): Promise<CommercialGroup[]> {
  return adminJson(groupsPath(params), CommercialGroupSchema.array(), {}, 'Não foi possível carregar os grupos comerciais.');
}

export function fetchCommercialGroup(id: string): Promise<CommercialGroupWithMembers> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(id)}`, CommercialGroupWithMembersSchema, {}, 'Não foi possível carregar o grupo comercial.');
}

// Lookup em lote de memberships ativas por clientId — ver
// listCommercialGroupMembershipsByClientIds no backend. Usado tanto pelo
// talão (agrupar matriz/filiais em sessões abertas) quanto pela tela de
// detalhe da cliente (mostrar o grupo dela, se houver).
export function fetchCommercialGroupMembershipsByClientIds(clientIds: string[]): Promise<CommercialGroupMemberWithClient[]> {
  if (clientIds.length === 0) return Promise.resolve([]);
  const qs = clientIds.map(encodeURIComponent).join(',');
  return adminJson(`/api/commercial-groups/memberships?clientIds=${qs}`, CommercialGroupMemberWithClientSchema.array(), {}, 'Não foi possível carregar o grupo comercial.');
}

export function createCommercialGroup(name: string): Promise<CommercialGroup> {
  return adminJson('/api/commercial-groups', CommercialGroupSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, 'Não foi possível criar o grupo comercial.');
}

export function renameCommercialGroup(id: string, name: string): Promise<CommercialGroup> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(id)}`, CommercialGroupSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, 'Não foi possível atualizar o grupo comercial.');
}

export function setCommercialGroupActive(id: string, isActive: boolean): Promise<CommercialGroup> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(id)}/active`, CommercialGroupSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  }, 'Não foi possível atualizar o status do grupo comercial.');
}

const ErpRelatedPartiesAvailabilitySchema = z.object({ available: z.boolean() });

// Checagem leve (sem chamar o ERP) de se o tenant tem uma integração ativa
// capaz de listar coligados — ver hasErpRelatedPartiesCapability no backend.
// Usado pra decidir se a seção de coligados aparece na tela de detalhe da
// cliente; tenant sem TOTVS Moda configurado nunca chega a ver o botão.
export function fetchErpRelatedPartiesAvailable(): Promise<boolean> {
  return adminJson('/api/commercial-groups/erp-related-parties/available', ErpRelatedPartiesAvailabilitySchema, {}, 'Não foi possível verificar a integração com o ERP.')
    .then((result) => result.available);
}

// Coligados do TOTVS Moda pro documento desta cliente — ver
// listErpRelatedPartiesForClient no backend. Lista vazia tanto quando não
// há coligados quanto quando não há integração ativa (ou o provider não
// suporta esse lookup) — a tela decide como tratar ambos os casos.
export function fetchErpRelatedPartiesForClient(clientId: string): Promise<ErpRelatedParty[]> {
  return adminJson(`/api/commercial-groups/erp-related-parties?clientId=${encodeURIComponent(clientId)}`, ErpRelatedPartySchema.array(), {}, 'Não foi possível buscar coligados no ERP.');
}

export function addCommercialGroupMember(groupId: string, input: AddCommercialGroupMemberInput): Promise<AddCommercialGroupMemberResponse> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(groupId)}/members`, AddCommercialGroupMemberResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'Não foi possível adicionar a cliente ao grupo.');
}

export function removeCommercialGroupMember(groupId: string, memberId: string): Promise<void> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`, z.unknown(), {
    method: 'DELETE',
  }, 'Não foi possível remover a cliente do grupo.').then(() => undefined);
}

export function setPrimaryCommercialGroupMember(groupId: string, memberId: string): Promise<CommercialGroupMemberWithClient> {
  return adminJson(`/api/commercial-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}/primary`, CommercialGroupMemberWithClientSchema, {
    method: 'PUT',
  }, 'Não foi possível marcar a cliente como principal.');
}

export type { ClientLookupSource };
