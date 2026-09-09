import { NextRequest, NextResponse } from "next/server";
import { auditContext, execute, rateLimit, requestToken, tooManyRequests } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

async function authenticated(request: NextRequest, context: RouteContext) {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return { ok: false as const, response: route };
    const token = requestToken(request, route.tenant.slug);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session) {
        return { ok: false as const, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
    }
    return { ok: true as const, route, session };
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    return execute(() => Promise.resolve(whatsapp.listStandardWhatsAppTemplates(auth.route.tenant, auth.session.user)));
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const auth = await authenticated(request, context);
    if (!auth.ok) return auth.response;
    const limited = rateLimit("whatsapp-template-submission", auth.session.user.id, 10, 60_000);
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    return execute(
        () => whatsapp.submitStandardWhatsAppTemplate(
            auth.route.tenant,
            auth.session.user,
            body,
            auditContext(request),
        ),
        201,
    );
}
