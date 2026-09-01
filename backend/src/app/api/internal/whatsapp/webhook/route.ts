import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withControlTransaction } from "@/lib/db/control";
import { logger } from "@/lib/logger";
import { findTenantIdByWhatsAppPhoneNumberId, insertWhatsAppWebhookEventRow } from "@/models/whatsappWebhookEventsModel";
import type { WhatsAppWebhookPayload } from "@/whatsapp/types";

export const dynamic = "force-dynamic";

// Endpoint único por app (sem tenant na URL -- a Meta manda todo evento de
// toda WABA inscrita para o mesmo endpoint, ver
// developers.facebook.com/docs/graph-api/webhooks/getting-started). Resolve
// tenant/vendedora por `phone_number_id` dentro do payload -- por isso usa
// withControlTransaction (bypassa RLS por design, mesmo padrão de
// catalogSyncService.dispatchCatalogSync): não há tenant no `app.tenant_id`
// de sessão antes de olhar o conteúdo do evento.

// Handshake de verificação exigido pela Meta ao configurar o webhook no App
// Dashboard -- GET com hub.mode=subscribe, responde o challenge de volta se
// o verify_token bater.
export async function GET(request: NextRequest): Promise<Response> {
    const url = request.nextUrl;
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && expected && token === expected && challenge) {
        return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(signatureHeader.slice("sha256=".length));
    return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: NextRequest): Promise<Response> {
    const rawBody = await request.text();
    const signatureValid = isValidSignature(rawBody, request.headers.get("x-hub-signature-256"));

    let payload: WhatsAppWebhookPayload | undefined;
    try {
        payload = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
        payload = undefined;
    }

    if (!signatureValid) {
        logger.warn("whatsapp-webhook", "Assinatura inválida ou ausente -- evento descartado", {});
        // 200 mesmo assim: a Meta reenvia (com backoff crescente) qualquer
        // resposta != 2xx, e um payload forjado não deve gerar retry.
        return NextResponse.json({ ok: true });
    }

    const statuses = (payload?.entry ?? []).flatMap((entry) =>
        entry.changes
            .filter((change) => change.field === "messages")
            .flatMap((change) => ({ phoneNumberId: change.value.metadata?.phone_number_id, statuses: change.value.statuses ?? [] })),
    );

    await withControlTransaction(async (client) => {
        for (const group of statuses) {
            const tenantId = group.phoneNumberId
                ? await findTenantIdByWhatsAppPhoneNumberId(client, group.phoneNumberId)
                : null;
            for (const status of group.statuses) {
                await insertWhatsAppWebhookEventRow(client, {
                    tenantId,
                    waMessageId: status.id,
                    eventType: status.status,
                    signatureValid: true,
                    payload: status,
                });
            }
        }
    });

    return NextResponse.json({ ok: true });
}
