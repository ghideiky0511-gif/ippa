import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute } from "@/lib/http/apiHelpers";
import * as users from "@/services/users";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Esta rota é propositalmente pública: o crawler que monta o preview do
// WhatsApp/Instagram não possui a sessão da pessoa que enviou o link.
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const sharedBy = request.nextUrl.searchParams.get("sharedBy") || "";
    if (!z.uuid().safeParse(sharedBy).success) return NextResponse.json({ name: null });
    return execute(async () => ({ name: (await users.publicCatalogSharer(route.tenant, sharedBy))?.name ?? null }));
}
