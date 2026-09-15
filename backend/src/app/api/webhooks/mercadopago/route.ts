import { NextRequest, NextResponse } from "next/server";
import { processMercadoPagoWebhook } from "@/services/payments/mercadoPagoWebhookService";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Endpoint global de webhook Mercado Pago -- SEM tenant na URL, mesmo
// raciocínio de api/webhooks/stripe/route.ts (o Mercado Pago manda tudo
// pra um único endpoint por app da plataforma; o tenant é resolvido dentro
// do service via payment_charges, ver mercadoPagoWebhookService.ts).
export async function POST(request: NextRequest): Promise<Response> {
    // request.text(), nunca request.json() -- a verificação de assinatura
    // usa os bytes crus do corpo (o manifest do Mercado Pago é montado a
    // partir de data.id/headers, mas mantém o mesmo cuidado de nunca
    // reserializar antes de qualquer verificação, mesmo padrão do webhook Stripe).
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
    });
    try {
        const result = await processMercadoPagoWebhook(rawBody, headers);
        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        logger.error("mercadopago-webhook-route", "Erro inesperado no webhook Mercado Pago", errorMeta(error));
        // 200 mesmo em erro inesperado -- redelivery não resolve um bug
        // nosso, e o evento já foi logado antes de qualquer exceção não
        // tratada escapar até aqui (mesmo raciocínio do webhook Stripe).
        return NextResponse.json({ received: true }, { status: 200 });
    }
}
