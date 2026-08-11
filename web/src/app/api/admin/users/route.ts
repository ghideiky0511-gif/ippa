import { NextResponse } from 'next/server';
import { listUsersWithoutPasswords } from '@/lib/auth';
import { readClients } from '@/lib/clients';

// Lista combinada de contas (vendedora + cliente) pra aba "Usuários" da
// plataforma admin — só leitura nesta rodada (sem PUT: editar senha/hash
// pelo admin fica pra outra hora). Junta users.json (sem passwordHash, ver
// listUsersWithoutPasswords em web/src/lib/auth.ts) com o cadastro em
// clients.json quando o usuário é uma cliente (AuthUser.clientId), pra
// mostrar CPF/CNPJ junto — mesmo padrão CORS de /api/store-settings, porque
// o admin roda numa origem separada (porta 3001 em dev).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const [users, clients] = await Promise.all([listUsersWithoutPasswords(), readClients()]);
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const rows = users.map((u) => {
    const client = u.clientId ? clientsById[u.clientId] : undefined;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      cpfCnpj: client?.cpfCnpj,
      lastSellerId: client?.lastSellerId,
      createdAt: client?.createdAt,
    };
  });

  return NextResponse.json(rows, { headers: CORS_HEADERS });
}
