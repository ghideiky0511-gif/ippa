import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncReferenceOnDemand } from "@/services/erp/catalogSyncService";
import { findActiveTenant, findActiveTenantById } from "@/lib/db/tenant";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/http/apiHelpers";
import { errorMeta, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Mesmo raciocínio de rate limit do dispatch/route.ts: rota chamada por
// automação interna, não usuário final — limite generoso o bastante pra
// retries manuais, apertado o bastante pra conter força bruta do secret.
const REFERENCE_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

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
        "catalog-sync-reference",
        clientIp(request) ?? "shared",
        REFERENCE_RATE_LIMIT.limit,
        REFERENCE_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        logger.warn("catalog-sync-reference", "Rate limit excedido", {
            ip: clientIp(request) ?? undefined,
        });
        return tooManyRequests(limitResult.retryAfterSeconds);
    }
    if (!hasValidSecret(request)) {
        logger.warn("catalog-sync-reference", "Secret inválido ou ausente", {
            ip: clientIp(request) ?? undefined,
        });
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;

    const tenantSlug =
        typeof body.tenantSlug === "string" && body.tenantSlug.trim()
            ? body.tenantSlug.trim()
            : undefined;
    const tenantId =
        typeof body.tenantId === "string" && body.tenantId.trim()
            ? body.tenantId.trim()
            : undefined;
    if (tenantSlug && tenantId) {
        return NextResponse.json(
            { error: "Informe tenantId ou tenantSlug, não os dois." },
            { status: 400 },
        );
    }
    if (!tenantSlug && !tenantId) {
        return NextResponse.json(
            { error: "Informe tenantId ou tenantSlug." },
            { status: 400 },
        );
    }
    if (
        tenantId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            tenantId,
        )
    ) {
        return NextResponse.json({ error: "tenantId inválido." }, { status: 400 });
    }
    const referenceCode =
        typeof body.referenceCode === "string" && body.referenceCode.trim()
            ? body.referenceCode.trim()
            : undefined;
    if (!referenceCode) {
        return NextResponse.json(
            { error: "referenceCode obrigatório." },
            { status: 400 },
        );
    }

    const tenant = tenantSlug
        ? await findActiveTenant(tenantSlug)
        : await findActiveTenantById(tenantId!);
    if (!tenant) {
        return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
    }

    logger.info("catalog-sync-reference", "Atualizando referência sob demanda", {
        tenantId: tenant.id,
        referenceCode,
    });
    try {
        const result = await syncReferenceOnDemand(tenant, referenceCode);
        logger.info("catalog-sync-reference", "Referência atualizada sob demanda", {
            tenantId: tenant.id,
            referenceCode,
            status: result.status,
        });
        return NextResponse.json(result, {
            status: result.status === "not_found" ? 404 : 200,
        });
    } catch (error) {
        logger.warn(
            "catalog-sync-reference",
            "Falha ao atualizar referência sob demanda",
            { tenantId: tenant.id, referenceCode, ...errorMeta(error) },
        );
        return NextResponse.json(
            { error: "Falha ao atualizar referência." },
            { status: 502 },
        );
    }
}
