import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string; attemptId: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Reconcilia uma tentativa de Embedded Signup pelo `attemptId` -- fonte de
// verdade do fluxo, chamada tanto pelo polling do frontend quanto na
// primeira consulta após `bippa.meta.onboarding.completed`/`.failed` (ver
// whatsappOnboardingService.reconcileWhatsAppOnboardingAttempt). O tenant
// vem sempre da sessão autenticada, nunca de query string -- e o attemptId
// só resolve para uma linha se pertencer a este tenant (RLS via
// app_tenant_id() no model), então uma administradora nunca reconcilia a
// tentativa de outro tenant mesmo sabendo o uuid.
export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() =>
        whatsapp.reconcileWhatsAppOnboardingAttempt(route.tenant, session.user, route.params.attemptId),
    );
}
