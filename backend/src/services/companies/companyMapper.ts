import type { Company } from "@/lib/types";
import type { CompanyRow } from "@/models/companiesModel";

export function toCompany(row: CompanyRow): Company {
    return {
        id: row.id,
        cnpj: row.cnpj,
        razaoSocial: row.razao_social,
        nomeFantasia: row.nome_fantasia ?? undefined,
        inscricaoEstadual: row.inscricao_estadual ?? undefined,
        isMatriz: row.is_matriz,
        cep: row.cep ?? undefined,
        street: row.street ?? undefined,
        number: row.number ?? undefined,
        complement: row.complement ?? undefined,
        neighborhood: row.neighborhood ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        active: row.active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}
