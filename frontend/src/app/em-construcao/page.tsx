'use client';

// Landing pra perfis sem área liberada no catálogo ainda (ver
// AuthUser.permissions em types.ts e web/src/proxy.ts) — hoje é o caso
// padrão de expedição/entregador, recém criados e sem tela própria
// (separação de pedido / rota de entrega são um passo futuro). O admin
// libera áreas por conta em Usuários; a pessoa já pode sair pelo "Sair"
// do topo (TopNav renderiza normal, é o mesmo header de qualquer login).
export default function EmConstrucaoPage() {
  return (
    <main className="container order-confirmed-page">
      <div className="order-confirmed-box">
        <h1>Em construção</h1>
        <p>Essa conta ainda não tem nenhuma área liberada no catálogo — fale com o administrador da loja.</p>
      </div>
    </main>
  );
}
