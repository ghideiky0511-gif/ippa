import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';

// Gate de navegação por perfil (ver AuthUser.permissions em types.ts) —
// SÓ entra em ação pra quem NÃO é vendedora/cliente. Esses dois perfis
// continuam com acesso total de sempre, sem passar por este arquivo:
// risco zero de regressão nos fluxos de talão/checkout já testados a
// fundo. administrador/expedição/entregador (perfis novos, combinados com
// o usuário) caem em /em-construcao quando a área da rota não está
// liberada em permissions.catalogAreas — o admin decide isso por conta,
// não por perfil fixo (ver aba Usuários da plataforma admin).
//
// Chama-se "proxy.ts" (não "middleware.ts") nesta versão do Next — ver
// node_modules/next/dist/docs/.../proxy.md, arquivo renomeado e rodando
// em runtime Node.js por padrão (por isso dá pra usar getUserFromToken,
// que lê arquivo, direto aqui, sem round-trip de rede).
const ALWAYS_PUBLIC_PREFIXES = ['/login', '/cadastro', '/pagar', '/em-construcao'];

function areaForPath(pathname: string): string {
  if (pathname.startsWith('/pedidos')) return 'pedidos';
  // Tudo mais sob o shell do catálogo (/, /catalogo, /produto, /carrinho,
  // /frete, /pagamento) é a "área" do talão — hoje é uma coisa só; cresce
  // quando separação/rota de entrega ganharem área própria.
  return 'talao';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    ALWAYS_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role === 'vendedora' || user.role === 'cliente') {
    return NextResponse.next();
  }

  const area = areaForPath(pathname);
  const allowed = user.permissions?.catalogAreas?.includes(area);
  if (!allowed) {
    return NextResponse.redirect(new URL('/em-construcao', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
