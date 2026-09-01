import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchPaymentReconciliation } from "@/services/payments/paymentReconciliationService";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/http/apiHelpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Mesmo padrão de api/internal/catalog-sync/dispatch/route.ts: scheduler
// externo, secret estático comparado em tempo constante, limite generoso o
// bastante pra retry manual, apertado o bastante pra conter força bruta.
const DISPATCH_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

function hasValidSecret(request: NextRequest): boolean {
    const expected = process.env.PAYMENT_RECONCILIATION_SECRET;
    const provided = request.headers.get("x-payment-reconciliation-secret");
    if (!expected || !provided) return false;
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);
    return (
        expectedBytes.length === providedBytes.length &&
        timingSafeEqual(expectedBytes, providedBytes)
    );
}

export async function POST(request: NextRequest): Promise<Response> {
    const limitResult = rateLimit(
        "payment-reconciliation-dispatch",
        clientIp(request) ?? "shared",
        DISPATCH_RATE_LIMIT.limit,
        DISPATCH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        logger.warn("payment-reconciliation-dispatch", "Rate limit excedido", {
            ip: clientIp(request) ?? undefined,
        });
        return tooManyRequests(limitResult.retryAfterSeconds);
    }
    if (!hasValidSecret(request)) {
        logger.warn("payment-reconciliation-dispatch", "Secret inválido ou ausente", {
            ip: clientIp(request) ?? undefined,
        });
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId =
        typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined;
    if (
        tenantId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
    ) {
        return NextResponse.json({ error: "tenantId inválido." }, { status: 400 });
    }
    const result = await dispatchPaymentReconciliation({ tenantId });
    return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
}
