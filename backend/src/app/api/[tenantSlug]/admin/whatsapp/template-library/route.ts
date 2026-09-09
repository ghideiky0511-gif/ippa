import { NextRequest, NextResponse } from "next/server";
import { auditContext, execute, rateLimit, requestToken, tooManyRequests } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

async function authenticated(request: NextRequest, context: RouteContext) {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return { ok: false as const, response: route };
    const session = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
    if (!session) return { ok: false as const, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
    return { ok: true as const, route, session };
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    const sellerId = request.nextUrl.searchParams.get("sellerId");
    return execute(() => whatsapp.listWhatsAppTemplateLibrary(
        auth.route.tenant,
        auth.session.user,
        { sellerId },
        request.nextUrl.searchParams.get("sync") !== "false",
    ));
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    const limited = rateLimit("whatsapp-template-library-create", auth.session.user.id, 10, 60_000);
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    return execute(() => whatsapp.createWhatsAppTemplateInLibrary(
        auth.route.tenant,
        auth.session.user,
        body,
        auditContext(request),
    ), 201);
}
