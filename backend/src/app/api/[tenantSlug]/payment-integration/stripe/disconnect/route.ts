import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { auditContext, execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import { disconnectStripeAccount } from "@/services/payments/stripeOnboardingService";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return execute(() => disconnectStripeAccount(route.tenant, authenticated.user, {
        ...auditContext(request),
        sessionId: authenticated.sessionId,
    }));
}
