import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchStockSync } from "@/services/erp/stockSyncService";
import { findActiveTenant } from "@/lib/db/tenant";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/http/apiHelpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Mesmo padrão de segredo/rate-limit de catalog-sync/dispatch (mesmo
// secret CATALOG_SYNC_SECRET -- rotacionar dois segredos em lockstep pra
// duas rotas internas idênticas em confiança seria overhead sem ganho).
// Chamada com cadência bem maior (poll dedicado de saldo, ~60s por tenant
// por padrão), então o limite é mais generoso.
const DISPATCH_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

function hasValidSecret(request: NextRequest): boolean {
    const expected = process.env.CATALOG_SYNC_SECRET;
    const provided = request.headers.get("x-catalog-sync-secret");
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
        "stock-sync-dispatch",
        clientIp(request) ?? "shared",
        DISPATCH_RATE_LIMIT.limit,
        DISPATCH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        logger.warn("stock-sync-dispatch", "Rate limit excedido", {
            ip: clientIp(request) ?? undefined,
        });
        return tooManyRequests(limitResult.retryAfterSeconds);
    }
    if (!hasValidSecret(request)) {
        logger.warn("stock-sync-dispatch", "Secret inválido ou ausente", {
            ip: clientIp(request) ?? undefined,
        });
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const tenantSlug = typeof body.tenantSlug === "string" && body.tenantSlug.trim() ? body.tenantSlug.trim() : undefined;
    let tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined;
    if (tenantSlug && tenantId) {
        return NextResponse.json({ error: "Informe tenantId ou tenantSlug, não os dois." }, { status: 400 });
    }
    if (tenantSlug) {
        const tenant = await findActiveTenant(tenantSlug);
        if (!tenant) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
        tenantId = tenant.id;
    }
    if (
        tenantId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
    ) {
        return NextResponse.json({ error: "tenantId inválido." }, { status: 400 });
    }

    logger.info("stock-sync-dispatch", "Disparando poll de saldo", { tenantId, tenantSlug });
    const result = await dispatchStockSync({ tenantId });
    logger.info("stock-sync-dispatch", "Poll de saldo concluído", {
        tenantId,
        tenantSlug,
        resultsCount: result.results.length,
        errorsCount: result.errors.length,
    });
    return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
}
