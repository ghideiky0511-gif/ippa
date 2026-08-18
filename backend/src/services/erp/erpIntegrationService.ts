import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { listSupportedErpProviders } from "@/erp/registry";
import { findActiveErpIntegrationRow, upsertActiveErpIntegrationRow } from "@/models/erpIntegrationsModel";
import { recordAuditEvent, ERP_INTEGRATION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError } from "@/services/shared/errors";

// Config de ERP é sensível (endereça credenciais) — nunca devolvida para
// fora com o segredo junto, só o suficiente pra UI mostrar "qual provider
// está ativo".
export interface TenantErpIntegrationSummary {
    provider: string;
    active: boolean;
    updatedAt: string;
}

function canManageErpIntegration(user: AuthUser): boolean {
    return user.role === "administrador";
}

export async function getTenantErpIntegration(tenant: Tenant, user: AuthUser): Promise<TenantErpIntegrationSummary | null> {
    if (!canManageErpIntegration(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findActiveErpIntegrationRow(client);
        if (!row) return null;
        return { provider: row.provider, active: row.active, updatedAt: row.updated_at.toISOString() };
    });
}

export async function setTenantErpIntegration(
    tenant: Tenant,
    user: AuthUser,
    value: { provider: string; credentials: Record<string, unknown> },
    context: AuditRequestContext,
): Promise<TenantErpIntegrationSummary> {
    if (!canManageErpIntegration(user)) throw new ForbiddenError();
    if (!listSupportedErpProviders().includes(value.provider)) {
        throw new Error(`Unknown ERP provider: ${value.provider}`);
    }
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await upsertActiveErpIntegrationRow(client, value);
        await recordAuditEvent(client, {
            action: ERP_INTEGRATION_AUDIT_ACTIONS.CONFIGURED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { provider: row.provider },
        });
        return { provider: row.provider, active: row.active, updatedAt: row.updated_at.toISOString() };
    });
}
