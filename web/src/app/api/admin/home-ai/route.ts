import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog';
import { appendHomeAiHistory } from '@/lib/homeAiHistory';
import type { HomeSection, Banner } from '@/lib/types';

// Protótipo (combinado com o usuário): a IA monta só a ESTRUTURA da home a
// partir de um prompt — quais blocos, produtos reais escolhidos (id
// validado contra o catálogo, nunca inventado) e posição/tamanho no
// canvas. Banners saem sem mídia (mediaUrl vazio) — a loja insere
// manualmente imagem/vídeo depois, no editor normal (admin/BuilderApp).
// Não grava a home sozinho: devolve o array de HomeSection pra revisão; quem
// persiste é o PUT /api/home-sections já existente. Só grava, à parte, um
// log do prompt+resultado em homeAiHistory.json (ver lib/homeAiHistory.ts),
// pro botão "Histórico" do admin — isso não afeta a home publicada.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const CANVAS_WIDTH = 1200; // mesmo canvas de referência do builder, ver HomeSection em types.ts

interface DraftSection {
  type: 'banner' | 'product';
  title?: string;
  subtitle?: string;
  mediaType?: 'image' | 'video';
  productId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function buildCurrentHomeContext(
  sections: HomeSection[],
  productsById: Map<string, { name: string }>
): string {
  if (!sections || sections.length === 0) return '(a home está vazia, nenhum bloco ainda)';
  return sections
    .map((s, i) => {
      if (s.type === 'banner') {
        const b = s.banners?.[0];
        const kind = b?.type === 'video' ? 'banner (vídeo)' : 'banner (imagem)';
        return `${i + 1}. ${kind} "${b?.title || '(sem título)'}" — x:${s.x ?? 0} y:${s.y ?? 0} w:${s.width ?? 0} h:${s.height ?? 0}`;
      }
      const name = productsById.get(s.productId)?.name || s.productId;
      return `${i + 1}. produto "${name}" (id ${s.productId}) — x:${s.x ?? 0} y:${s.y ?? 0} w:${s.width ?? 0} h:${s.height ?? 0}`;
    })
    .join('\n');
}

function buildSystemPrompt(
  products: { id: string; name: string; category: string; subcategory?: string; price: number; hasImage: boolean }[],
  currentHomeContext: string
): string {
  return `Você monta o layout da home de um catálogo de moda atacado. Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto antes/depois), no formato:
{ "sections": [
  { "type": "banner", "mediaType": "video", "title": "...", "subtitle": "...", "x": 0, "y": 0, "width": 660, "height": 880 },
  { "type": "product", "productId": "<id real da lista abaixo>", "x": 0, "y": 900, "width": 280, "height": 360 }
] }

Regras:
- Canvas de referência tem ${CANVAS_WIDTH}px de largura. x/y/width/height em pixels, sem sobrepor blocos, respeitando a ordem de leitura (topo pra baixo). Se o pedido especificar um tamanho (ex. "660x880"), use exatamente esse width/height no bloco.
- "banner": só estrutura (título/subtítulo opcionais, pode deixar sem título) — "mediaType" é "video" se o pedido falar em vídeo, senão "image" (padrão). NUNCA invente mediaUrl nem descreva a imagem/vídeo em si, quem insere isso é a loja depois, manualmente.
- "product": productId TEM que ser um dos ids da lista de produtos reais abaixo, copiado exatamente. Nunca invente um id novo. Preço e "com/sem foto" na lista servem pra você escolher melhor (ex. "produtos mais baratos", "só com foto") — nunca invente esses dados, use só o que está listado.
- Monte quantos blocos fizerem sentido pro pedido (pode misturar banner e produto, repetir tipos).
- A resposta é SEMPRE a lista COMPLETA final de blocos, nunca só os que mudaram.
  - Se o pedido pede uma mudança pontual sobre o que já existe (trocar/adicionar/remover/mover algo específico), preserve os blocos da home ATUAL que não têm a ver com o pedido, e devolva eles junto dos novos/alterados, na ordem de leitura.
  - Se o pedido descreve uma estrutura nova inteira (ex.: "monta a home com..."), ignore a home atual e comece do zero.

Home ATUAL (o que já está no canvas agora):
${currentHomeContext}

Produtos disponíveis (id | nome | categoria | preço | foto):
${products
    .map(
      (p) =>
        `${p.id} | ${p.name} | ${p.category}${p.subcategory ? ' / ' + p.subcategory : ''} | R$${p.price.toFixed(2)} | ${p.hasImage ? 'com foto' : 'sem foto'}`
    )
    .join('\n')}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'Descreva o que você quer na home.' }, { status: 400, headers: CORS_HEADERS });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY não configurada no ambiente — defina a variável e reinicie o servidor pra ligar o gerador.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  // Luna é o modelo mais barato da família GPT-5.6 (bom o bastante pra
  // montar JSON estruturado a partir de instrução curta) — combinado com
  // o usuário que o custo importa aqui; troque via OPENAI_MODEL se um dia
  // precisar de mais qualidade de raciocínio no layout.
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

  const products = (await getCatalog()).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    price: p.price,
    hasImage: Boolean(p.image || (p.images && p.images.length > 0)),
  }));
  const productsById = new Map(products.map((p) => [p.id, { name: p.name }]));

  // O admin manda o estado ATUAL do canvas (inclui mudanças ainda não
  // salvas) — só cai pro arquivo persistido se por algum motivo o corpo não
  // trouxer nada, nunca o contrário (o canvas em tela é sempre a fonte mais
  // atual do que a vendedora está vendo).
  let currentSections: HomeSection[] = Array.isArray(body?.currentSections) ? body.currentSections : [];
  if (!Array.isArray(body?.currentSections)) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'src/data/homeSections.json'), 'utf-8');
      currentSections = JSON.parse(raw);
    } catch {
      currentSections = [];
    }
  }
  const currentHomeContext = buildCurrentHomeContext(currentSections, productsById);

  let draft: DraftSection[];
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(products, currentHomeContext) },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Falha ao gerar (OpenAI ${res.status}): ${errText}` }, { status: 502, headers: CORS_HEADERS });
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text);
    draft = parsed.sections;
  } catch (err) {
    return NextResponse.json(
      { error: `Não consegui interpretar a resposta da IA: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  if (!Array.isArray(draft)) {
    return NextResponse.json({ error: 'Resposta da IA não veio como lista.' }, { status: 502, headers: CORS_HEADERS });
  }

  // Servidor monta o HomeSection final (ids gerados aqui, nunca confiados
  // ao modelo) e descarta silenciosamente qualquer productId que não bata
  // com o catálogo real — mesmo espírito de nunca deixar dado inventado
  // pela IA virar produto fantasma na home.
  const validProductIds = new Set(products.map((p) => p.id));
  const sections: HomeSection[] = [];
  for (const d of draft) {
    if (d?.type === 'product') {
      if (!d.productId || !validProductIds.has(d.productId)) continue;
      sections.push({
        type: 'product',
        id: randomUUID(),
        productId: d.productId,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
      });
    } else if (d?.type === 'banner') {
      const banner: Banner = { id: randomUUID(), type: d.mediaType === 'video' ? 'video' : 'image', mediaUrl: '', title: d.title, subtitle: d.subtitle };
      sections.push({
        type: 'banner',
        id: randomUUID(),
        banners: [banner],
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
      });
    }
  }

  // Best-effort: se o histórico falhar em gravar (disco, permissão), a
  // geração em si já aconteceu e não deve ser jogada fora por causa disso.
  try {
    await appendHomeAiHistory({ id: randomUUID(), prompt, at: new Date().toISOString(), sections });
  } catch (err) {
    console.error('Falha ao gravar histórico do home-ai:', err);
  }

  return NextResponse.json({ sections }, { headers: CORS_HEADERS });
}
