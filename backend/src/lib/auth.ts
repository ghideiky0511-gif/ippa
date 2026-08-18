import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { AuthUser, UserRole } from './types';

// Login simples (email+senha) pra usuário de teste — vendedora hoje,
// cliente quando essa fase existir. Sem banco: users.json guarda as
// contas (senha com hash, nunca em texto puro), authSessions.json guarda
// só o token de login -> usuário (efêmero, fora do git, ver .gitignore).
// Trocar por um banco de verdade depois é só reescrever as funções deste
// arquivo — quem consome (rotas /api/auth/*, páginas) não muda.
const USERS_PATH = path.join(process.cwd(), 'src/data/users.json');
const SESSIONS_PATH = path.join(process.cwd(), 'src/data/authSessions.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias — sem necessidade de expirar rápido pra usuário de teste

export const SESSION_COOKIE = 'ippa_session';

interface StoredUser extends AuthUser {
  passwordHash: string;
}

interface StoredAuthSession {
  userId: string;
  expiresAt: number;
}

async function readUsers(): Promise<StoredUser[]> {
  const raw = await readFile(USERS_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  const tmpPath = `${USERS_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(users, null, 2), 'utf-8');
  await rename(tmpPath, USERS_PATH);
}

async function readAuthSessions(): Promise<Record<string, StoredAuthSession>> {
  try {
    const raw = await readFile(SESSIONS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function writeAuthSessions(sessions: Record<string, StoredAuthSession>): Promise<void> {
  const tmpPath = `${SESSIONS_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(sessions, null, 2), 'utf-8');
  await rename(tmpPath, SESSIONS_PATH);
}

function withoutPasswordHash(user: StoredUser): AuthUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

// Todos os usuários (vendedora + cliente), sem passwordHash — usado pela
// aba "Usuários" do admin (GET /api/admin/users), que só lista, nunca edita
// senha por ali.
export async function listUsersWithoutPasswords(): Promise<AuthUser[]> {
  const users = await readUsers();
  return users.map(withoutPasswordHash);
}

// Já existe AuthUser vinculado a esse Client? Usado pelo talão (GET
// /api/clients/[id], POST /api/clients/[id]/create-login) — um "cadastro
// rápido" (só nome, criado pela vendedora) pode existir sem login por um
// tempo, até a vendedora criar um ali mesmo ou a cliente se autocadastrar
// depois (ver PLANO-PROXIMOS-PASSOS.md, "limitação conhecida" sobre os dois
// não se casarem automaticamente — continua valendo, isso só checa se JÁ
// existe, não tenta juntar dois cadastros).
export async function hasLoginForClient(clientId: string): Promise<boolean> {
  const users = await readUsers();
  return users.some((u) => u.clientId === clientId);
}

// AuthUser vinculado a um Client, se existir — usado pra resolver o
// "e-mail cadastrado" de verdade (o da conta/login, ver
// web/src/lib/email.ts) a partir de um clientId, em vez do Client.email
// (que é só um campo de cadastro e pode nunca ter sido preenchido, ou
// divergir do e-mail usado no login criado depois — ver POST
// /api/clients/[id]/create-login, o e-mail do login é escolhido na hora,
// só vem pré-preenchido com o do cadastro).
export async function getAuthUserByClientId(clientId: string): Promise<AuthUser | null> {
  const users = await readUsers();
  const user = users.find((u) => u.clientId === clientId);
  return user ? withoutPasswordHash(user) : null;
}

// AuthUser pelo próprio id — usado por GET /api/sessions/mine pra resolver
// o nome da vendedora atendendo a sessão (ver sellerName em types.ts), a
// partir de OrderSession.sellerId.
export async function getAuthUserById(id: string): Promise<AuthUser | null> {
  const users = await readUsers();
  const user = users.find((u) => u.id === id);
  return user ? withoutPasswordHash(user) : null;
}

export async function verifyLogin(email: string, password: string): Promise<AuthUser | null> {
  const users = await readUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? withoutPasswordHash(user) : null;
}

// Áreas do catálogo que existem hoje (ver areaForPath em web/src/proxy.ts,
// fonte de verdade de quais rotas cada chave cobre) — usado pra validar o
// que a plataforma admin manda em permissions.catalogAreas (POST/PUT
// /api/admin/users), pra não deixar salvar uma chave inventada que não
// bate com nenhuma área real.
export const KNOWN_CATALOG_AREAS = ['talao', 'pedidos'] as const;

// Permissão de partida pra cada perfil (ver AuthUser.permissions em
// types.ts) — só o ponto de partida ao criar uma conta pelo admin
// (POST /api/admin/users), sempre editável depois (PUT do mesmo id). Não
// é uma regra fixa por role: o admin pode dar acesso ao admin pra uma
// vendedora, ou nenhuma área de catálogo pra ela, se quiser.
export function defaultPermissionsFor(role: UserRole): NonNullable<AuthUser['permissions']> {
  switch (role) {
    case 'administrador':
      return { adminAccess: true, catalogAreas: [] };
    case 'vendedora':
      return { adminAccess: false, catalogAreas: ['talao', 'pedidos'] };
    case 'expedicao':
    case 'entregador':
      // Sem tela própria ainda (separação/rota de entrega) — cai em
      // /em-construcao até o admin liberar alguma área (ver
      // web/src/middleware.ts).
      return { adminAccess: false, catalogAreas: [] };
    default:
      return { adminAccess: false, catalogAreas: [] };
  }
}

// Autocadastro (hoje só role 'cliente', via POST /api/auth/signup) —
// e-mail precisa ser único em TODO users.json, não só dentro da mesma
// role (é o mesmo sistema de login pra vendedora e cliente). Lança
// 'EMAIL_TAKEN' em vez de retornar null pra quem chama distinguir esse
// caso específico de qualquer outro erro.
export async function createUser(params: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  clientId?: string;
  permissions?: AuthUser['permissions'];
}): Promise<AuthUser> {
  const users = await readUsers();
  const email = params.email.trim();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('EMAIL_TAKEN');
  }
  const passwordHash = await bcrypt.hash(params.password, 10);
  const user: StoredUser = {
    id: randomUUID(),
    email,
    name: params.name.trim(),
    role: params.role,
    clientId: params.clientId,
    permissions: params.permissions ?? defaultPermissionsFor(params.role),
    passwordHash,
  };
  users.push(user);
  await writeUsers(users);
  return withoutPasswordHash(user);
}

// Edita nome/e-mail/senha de uma conta já existente — usado pelo botão de
// editar (lápis) da aba "Usuários" do admin (PUT /api/admin/users/[id]).
// `password` vazio/ausente mantém o hash atual (não força troca de senha
// toda edição, só quando preenchido). `permissions` não é mexido aqui: essa
// edição é só cadastro básico (nome/e-mail/senha), a granularidade de
// acesso continua fixada no momento da criação (ver defaultPermissionsFor).
export async function updateUser(
  id: string,
  params: { name?: string; email?: string; password?: string; catalogAreas?: string[] }
): Promise<AuthUser | null> {
  const users = await readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  const current = users[index];
  const email = params.email?.trim();
  if (email && users.some((u, i) => i !== index && u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('EMAIL_TAKEN');
  }

  const updated: StoredUser = {
    ...current,
    name: params.name?.trim() || current.name,
    email: email || current.email,
    passwordHash: params.password ? await bcrypt.hash(params.password, 10) : current.passwordHash,
    permissions: params.catalogAreas
      ? { ...current.permissions, catalogAreas: params.catalogAreas }
      : current.permissions,
  };
  users[index] = updated;
  await writeUsers(users);
  return withoutPasswordHash(updated);
}

// Exclui a conta (login) — usado pelo botão "excluir" da aba "Usuários" do
// admin (DELETE /api/admin/users/[id]). Derruba também qualquer sessão
// ativa dessa conta (senão o token continuaria "logado" até expirar sozinho
// — 7 dias, ver SESSION_TTL_MS). Devolve o usuário apagado (pra quem chama
// saber o role/clientId e decidir se apaga o Client junto), ou null se o id
// não existia.
export async function deleteUser(id: string): Promise<AuthUser | null> {
  const users = await readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  const [removed] = users.splice(index, 1);
  await writeUsers(users);

  const sessions = await readAuthSessions();
  let changed = false;
  for (const [token, session] of Object.entries(sessions)) {
    if (session.userId === id) {
      delete sessions[token];
      changed = true;
    }
  }
  if (changed) await writeAuthSessions(sessions);

  return withoutPasswordHash(removed);
}

export async function createSessionToken(userId: string): Promise<string> {
  const sessions = await readAuthSessions();
  const token = randomBytes(32).toString('hex');
  sessions[token] = { userId, expiresAt: Date.now() + SESSION_TTL_MS };
  await writeAuthSessions(sessions);
  return token;
}

export async function destroySessionToken(token: string): Promise<void> {
  const sessions = await readAuthSessions();
  delete sessions[token];
  await writeAuthSessions(sessions);
}

export async function getUserFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const sessions = await readAuthSessions();
  const session = sessions[token];
  if (!session || session.expiresAt < Date.now()) return null;
  const users = await readUsers();
  const user = users.find((u) => u.id === session.userId);
  return user ? withoutPasswordHash(user) : null;
}

// IDs de vendedora com login válido agora — usado por
// web/src/lib/assignment.ts (pickSeller) pra saber quem pode receber uma
// cliente nova. "Logada" aqui é só "tem um token de sessão não expirado",
// não tem conceito de "online agora mesmo" (sem WebSocket ainda) — uma
// aba esquecida aberta conta como logada até o cookie expirar ou fazer
// logout.
export async function getOnlineVendedoraIds(): Promise<string[]> {
  const [sessions, users] = await Promise.all([readAuthSessions(), readUsers()]);
  const now = Date.now();
  const activeUserIds = new Set(
    Object.values(sessions)
      .filter((s) => s.expiresAt > now)
      .map((s) => s.userId)
  );
  return users.filter((u) => u.role === 'vendedora' && activeUserIds.has(u.id)).map((u) => u.id);
}
