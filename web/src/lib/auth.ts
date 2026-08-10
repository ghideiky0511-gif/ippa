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
  const raw = await readFile(SESSIONS_PATH, 'utf-8');
  return JSON.parse(raw);
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

export async function verifyLogin(email: string, password: string): Promise<AuthUser | null> {
  const users = await readUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? withoutPasswordHash(user) : null;
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
    passwordHash,
  };
  users.push(user);
  await writeUsers(users);
  return withoutPasswordHash(user);
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
