// Verificação pontual de listOrderPaymentCharges contra dados reais --
// script descartável, não faz parte da suíte de testes.
// Uso: npx tsx scripts/testar-payment-details.ts <slug> <orderId> <userId>

import { findActiveTenant } from "../src/lib/db/tenant";
import type { AuthUser } from "../src/contracts/auth";
import { listOrderPaymentCharges } from "../src/services/orders/orderPaymentLinkService";

async function main(): Promise<void> {
    const [slug, orderId, userId] = process.argv.slice(2);
    if (!slug || !orderId || !userId) {
        console.log("Uso: npx tsx scripts/testar-payment-details.ts <slug> <orderId> <userId>");
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
        const charges = await listOrderPaymentCharges(tenant, actor, orderId);
        console.log(JSON.stringify(charges, null, 2));
    } catch (error) {
        console.log("ERRO:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
