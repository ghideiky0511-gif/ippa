import type { Client } from "@/lib/types";
import type { ClientRow } from "@/models/clientsModel";

export function toClient(row: ClientRow): Client {
    return {
        id: row.id,
        name: row.name,
        cpfCnpj: row.cpf_cnpj ?? undefined,
        email: row.email ?? undefined,
        cep: row.cep ?? undefined,
        street: row.street ?? undefined,
        number: row.number ?? undefined,
        complement: row.complement ?? undefined,
        neighborhood: row.neighborhood ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        companyResponsible: row.company_responsible ?? undefined,
        storeName: row.store_name ?? undefined,
        lastSellerId: row.last_seller_id ?? undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}
