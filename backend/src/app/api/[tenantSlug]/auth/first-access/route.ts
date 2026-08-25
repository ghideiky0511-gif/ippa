import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    auditContext,
    clientIp,
    execute,
    rateLimit,
    tooManyRequests,
    AUTH_RATE_LIMIT,
} from "@/lib/http/apiHelpers";
import { logger } from "@/lib/logger";
import { ServiceError } from "@/services/shared/errors";
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
    const contextData = auditContext(request);
    const limitResult = rateLimit(
        "auth-first-access",
        clientIp(request),
        AUTH_RATE_LIMIT.limit,
        AUTH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        logger.warn("customer-login", "Primeiro acesso bloqueado pelo rate limit", {
            tenantId: route.tenant.id,
            tenantSlug: route.tenant.slug,
            requestId: contextData.requestId,
            ipAddress: contextData.ipAddress,
        });
        return tooManyRequests(limitResult.retryAfterSeconds);
    }
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    if (
        typeof body.document !== "string" ||
        typeof body.password !== "string"
    ) {
        logger.warn("customer-login", "Primeiro acesso recebeu payload invalido", {
            tenantId: route.tenant.id,
            tenantSlug: route.tenant.slug,
            requestId: contextData.requestId,
            ipAddress: contextData.ipAddress,
        });
        return NextResponse.json(
            { error: "Informe documento e senha." },
            { status: 400 },
        );
    }
    return execute(async () => {
        try {
            const result = await authentication.startCustomerFirstAccess(
                route.tenant,
                body.document as string,
                body.password as string,
            );
            logger.info("customer-login", "Primeiro acesso concluido", {
                tenantId: route.tenant.id,
                tenantSlug: route.tenant.slug,
                requestId: contextData.requestId,
                ipAddress: contextData.ipAddress,
            });
            return result;
        } catch (error) {
            logger.warn("customer-login", "Primeiro acesso rejeitado", {
                tenantId: route.tenant.id,
                tenantSlug: route.tenant.slug,
                requestId: contextData.requestId,
                ipAddress: contextData.ipAddress,
                errorCode: error instanceof ServiceError ? error.code : "UNEXPECTED_ERROR",
            });
            throw error;
        }
    });
}
