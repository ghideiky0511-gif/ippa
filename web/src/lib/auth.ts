import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { AuthUser } from './types';

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
