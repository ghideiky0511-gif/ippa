import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, execute, rateLimit, tooManyRequests } from "@/lib/http/apiHelpers";
import { isTenantRouteError, resolveTenantRoute } from "@/lib/http/tenantRoute";
import * as orders from "@/services/orders";

type RouteContext = { params: Promise<{ tenantSlug: string }> };

const exchangeSchema = z.object({ token: z.string().min(32).max(256) });
const EXCHANGE_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

export const dynamic = "force-dynamic";

// Esta rota e propositalmente publica: o segredo e o token opaco, que so e
// consumido no POST. Um GET de preview/scanner do WhatsApp nunca o invalida.
export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const limited = rateLimit(
        "order-access-exchange",
        clientIp(request),
        EXCHANGE_RATE_LIMIT.limit,
        EXCHANGE_RATE_LIMIT.windowMs,
    );
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);
    const body = await request.json().catch(() => null);
    const parsed = exchangeSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Link de acesso inválido." },
            { status: 400 },
        );
    }
    return execute(() =>
        orders.exchangeOrderAccessToken(route.tenant, parsed.data.token),
    );
}
