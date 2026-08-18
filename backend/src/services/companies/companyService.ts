import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Company } from "@/lib/types";
import {
    findCompanyRow,
    findCompanyRowByCnpj,
    insertCompanyRow,
    listCompanyRows,
    updateCompanyRow,
} from "@/models/companiesModel";
import { recordAuditEvent, COMPANY_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError } from "@/services/shared/errors";
import { toCompany } from "./companyMapper";

const AUDITED_COMPANY_FIELDS = [
    "razaoSocial", "nomeFantasia", "inscricaoEstadual", "isMatriz",
    "cep", "street", "number", "complement", "neighborhood", "city", "state", "active",
] as const;

// Filial é dado estrutural/fiscal do tenant, não operação de venda do dia a
// dia — só administrador mexe.
function canManageCompanies(user: AuthUser): boolean {
    return user.role === "administrador";
}

export async function listTenantCompanies(tenant: Tenant, user: AuthUser): Promise<Company[]> {
    if (!canManageCompanies(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await listCompanyRows(client)).map(toCompany),
    );
}

export async function getTenantCompany(tenant: Tenant, user: AuthUser, id: string): Promise<Company | null> {
    if (!canManageCompanies(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findCompanyRow(client, id);
        return row ? toCompany(row) : null;
    });
}

export async function createTenantCompany(
    tenant: Tenant,
    user: AuthUser,
    value: Pick<Company, "cnpj" | "razaoSocial"> & Partial<Company>,
    context: AuditRequestContext,
): Promise<Company> {
    if (!canManageCompanies(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        if (await findCompanyRowByCnpj(client, value.cnpj)) {
            throw new ConflictError("CNPJ_TAKEN");
        }
        const created = toCompany(await insertCompanyRow(client, {
            cnpj: value.cnpj,
            razaoSocial: value.razaoSocial,
            nomeFantasia: value.nomeFantasia,
            inscricaoEstadual: value.inscricaoEstadual,
            isMatriz: value.isMatriz,
            cep: value.cep,
            street: value.street,
            number: value.number,
            complement: value.complement,
            neighborhood: value.neighborhood,
            city: value.city,
            state: value.state,
            active: value.active,
        }));
        await recordAuditEvent(client, {
            action: COMPANY_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
        });
        return created;
    });
}

export async function updateTenantCompany(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    value: Partial<Company>,
    context: AuditRequestContext,
): Promise<Company | null> {
    if (!canManageCompanies(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await updateCompanyRow(client, id, value);
        if (!row) return null;
        const changedFields = AUDITED_COMPANY_FIELDS.filter((field) => Object.hasOwn(value, field));
        await recordAuditEvent(client, {
            action: COMPANY_AUDIT_ACTIONS.UPDATED,
            entityId: id,
            actor: user,
            context,
            metadata: { changedFields },
        });
        return toCompany(row);
    });
}
