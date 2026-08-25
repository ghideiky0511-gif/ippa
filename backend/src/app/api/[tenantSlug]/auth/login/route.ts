import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    auditContext,
    clientIp,
    cookieOptions,
    rateLimit,
    tooManyRequests,
    AUTH_RATE_LIMIT,
} from "@/lib/http/apiHelpers";
import { logger } from "@/lib/logger";
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
        "auth-login",
        clientIp(request),
        AUTH_RATE_LIMIT.limit,
        AUTH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) {
        logger.warn("customer-login", "Login bloqueado pelo rate limit", {
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
    const usesDocumentLogin = typeof body.document === "string";
    if (
        typeof body.password !== "string" ||
        (!usesDocumentLogin && typeof body.email !== "string")
    ) {
        logger.warn("customer-login", "Login recebeu payload invalido", {
            tenantId: route.tenant.id,
            tenantSlug: route.tenant.slug,
            requestId: contextData.requestId,
            ipAddress: contextData.ipAddress,
        });
        return NextResponse.json(
            {
                error: usesDocumentLogin
                    ? "Informe documento e senha."
                    : "Informe e-mail e senha.",
            },
            { status: 400 },
        );
    }
    const password = body.password as string;
    const email = body.email as string;
    const result = usesDocumentLogin
        ? await authentication.loginByDocument(
              route.tenant,
              body.document as string,
              password,
              contextData,
          )
        : await authentication.login(route.tenant, email, password, contextData);
    if (!result) {
        logger.warn("customer-login", "Credenciais de login rejeitadas", {
            tenantId: route.tenant.id,
            tenantSlug: route.tenant.slug,
            requestId: contextData.requestId,
            ipAddress: contextData.ipAddress,
            loginType: usesDocumentLogin ? "document" : "email",
        });
        return NextResponse.json(
            { error: "Dados de acesso ou permissão inválidos." },
            { status: 401 },
        );
    }
    const response = NextResponse.json({ user: result.user });
    response.cookies.set(
        authentication.sessionCookieName(route.tenant.slug),
        result.token,
        cookieOptions(),
    );
    logger.info("customer-login", "Login concluido", {
        tenantId: route.tenant.id,
        tenantSlug: route.tenant.slug,
        requestId: contextData.requestId,
        ipAddress: contextData.ipAddress,
        userId: result.user.id,
        role: result.user.role,
        loginType: usesDocumentLogin ? "document" : "email",
    });
    return response;
}
