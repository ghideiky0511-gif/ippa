import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/api-config";

const WORKSPACE_SESSION_COOKIE = "ippa_workspace_session=";

function workspaceSessionToken(response: Response): string | null {
    // The backend returns the token only in an HttpOnly Set-Cookie response.
    // This server-to-server request does not persist that cookie in the browser,
    // so recreate it for the catalog origin below.
    const headers = response.headers as Headers & {
        getSetCookie?: () => string[];
    };
    const cookies = headers.getSetCookie?.() ?? [
        response.headers.get("set-cookie") ?? "",
    ];
    const session = cookies.find((cookie) =>
        cookie.startsWith(WORKSPACE_SESSION_COOKIE),
    );
    if (!session) return null;

    const token = session
        .slice(WORKSPACE_SESSION_COOKIE.length)
        .split(";", 1)[0];
    return token || null;
}

// Proxy fino para o login do workspace no backend. Em caso de sucesso, cria
// um cookie próprio desta origem (ippa_admin_session — nome mantido por ora,
// ver nota de migração no README); o token nunca fica exposto diretamente
// no navegador.
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const tenant = new URL(
        request.headers.get("referer") || request.url,
    ).pathname.split("/")[1];
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenant || ""))
        return NextResponse.json({ error: "Tenant ausente." }, { status: 404 });
    const res = await fetch(`${API_BASE}/api/${tenant}/workspace/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return NextResponse.json(
            { error: data.error || "Não foi possível entrar." },
            { status: res.status },
        );
    }

    const token = workspaceSessionToken(res);
    if (!token) {
        return NextResponse.json(
            { error: "Nao foi possivel criar a sessao do workspace." },
            { status: 502 },
        );
    }

    const response = NextResponse.json({ user: data.user });
    response.cookies.set("ippa_workspace_session", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set("ippa_workspace_tenant", tenant, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });
    return response;
}
