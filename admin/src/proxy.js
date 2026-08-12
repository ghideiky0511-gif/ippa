import { NextResponse } from 'next/server';

// Gate da plataforma admin inteira — antes disso, QUALQUER um que abrisse
// a URL editava tudo (sem login nenhum). Chama-se "proxy.js" (não
// "middleware.js") nesta versão do Next — ver
// node_modules/next/dist/docs/.../proxy.md.
//
// Cookie própria do admin (ippa_admin_session, ver
// admin/src/app/api/auth/login/route.js) — não reaproveita a cookie do
// catálogo (web/) de propósito: em produção admin/catálogo tendem a ser
// subdomínios diferentes, cookie não compartilha sozinho entre eles.
// Validação de verdade (token existe mas expirou/foi revogado) é feita
// aqui batendo em GET /api/admin/auth/me de `web`, já que os dados de
// sessão moram lá (web/src/data/authSessions.json), não neste app.
const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';
const PUBLIC_PREFIXES = ['/login'];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('ippa_admin_session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  } catch {
    // `web` fora do ar — deixa passar em vez de travar o admin inteiro; as
    // chamadas de dado (fetchUsers etc.) vão falhar do mesmo jeito e
    // mostrar erro na tela, como já acontece hoje se `web` cair.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
