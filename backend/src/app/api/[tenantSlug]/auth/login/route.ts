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
    const limitResult = rateLimit(
        "auth-login",
        clientIp(request),
        AUTH_RATE_LIMIT.limit,
        AUTH_RATE_LIMIT.windowMs,
    );
    if (!limitResult.allowed) return tooManyRequests(limitResult.retryAfterSeconds);
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const contextData = auditContext(request);

    const usesDocumentLogin = typeof body.document === "string";
    if (
        typeof body.password !== "string" ||
        (!usesDocumentLogin && typeof body.email !== "string")
    ) {
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
    return response;
}
