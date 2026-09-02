// Verifica a cadeia completa de orderPaymentLinkService.ts sem passar pelo
// navegador (sem Stripe Elements): gera o token, resolve o resumo e cobra
// com um PaymentMethod de teste pronto da Stripe (mesmo cardToken que
// Elements produziria no cliente).
// Uso: npx tsx scripts/testar-link-pagamento.ts <slug> <orderId> <userId> [cardToken]

import { findActiveTenant } from "../src/lib/db/tenant";
import type { AuthUser } from "../src/contracts/auth";
import {
    chargeOrderPayment,
    createOrderPaymentLink,
    findOrderPaymentSummary,
} from "../src/services/orders/orderPaymentLinkService";

async function main(): Promise<void> {
    const [slug, orderId, userId, cardToken = "pm_card_visa"] = process.argv.slice(2);
    if (!slug || !orderId || !userId) {
        console.log("Uso: npx tsx scripts/testar-link-pagamento.ts <slug> <orderId> <userId> [cardToken]");
        process.exit(1);
    }
    const tenant = await findActiveTenant(slug);
    if (!tenant) {
        console.log(`ERRO: tenant "${slug}" não encontrado ou inativo.`);
        process.exit(1);
    }
    const actor: AuthUser = {
        id: userId,
        email: "teste@example.com",
        name: "Teste",
        role: "administrador",
        permissions: { adminAccess: true },
    };
    try {
        const { token } = await createOrderPaymentLink(tenant, actor, orderId);
        console.log("Token gerado:", token);

        const summary = await findOrderPaymentSummary(tenant, token);
        console.log("Resumo:", JSON.stringify(summary, null, 2));

        const result = await chargeOrderPayment(tenant, token, { method: "cartao", cardToken });
        console.log("Resultado da cobrança:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.log("ERRO:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
