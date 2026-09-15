import { NextRequest, NextResponse } from "next/server";
import { API_BASE, applyInternalRequestHeader } from "@/lib/api-config";
import { forwardClientIpHeaders } from "@/lib/forwarded-client";

function tenantFromReferer(request: NextRequest): string | null {
    const referer = request.headers.get("referer");
    if (!referer) return null;
    try {
        const tenant = new URL(referer).pathname.split("/")[1]?.toLowerCase();
        return tenant && /^[a-z0-9][a-z0-9-]{1,62}$/.test(tenant)
            ? tenant
            : null;
    } catch {
        return null;
    }
}

function orderAccessCookieName(tenantSlug: string): string {
    return `ippa_order_access_${tenantSlug.replace(/[^a-z0-9-]/g, "")}`;
}

// O frontend recebe o token original apenas nesta troca e grava somente a
// sessao curta em cookie HttpOnly. Assim o token de uso unico nunca fica em
// localStorage, nem aparece na URL final do pedido.
export async function POST(request: NextRequest): Promise<Response> {
    const tenant = tenantFromReferer(request);
    if (!tenant) {
        return NextResponse.json({ error: "Loja não identificada." }, { status: 404 });
    }
    const body = await request.json().catch(() => null);
    const headers = new Headers({ "Content-Type": "application/json" });
    forwardClientIpHeaders(request.headers, headers);
    applyInternalRequestHeader(headers);
    const upstream = await fetch(`${API_BASE}/api/${tenant}/order-access/exchange`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
    });
    const payload = await upstream.json().catch(() => null) as {
        orderNumber?: number;
        sessionToken?: string;
        error?: string;
    } | null;
    if (!upstream.ok || !payload?.orderNumber || !payload.sessionToken) {
        return NextResponse.json(
            { error: payload?.error ?? "Não foi possível validar este link." },
            { status: upstream.status || 400 },
        );
    }
    const response = NextResponse.json({ orderNumber: payload.orderNumber });
    response.cookies.set(orderAccessCookieName(tenant), payload.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 60,
    });
    return response;
}
