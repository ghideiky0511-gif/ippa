import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    if (
        typeof body.document !== "string" ||
        typeof body.password !== "string"
    ) {
        return NextResponse.json(
            { error: "Informe documento e senha." },
            { status: 400 },
        );
    }
    return execute(() =>
        authentication.startCustomerFirstAccess(
            route.tenant,
            body.document as string,
            body.password as string,
        ),
    );
}
