// Valida o motor de cobrança (createOrderCharge) isoladamente, sem passar
// pela UI de checkout — que ainda não chama esta função (ver
// pagamento/page.tsx, métodos de pagamento hoje são placeholder "em breve").
// Usa um PaymentMethod de teste pronto da Stripe (ex.: pm_card_visa), que
// dispensa Stripe.js/Elements no navegador — só funciona em modo teste.
//
// Uso: cd backend && npx tsx scripts/testar-stripe-charge.ts <slug> <orderId> <userId> [cardToken]
// (roda contra o Postgres local exposto pelo docker-compose em 127.0.0.1:5433
// — exporte DATABASE_URL, STRIPE_SECRET_KEY e PAYMENT_CREDENTIALS_ENCRYPTION_KEY
// do seu .env antes, ou rode dentro do container:
//   docker compose exec backend npx tsx scripts/testar-stripe-charge.ts <slug> <orderId> <userId>)
//
// Tokens de teste úteis (https://docs.stripe.com/testing#cards):
//   pm_card_visa                                  -> autoriza com sucesso
//   pm_card_visa_chargeDeclined                   -> recusado (generic_decline)
//   pm_card_visa_chargeDeclinedInsufficientFunds  -> recusado (saldo insuficiente)

import { findActiveTenant } from "../src/lib/db/tenant";
import { createOrderCharge } from "../src/services/payments/paymentChargeService";

async function main(): Promise<void> {
    const [slug, orderId, userId, cardToken = "pm_card_visa"] = process.argv.slice(2);
    if (!slug || !orderId || !userId) {
        console.log("Uso: npx tsx scripts/testar-stripe-charge.ts <slug> <orderId> <userId> [cardToken]");
        process.exit(1);
    }

    const tenant = await findActiveTenant(slug);
    if (!tenant) {
        console.log(`ERRO: tenant "${slug}" não encontrado ou inativo.`);
        process.exit(1);
    }

    console.log(`Cobrando pedido ${orderId} do tenant ${tenant.name} (${tenant.id}) com ${cardToken}...`);
    try {
        const result = await createOrderCharge(tenant, { userId, role: "administrador" }, orderId, {
            method: "cartao",
            cardToken,
            customer: { name: "Cliente Teste", document: "00000000000", email: "teste@example.com" },
        });
        console.log("\nOK — resposta da Stripe:");
        console.log(JSON.stringify(result, null, 2));
        console.log(
            "\nConfira o terminal do `stripe listen` para o payment_intent.succeeded/payment_failed chegando," +
                " e a tabela orders (payment_status) / payment_charges no Postgres.",
        );
    } catch (error) {
        console.log("\nERRO ao cobrar:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
