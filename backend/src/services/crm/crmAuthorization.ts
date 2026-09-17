import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/types";
import { listUserRowsByIds } from "@/models/usersModel";
import {
    findWhatsAppConnectionBySeller,
    listWhatsAppConnectionsByTenant,
} from "@/models/whatsappConnectionsModel";
import { hasActiveWhatsAppConnection } from "@/services/whatsapp/whatsappNotificationService";
import { isAdministrator } from "@/services/users/userService";
import { ForbiddenError } from "@/services/shared/errors";

// Autorização própria do CRM -- deliberadamente MAIS FRACA que
// requireSettingsAdministrator (settingsAuthorization.ts), que hoje exige
// admin até para listar conexões de WhatsApp. Aqui uma vendedora pode ver e
// atender a própria carteira; só quem é bloqueado de vez é `role ===
// 'cliente'` (e, implicitamente, papéis operacionais como
// expedicao/entregador, que resolveVisibleInboxes devolve como lista
// vazia em vez de barrar o acesso à tela).
export function requireCrmAccess(user: AuthUser): void {
    if (user.role === "cliente") throw new ForbiddenError();
}

export interface CrmInboxScope {
    phoneId: string;
    sellerId: string;
    sellerName: string;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
}

// Único ponto que decide "quais phone_id este usuário pode ver" -- toda
// operação de conversa (listar, abrir, enviar) valida contra o conjunto
// devolvido aqui, nunca contra um phoneId/sellerId vindo do corpo da
// requisição. Mesmo filtro hasActiveWhatsAppConnection nas duas ramas
// (admin e vendedora): uma conexão sem phone_id ainda (onboarding iniciado,
// não concluído) não deve aparecer como inbox utilizável em nenhum dos
// dois casos.
export async function resolveVisibleInboxes(
    client: PoolClient,
    user: AuthUser,
): Promise<CrmInboxScope[]> {
    if (isAdministrator(user)) {
        const rows = (await listWhatsAppConnectionsByTenant(client)).filter(
            hasActiveWhatsAppConnection,
        );
        if (rows.length === 0) return [];
        const sellers = await listUserRowsByIds(
            client,
            rows.map((row) => row.seller_id),
        );
        const nameBySellerId = new Map(sellers.map((seller) => [seller.id, seller.name]));
        return rows.map((row) => ({
            phoneId: row.phone_id as string,
            sellerId: row.seller_id,
            sellerName: nameBySellerId.get(row.seller_id) ?? "Vendedora",
            displayPhoneMasked: row.display_phone_masked,
            verifiedName: row.verified_name,
        }));
    }

    if (user.role === "vendedora") {
        const row = await findWhatsAppConnectionBySeller(client, user.id);
        if (!hasActiveWhatsAppConnection(row)) return [];
        return [
            {
                phoneId: row.phone_id as string,
                sellerId: user.id,
                sellerName: user.name,
                displayPhoneMasked: row.display_phone_masked,
                verifiedName: row.verified_name,
            },
        ];
    }

    // expedição, entregador etc.: sem carteira de WhatsApp própria -- a
    // tela carrega normalmente com estado vazio, não é um 403.
    return [];
}
