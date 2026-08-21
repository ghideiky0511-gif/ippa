import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    clientIp,
    execute,
    rateLimit,
    tooManyRequests,
    AUTH_RATE_LIMIT,
} from "@/lib/http/apiHelpers";
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
    const limitResult = rateLimit(
        "auth-document-access",
        clientIp(request),
        AUTH_RATE_LIMIT.limit,
        AUTH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    if (typeof body.document !== "string") {
        return NextResponse.json(
            { error: "Informe seu CPF ou CNPJ." },
            { status: 400 },
        );
    }
    return execute(() =>
        authentication.getCustomerDocumentAccess(
            route.tenant,
            body.document as string,
        ),
    );
}
