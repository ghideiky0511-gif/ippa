import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CommercialGroupMemberWithClient, ErpRelatedParty } from "@/lib/types";
import type { ClientLookupSource } from "@/contracts/clients";
import { AddCommercialGroupMemberInputSchema } from "@/contracts/commercialGroups";
import { findClientRow } from "@/models/clientsModel";
import { findCommercialGroupRow } from "@/models/commercialGroupsModel";
import {
    clearPrimaryCommercialGroupMemberRow,
    findActiveCommercialGroupMembershipByClientRow,
    findCommercialGroupMemberRow,
    insertCommercialGroupMemberRow,
    listActiveCommercialGroupMembershipsByClientIdsRow,
    listCommercialGroupMemberRows,
    reactivateCommercialGroupMemberRow,
    deactivateCommercialGroupMemberRow,
    setCommercialGroupMemberPrimaryRow,
} from "@/models/commercialGroupMembersModel";
import { findActiveErpIntegrationRow } from "@/models/erpIntegrationsModel";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { createErpProviderForIntegration } from "@/services/erp/erpProviderFactory";
import { findOrImportTenantClientByDocument } from "@/services/clients/clientService";
import { recordAuditEvent, COMMERCIAL_GROUP_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toCommercialGroupMemberWithClient } from "./commercialGroupMapper";
import { canManageCommercialGroups } from "./commercialGroupService";

export async function listCommercialGroupMembers(tenant: Tenant, user: AuthUser, groupId: string): Promise<CommercialGroupMemberWithClient[]> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const rows = await listCommercialGroupMemberRows(client, groupId, false);
        const members: CommercialGroupMemberWithClient[] = [];
        for (const row of rows) {
            const clientRow = await findClientRow(client, row.client_id);
            if (clientRow) members.push(toCommercialGroupMemberWithClient(row, clientRow));
        }
        return members;
    });
}

// Lookup em lote (ver listActiveCommercialGroupMembershipsByClientIdsRow) —
// consumido pelo talão pra saber, de quem tem sessão aberta agora, quem
// pertence a que grupo comercial e quem é o membro principal (o "master" da
// composição matriz/filiais que antes vinha de clients.parent_client_id).
export async function listCommercialGroupMembershipsByClientIds(tenant: Tenant, user: AuthUser, clientIds: string[]): Promise<CommercialGroupMemberWithClient[]> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    if (clientIds.length === 0) return [];
    return withTenantTransaction(tenant, user, async (client) => {
        const rows = await listActiveCommercialGroupMembershipsByClientIdsRow(client, clientIds);
        const members: CommercialGroupMemberWithClient[] = [];
        for (const row of rows) {
            const clientRow = await findClientRow(client, row.client_id);
            if (clientRow) members.push(toCommercialGroupMemberWithClient(row, clientRow));
        }
        return members;
    });
}

// Checagem leve (sem chamar o ERP, só olha a integração ativa no banco) pra
// decidir se a tela de detalhe da cliente deve sequer oferecer a seção de
// coligados — evita mostrar o botão "Buscar coligados" pra tenants sem
// TOTVS Moda configurado. Deliberadamente não checa clientId nenhum: é uma
// pergunta sobre o tenant ("tem um provider com esse lookup ativo?"), não
// sobre uma cliente específica.
export async function hasErpRelatedPartiesCapability(tenant: Tenant, user: AuthUser): Promise<boolean> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) return false;
        const provider = createErpProviderForIntegration(
            tenant, user, integration,
            createExternalApiCallReporter(tenant, user, integration.provider),
        );
        return Boolean(provider.lookupRelatedPartiesByDocument);
    });
}

// Coligados do TOTVS Moda (ver erp/types.ts:lookupRelatedPartiesByDocument)
// pro documento de um client já cadastrado — usado pela tela de grupo
// comercial pra sugerir quem já é "coligado" no ERP antes de o usuário
// escolher quem entra no grupo. Não anexa nada sozinho: cada relacionado
// escolhido ainda passa por addCommercialGroupMember({document}), que já
// trata registro local/import via ERP e dedupe.
//
// Ausência de integração ativa, provider sem esse lookup (só o TOTVS Moda
// implementa hoje) ou client sem documento cadastrado não são erros — são
// simplesmente "sem coligados disponíveis pra mostrar", o mesmo espírito de
// findOrImportTenantClientByDocument tratando "não encontrado" como
// resultado válido. Uma falha real da chamada ao ERP (auth, rede, resposta
// malformada) continua propagando, já que aí a tela pediu explicitamente e
// merece ver o erro.
export async function listErpRelatedPartiesForClient(tenant: Tenant, user: AuthUser, clientId: string): Promise<ErpRelatedParty[]> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const clientRow = await findClientRow(client, clientId);
        if (!clientRow) throw new NotFoundError("CLIENT_NOT_FOUND");
        if (!clientRow.cpf_cnpj) return [];

        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) return [];

        const provider = createErpProviderForIntegration(
            tenant, user, integration,
            createExternalApiCallReporter(tenant, user, integration.provider),
        );
        if (!provider.lookupRelatedPartiesByDocument) return [];

        return provider.lookupRelatedPartiesByDocument(clientRow.cpf_cnpj);
    });
}

// Ponto de entrada único pra anexar um membro: aceita um clientId já
// escolhido (busca prévia no front) OU um document, que dispara o mesmo
// fluxo local-then-ERP de findOrImportTenantClientByDocument — sem duplicar
// a chamada ao provedor de ERP aqui.
export async function addCommercialGroupMember(
    tenant: Tenant,
    user: AuthUser,
    groupId: string,
    value: unknown,
    context: AuditRequestContext,
): Promise<{ member: CommercialGroupMemberWithClient; source: ClientLookupSource }> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    const parsed = AddCommercialGroupMemberInputSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);

    let clientId: string;
    let source: ClientLookupSource;
    if (parsed.data.document) {
        // findOrImportTenantClientByDocument abre e comita sua própria
        // transação (pode importar e commitar um client novo via ERP) — não
        // dá pra aninhar dentro da transação do vínculo abaixo, por isso o
        // fluxo por documento é necessariamente em duas etapas sequenciais.
        const lookup = await findOrImportTenantClientByDocument(tenant, user, parsed.data.document, context);
        if (!lookup.client) throw new NotFoundError("CLIENT_NOT_FOUND_FOR_DOCUMENT");
        clientId = lookup.client.id;
        source = lookup.source;
    } else {
        clientId = parsed.data.clientId!;
        source = "local";
    }

    const isPrimary = parsed.data.isPrimary ?? false;
    const member = await withTenantTransaction(tenant, user, async (client) => {
        const group = await findCommercialGroupRow(client, groupId);
        if (!group) throw new NotFoundError("COMMERCIAL_GROUP_NOT_FOUND");
        if (!group.is_active) throw new ValidationError("COMMERCIAL_GROUP_INACTIVE");

        const clientRow = await findClientRow(client, clientId);
        if (!clientRow) throw new NotFoundError("CLIENT_NOT_FOUND");

        const existing = await findCommercialGroupMemberRow(client, groupId, clientId);
        if (existing?.is_active) throw new ConflictError("CLIENT_ALREADY_GROUP_MEMBER");

        // Um client só pode estar ativo em um grupo por vez (índice único
        // parcial na migration) — se já existe um vínculo ativo aqui, dado
        // que a checagem acima já descartou o vínculo deste próprio grupo,
        // só pode ser de outro grupo.
        const activeElsewhere = await findActiveCommercialGroupMembershipByClientRow(client, clientId);
        if (activeElsewhere) throw new ConflictError("CLIENT_ALREADY_IN_ANOTHER_GROUP");

        // Limpar o principal antigo antes de marcar o novo — nunca a ordem
        // inversa, pra nunca violar o índice único parcial de "um principal
        // ativo por grupo" no meio da transação.
        if (isPrimary) await clearPrimaryCommercialGroupMemberRow(client, groupId);

        const row = existing
            ? await reactivateCommercialGroupMemberRow(client, existing.id, isPrimary)
            : await insertCommercialGroupMemberRow(client, { groupId, clientId, isPrimary });
        if (!row) throw new NotFoundError("COMMERCIAL_GROUP_MEMBER_NOT_FOUND");

        await recordAuditEvent(client, {
            action: COMMERCIAL_GROUP_AUDIT_ACTIONS.MEMBER_ADDED,
            entityId: groupId,
            actor: user,
            context,
            metadata: { clientId, isPrimary, source },
        });
        return toCommercialGroupMemberWithClient(row, clientRow);
    });

    return { member, source };
}

// Sem auto-promoção de um novo principal — o grupo fica sem principal até
// alguém marcar outro manualmente (ver decisões em aberto no plano).
export async function removeCommercialGroupMember(
    tenant: Tenant,
    user: AuthUser,
    groupId: string,
    memberId: string,
    context: AuditRequestContext,
): Promise<void> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    await withTenantTransaction(tenant, user, async (client) => {
        const row = await deactivateCommercialGroupMemberRow(client, memberId);
        // group_id conferido depois do UPDATE de propósito: um memberId de
        // outro grupo faz o service lançar NotFoundError, o que reverte a
        // transação inteira (ver withTenantTransaction) — a desativação
        // indevida nunca chega a ser commitada.
        if (!row || row.group_id !== groupId) throw new NotFoundError("COMMERCIAL_GROUP_MEMBER_NOT_FOUND");
        await recordAuditEvent(client, {
            action: COMMERCIAL_GROUP_AUDIT_ACTIONS.MEMBER_REMOVED,
            entityId: groupId,
            actor: user,
            context,
            metadata: { clientId: row.client_id },
        });
    });
}

export async function setPrimaryCommercialGroupMember(
    tenant: Tenant,
    user: AuthUser,
    groupId: string,
    memberId: string,
    context: AuditRequestContext,
): Promise<CommercialGroupMemberWithClient> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        await clearPrimaryCommercialGroupMemberRow(client, groupId);
        const row = await setCommercialGroupMemberPrimaryRow(client, memberId, true);
        if (!row || row.group_id !== groupId || !row.is_active) throw new NotFoundError("COMMERCIAL_GROUP_MEMBER_NOT_FOUND");
        const clientRow = await findClientRow(client, row.client_id);
        if (!clientRow) throw new NotFoundError("CLIENT_NOT_FOUND");
        await recordAuditEvent(client, {
            action: COMMERCIAL_GROUP_AUDIT_ACTIONS.PRIMARY_MEMBER_CHANGED,
            entityId: groupId,
            actor: user,
            context,
            metadata: { clientId: row.client_id },
        });
        return toCommercialGroupMemberWithClient(row, clientRow);
    });
}
