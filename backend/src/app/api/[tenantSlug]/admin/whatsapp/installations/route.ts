import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute, requestToken } from "@/lib/http/apiHelpers";
import * as authentication from "@/services/auth";
import * as whatsapp from "@/services/whatsapp";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

// Garante a instalação do app "bippa-catalogo" para esta VENDEDORA no
// bippa-messaging -- chamado antes de abrir uma tentativa de onboarding (ver
// whatsappInstallationService.ensureWhatsAppInstallation). sellerId precisa
// ser o mesmo usado depois em startWhatsAppOnboardingAttempt.
export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const token = requestToken(request, route.tenant.slug);
    const session = await authentication.getAuthenticatedSession(route.tenant, token);
    if (!session)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { sellerId?: string } | null;
    if (!body?.sellerId)
        return NextResponse.json({ error: "sellerId é obrigatório." }, { status: 400 });
    return execute(() =>
        whatsapp.ensureWhatsAppInstallation(route.tenant, session.user, body.sellerId!),
    );
}
