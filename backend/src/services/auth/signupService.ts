import { CustomerSignupSchema } from "@/contracts/auth";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Client } from "@/lib/types";
import { findClientRowByDocumentDigits, insertClientRow } from "@/models/clientsModel";
import type { AuditRequestContext } from "@/services/audit";
import { notifySignup } from "@/services/notifications";
import { ConflictError, ValidationError } from "@/services/shared/errors";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { createUserRecord } from "@/services/users/userService";
import { issueSession } from "./authenticationService";

export async function signupCustomer(
  tenant: Tenant,
  body: unknown,
  context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string }> {
  const parsed = CustomerSignupSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("INCOMPLETE_SIGNUP", "Dados inválidos.", parsed.error.issues);
  const fields = parsed.data;
  const result = await withTenantTransaction(tenant, {}, async (client) => {
    const digits = fields.cpfCnpj;
    const storeSettings = await findStoreSettingsRow(client);
    // Ausência da chave preserva o comportamento histórico: CPF e CNPJ.
    if (storeSettings?.features?.allowCpfSignup === false && digits.length !== 14) {
      throw new ValidationError("CNPJ_REQUIRED");
    }
    if (await findClientRowByDocumentDigits(client, digits)) throw new ConflictError("DOCUMENT_TAKEN");
    const row = await insertClientRow(client, {
      name: fields.name, cpfCnpj: fields.cpfCnpj, email: fields.email, cep: fields.cep,
      street: fields.street, number: fields.number, complement: fields.complement,
      neighborhood: fields.neighborhood, city: fields.city, state: fields.state,
      companyResponsible: fields.companyResponsible, storeName: fields.storeName,
    });
    const registration: Client = {
      id: row.id, name: row.name, cpfCnpj: row.cpf_cnpj ?? undefined, email: row.email ?? undefined,
      cep: row.cep ?? undefined, street: row.street ?? undefined, number: row.number ?? undefined,
      complement: row.complement ?? undefined, neighborhood: row.neighborhood ?? undefined,
      city: row.city ?? undefined, state: row.state ?? undefined,
      companyResponsible: row.company_responsible ?? undefined, storeName: row.store_name ?? undefined,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
    const user = await createUserRecord(client, null, context, {
      email: fields.email, password: fields.password, name: fields.name,
      role: "cliente", clientId: registration.id,
    });
    return { user };
  });
  notifySignup(tenant, result.user);
  return { user: result.user, token: await issueSession(tenant, result.user, context) };
}
