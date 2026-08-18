// @ts-nocheck
import { API_BASE } from '@/lib/api-config';

// Porta de entrada do admin para o catálogo público: GET para carregar o
// estado atual da home e PUT para salvar.

export async function fetchHomeSections() {
  const res = await fetch(`${API_BASE}/api/home-sections`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar a home atual.');
  return res.json();
}

export async function saveHomeSections(sections) {
  const res = await fetch(`${API_BASE}/api/home-sections`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sections),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}

// Gera só a ESTRUTURA da home a partir de um prompt (ver POST
// /api/admin/home-ai em web/) — banners voltam sem mídia (mediaUrl vazio),
// a loja arrasta/edita normalmente pra colocar imagem/vídeo depois. Não
// salva sozinho: quem chama decide se joga no canvas (useTemplate) e
// depois clica em Salvar. `currentSections` manda o canvas de AGORA (inclui
// alterações não salvas) — o backend usa isso pra editar em cima do que já
// existe em vez de sempre montar do zero, quando o pedido for uma mudança
// pontual.
export async function generateHomeSections(prompt, currentSections) {
  const res = await fetch(`${API_BASE}/api/admin/home-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentSections }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível gerar a estrutura.');
  return data.sections;
}

// Últimas gerações feitas (prompt + resultado já validado), pro botão
// "Histórico" no admin — ver GET /api/admin/home-ai/history em web/.
export async function fetchHomeAiHistory() {
  const res = await fetch(`${API_BASE}/api/admin/home-ai/history`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar o histórico.');
  const data = await res.json().catch(() => ({}));
  return data.history || [];
}
