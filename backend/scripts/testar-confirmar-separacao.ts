// Confirma a separação física de um pedido sem passar pela tela do
// workspace -- útil pra desbloquear createOrderCharge em dev/teste, já que
// nenhuma integração de fulfillment escreve qty_separated automaticamente
// (ver orderService.confirmOrderItemsSeparation).
// Uso: npx tsx scripts/testar-confirmar-separacao.ts <slug> <orderId> <userId>

import { randomUUID } from "node:crypto";
import { findActiveTenant } from "../src/lib/db/tenant";
import type { AuthUser } from "../src/contracts/auth";
import { confirmOrderItemsSeparation } from "../src/services/orders/orderService";

async function main(): Promise<void> {
    const [slug, orderId, userId] = process.argv.slice(2);
    if (!slug || !orderId || !userId) {
        console.log("Uso: npx tsx scripts/testar-confirmar-separacao.ts <slug> <orderId> <userId>");
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
        const order = await confirmOrderItemsSeparation(tenant, actor, orderId, { requestId: randomUUID() });
        console.log("OK:", JSON.stringify({ id: order.id, status: order.status }, null, 2));
    } catch (error) {
        console.log("ERRO:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
