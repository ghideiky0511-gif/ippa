import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import { execute } from "@/lib/http/apiHelpers";
import * as pushNotifications from "@/services/notifications/pushNotificationService";

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
    const secret = request.headers.get("x-notification-dispatch-secret");
    if (
        !process.env.NOTIFICATION_DISPATCH_SECRET ||
        secret !== process.env.NOTIFICATION_DISPATCH_SECRET
    )
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    return execute(() =>
        pushNotifications.dispatchNotifications(
            route.tenant,
            { id: "", role: "administrador" },
            100,
        ),
    );
}
