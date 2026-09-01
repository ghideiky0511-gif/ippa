import { NextRequest, NextResponse } from "next/server";
import { processStripeWebhook } from "@/services/payments/stripeWebhookService";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Endpoint global de webhook Connect da Stripe -- SEM tenant na URL (a
// Stripe manda tudo pra um único endpoint por conta de plataforma,
// `event.account` identifica a connected account). Por isso mora em
// api/webhooks/, não em api/internal/ (que é pra chamadas nossas-pra-nós-
// mesmos com secret estático) nem em api/[tenantSlug]/ (não há tenant
// resolvido neste ponto -- ver stripeWebhookService.ts).
export async function POST(request: NextRequest): Promise<Response> {
    // request.text(), nunca request.json() -- stripe.webhooks.constructEvent
    // precisa dos bytes crus pra verificar a assinatura (HMAC sobre o corpo
    // exato recebido, não sobre um JSON reserializado).
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    try {
        const result = await processStripeWebhook(rawBody, signature);
        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        logger.error("stripe-webhook-route", "Erro inesperado no webhook Stripe", errorMeta(error));
        // 200 mesmo em erro inesperado -- Stripe re-entregar não resolve um
        // bug nosso, e o evento já foi logado com processing_error dentro
        // de processStripeWebhook antes de qualquer exceção não tratada
        // escapar até aqui.
        return NextResponse.json({ received: true }, { status: 200 });
    }
}
