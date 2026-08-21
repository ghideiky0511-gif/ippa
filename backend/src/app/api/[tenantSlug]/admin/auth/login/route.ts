import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    auditContext,
    clientIp,
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
        "auth-admin-login",
        clientIp(request),
        AUTH_RATE_LIMIT.limit,
        AUTH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const contextData = auditContext(request);

    if (typeof body.password !== "string" || typeof body.email !== "string") {
        return NextResponse.json(
            { error: "Informe e-mail e senha." },
            { status: 400 },
        );
    }
    const result = await authentication.loginAdministrator(
        route.tenant,
        body.email,
        body.password,
        contextData,
    );
    if (!result) {
        return NextResponse.json(
            { error: "Dados de acesso ou permissão inválidos." },
            { status: 401 },
        );
    }
    return NextResponse.json(result);
}
