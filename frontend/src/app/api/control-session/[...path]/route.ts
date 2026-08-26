import { NextRequest, NextResponse } from 'next/server';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { API_BASE } from '@/lib/api-config';

const COOKIE_NAME = 'ippa_control_session';
const VESTI_IMPORT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * O `fetch`/Undici encerra chamadas sem headers após cerca de cinco minutos.
 * Importar uma galeria Vesti grande pode ultrapassar esse tempo, embora o
 * backend continue trabalhando e conclua com sucesso. Esta rota de Control
 * usa o cliente HTTP nativo só nesse caso, com limite explícito de 15 min.
 */
async function fetchVestiImport(url: string, headers: Headers): Promise<Response> {
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const upstream = request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: Object.fromEntries(headers.entries()),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 502,
        headers: response.headers as HeadersInit,
      })));
    });
    upstream.setTimeout(VESTI_IMPORT_TIMEOUT_MS, () => {
      upstream.destroy(new Error('VESTI_IMPORT_TIMEOUT'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (contentType) headers.set('content-type', contentType);
  if (token) headers.set('authorization', `Bearer ${token}`);

  const backendUrl = `${API_BASE}/api/control/${path.join('/')}`;
  const isVestiImport = request.method === 'POST'
    && path.length === 3
    && path[0] === 'tenants'
    && path[2] === 'vesti-import';
  const response = isVestiImport
    ? await fetchVestiImport(backendUrl, headers)
    : await fetch(backendUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      cache: 'no-store',
    });
  const payload = await response.text();
  const result = new NextResponse(payload, {
    status: response.status,
    headers: response.headers.get('content-type') ? { 'content-type': response.headers.get('content-type')! } : undefined,
  });

  if (path.join('/') === 'auth/login' && response.ok) {
    const token = (JSON.parse(payload) as { token?: string }).token;
    if (token) result.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  if (path.join('/') === 'auth/logout') result.cookies.delete(COOKIE_NAME);
  return result;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
