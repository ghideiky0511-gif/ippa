import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchCatalogSync } from "@/services/erp/catalogSyncService";
import type { CatalogSyncMode } from "@/models/catalogSyncModel";

export const dynamic = "force-dynamic";

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
    if (!hasValidSecret(request)) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim()
        ? body.tenantId.trim()
        : undefined;
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
