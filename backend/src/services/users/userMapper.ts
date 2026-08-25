import type { AuthUser } from "@/lib/types";
import type { UserRow } from "@/models/usersModel";
import { avatarUrlForKey } from "./avatarMediaService";

/** Traduz a linha privada (com hash/chave interna) para a identidade pública. */
export async function toAuthUser(row: UserRow): Promise<AuthUser> {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatar_key ? await avatarUrlForKey(row.avatar_key) : undefined,
    clientId: row.client_id ?? undefined,
    permissions: row.permissions,
  };
}
