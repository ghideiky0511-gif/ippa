import { NextRequest, NextResponse } from "next/server";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string; templateId: string }> };

async function authenticated(request: NextRequest, context: RouteContext) {
    const [route, params] = await Promise.all([resolveTenantRoute(request, context.params), context.params]);
    if (isTenantRouteError(route)) return { ok: false as const, response: route };
    const session = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
    if (!session) return { ok: false as const, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
    return { ok: true as const, route, session, params };
}

function sellerIdFrom(request: NextRequest) {
    return request.nextUrl.searchParams.get("sellerId") ?? "";
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    return execute(() => whatsapp.inspectWhatsAppTemplateInLibrary(
        auth.route.tenant, auth.session.user, sellerIdFrom(request), auth.params.templateId,
    ));
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    return execute(async () => {
        await whatsapp.deleteWhatsAppTemplateInLibrary(
            auth.route.tenant, auth.session.user, sellerIdFrom(request), auth.params.templateId, auditContext(request),
        );
        return { deleted: true };
    });
}
