import { NextResponse } from 'next/server';
import { deleteUser } from '@/lib/auth';
import { deleteClient } from '@/lib/clients';

// Exclui uma conta pela aba "Usuários" do admin (ver GET/POST em
// ../route.ts). Vendedora: só apaga o login. Cliente: apaga o login E o
// cadastro (Client) vinculado — não deixa órfão. Pedidos/sessões antigas
// dessa pessoa (orderHistory.json/orderSessions.json) NÃO são apagados —
// são histórico, ficam com o clientId/sellerId "solto" apontando pra
// ninguém, igual qualquer sistema de pedidos que mantém a venda mesmo
// depois da conta sair.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const removed = await deleteUser(id);
  if (!removed) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404, headers: CORS_HEADERS });
  }
  if (removed.role === 'cliente' && removed.clientId) {
    await deleteClient(removed.clientId);
  }
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
