import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchCatalogSync } from "@/services/erp/catalogSyncService";
import type { CatalogSyncMode } from "@/models/catalogSyncModel";
import { findActiveTenant } from "@/lib/db/tenant";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/http/apiHelpers";

export const dynamic = "force-dynamic";

// Rota chamada por um scheduler externo (fora do Render), não por usuário
// final — limite generoso o bastante pra retries manuais, apertado o
// bastante pra conter força bruta do secret. Sem IP confiável (proxy que não
// repassa x-forwarded-for), cai num bucket único compartilhado em vez de
// falhar aberto, já que aqui o risco é o secret, não enumeração por IP.
const DISPATCH_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

function hasValidSecret(request: NextRequest): boolean {
    const expected = process.env.CATALOG_SYNC_SECRET;
    const provided = request.headers.get("x-catalog-sync-secret");
    if (!expected || !provided) return false;
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);
    return expectedBytes.length === providedBytes.length
        && timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: NextRequest): Promise<Response> {
    const limitResult = rateLimit(
        "catalog-sync-dispatch",
        clientIp(request) ?? "shared",
        DISPATCH_RATE_LIMIT.limit,
        DISPATCH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        return tooManyRequests(limitResult.retryAfterSeconds);
    }
    if (!hasValidSecret(request)) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const tenantSlug = typeof body.tenantSlug === "string" && body.tenantSlug.trim()
        ? body.tenantSlug.trim()
        : undefined;
    let tenantId = typeof body.tenantId === "string" && body.tenantId.trim()
        ? body.tenantId.trim()
        : undefined;
    if (tenantSlug && tenantId) {
        return NextResponse.json({ error: "Informe tenantId ou tenantSlug, não os dois." }, { status: 400 });
    }
    if (tenantSlug) {
        const tenant = await findActiveTenant(tenantSlug);
        if (!tenant) {
            return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
        }
        tenantId = tenant.id;
    }
    if (tenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
        return NextResponse.json({ error: "tenantId inválido." }, { status: 400 });
    }
    if (body.mode !== undefined && body.mode !== "full" && body.mode !== "incremental") {
        return NextResponse.json({ error: "mode inválido." }, { status: 400 });
    }
    const mode = body.mode === "full" || body.mode === "incremental"
        ? body.mode as CatalogSyncMode
        : undefined;
    const result = await dispatchCatalogSync({ tenantId, mode });
    return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
}
