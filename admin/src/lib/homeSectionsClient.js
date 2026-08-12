// web/ e admin/ rodam como dois apps separados (portas diferentes em dev).
// Esta é a única porta de entrada do admin pro catálogo público: GET pra
// carregar o estado atual da home, PUT pra salvar.
const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

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
// depois clica em Salvar.
export async function generateHomeSections(prompt) {
  const res = await fetch(`${API_BASE}/api/admin/home-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível gerar a estrutura.');
  return data.sections;
}
