// Reparo pontual: (1) cancela cobranças que ficaram "vivas" (pending/
// processing/authorized) em pedidos que já estão payment_status='paid' --
// dados de antes de paymentChargeService.ts::cancelSiblingLiveOrderCharges
// existir; (2) avança orders.status até 'pago' em pedidos que já estão
// payment_status='paid' mas ficaram presos num status anterior -- dados de
// antes de updateOrderPaymentStatusRow avançar status em confirmações
// reais. Script descartável, não faz parte da suíte de testes.
// Uso: npx tsx scripts/testar-reparar-cobrancas-orfas.ts <slug> <userId>

import { findActiveTenant, withTenantTransaction } from "../src/lib/db/tenant";
import type { AuthUser } from "../src/contracts/auth";
import { cancelOrphanLiveChargesForPaidOrders } from "../src/services/payments/paymentChargeService";
import { advanceAlreadyPaidOrderStatusRows } from "../src/models/ordersModel";

async function main(): Promise<void> {
    const [slug, userId] = process.argv.slice(2);
    if (!slug || !userId) {
        console.log("Uso: npx tsx scripts/testar-reparar-cobrancas-orfas.ts <slug> <userId>");
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
        const { cancelled, advanced } = await withTenantTransaction(tenant, actor, async (client) => ({
            cancelled: await cancelOrphanLiveChargesForPaidOrders(client),
            advanced: await advanceAlreadyPaidOrderStatusRows(client),
        }));
        console.log(`Cobranças órfãs canceladas: ${cancelled}`);
        console.log(`Pedidos avançados até 'pago': ${advanced.length}${advanced.length ? ` (${advanced.map((o) => `#${o.order_number}`).join(", ")})` : ""}`);
    } catch (error) {
        console.log("ERRO:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
