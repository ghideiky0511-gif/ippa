import { randomUUID } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Banner, HomeSection, Product } from "@/lib/types";
import type { HomeAiHistoryItem } from "@/contracts/catalog";
import { insertHomeAiHistoryRow, listHomeAiHistoryRows } from "@/models/homeAiModel";
import { listCatalog } from "@/services/catalog";
import { ForbiddenError, ServiceError, ValidationError } from "@/services/shared/errors";
import { productClassificationSummary } from "@/lib/catalogFacets";

// Larguras de referência de cada modo de visualização do editor da home
// (ver HOME_CANVAS_WIDTH em web/src/lib/homeLayout.ts). O layout do topo da
// section é o de desktop; `tablet`/`mobile` são ajustes por breakpoint.
const DEVICE_CANVAS = { desktop: 1200, tablet: 820, mobile: 390 } as const;

interface DraftLayout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface DraftSection extends DraftLayout {
  type: "banner" | "product";
  title?: string;
  subtitle?: string;
  mediaType?: "image" | "video";
  productId?: string;
  // Enquadramento do bloco em cada modo de visualização. Ausente = o site
  // reduz o desktop proporcionalmente.
  tablet?: DraftLayout;
  mobile?: DraftLayout;
  // Só banner: largura total (borda a borda) e hero de altura da tela.
  fullBleed?: boolean;
  fullHeight?: boolean;
}

function requireAdministrator(actor: AuthUser): void {
  if (actor.role !== "administrador" || actor.permissions?.adminAccess !== true) throw new ForbiddenError();
}

/** Só os campos numéricos finitos de um layout — undefined se nada sobrar. */
function pickLayout(value: unknown): DraftLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const out: DraftLayout = {};
  for (const key of ["x", "y", "width", "height"] as const) {
    const n = source[key];
    if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function describeLayout(layout: { x?: number; y?: number; width?: number; height?: number }): string {
  return `x:${layout.x ?? 0} y:${layout.y ?? 0} w:${layout.width ?? 0} h:${layout.height ?? 0}`;
}

function currentHome(sections: HomeSection[], productsById: Map<string, Product>): string {
  if (sections.length === 0) return "(a home está vazia)";
  return sections.map((section, index) => {
    const label = section.type === "banner"
      ? `banner ${section.banners[0]?.title ?? "(sem título)"}${section.fullBleed ? " [largura total]" : ""}`
      : `produto ${productsById.get(section.productId)?.name ?? section.productId} (${section.productId})`;
    const layouts = [
      `desktop ${describeLayout(section)}`,
      section.tablet ? `tablet ${describeLayout(section.tablet)}` : "tablet (auto)",
      section.mobile ? `celular ${describeLayout(section.mobile)}` : "celular (auto)",
    ].join(" | ");
    return `${index + 1}. ${label} — ${layouts}`;
  }).join("\n");
}

function systemPrompt(products: Product[], current: string): string {
  return `Monte o layout da home de um catálogo de moda atacado. Responda SOMENTE com JSON válido no formato
{"sections":[{"type":"banner","mediaType":"image","title":"...","subtitle":"...","x":0,"y":0,"width":1200,"height":500,"fullBleed":false,"tablet":{"x":0,"y":0,"width":820,"height":360},"mobile":{"x":0,"y":0,"width":390,"height":220}},{"type":"product","productId":"<id real>","x":0,"y":520,"width":280,"height":360,"tablet":{"x":0,"y":380,"width":260,"height":330},"mobile":{"x":20,"y":240,"width":350,"height":440}}]}.

MODOS DE VISUALIZAÇÃO (devices): a loja monta 3 layouts por bloco, um por tamanho de tela.
- desktop: canvas de ${DEVICE_CANVAS.desktop}px de largura — vai no x/y/width/height do topo do bloco.
- tablet: canvas de ${DEVICE_CANVAS.tablet}px — vai no objeto "tablet":{x,y,width,height}.
- celular: canvas de ${DEVICE_CANVAS.mobile}px — vai no objeto "mobile":{x,y,width,height}.
Se "tablet"/"mobile" não vierem, o site apenas reduz o desktop proporcionalmente — funciona, mas quase sempre dá pra enquadrar melhor à mão.

REGRA PRINCIPAL: gere SEMPRE os 3 layouts de cada bloco, enquadrando cada um da melhor forma pra aquele tamanho:
- celular (390px): empilhe os blocos numa coluna só, largura ~350–390, um embaixo do outro, sem sobreposição; banners mais baixos.
- tablet (820px): normalmente 2 colunas de produtos; aproveite a largura sem apertar.
- desktop (1200px): layout mais espaçoso, pode ter 3–4 colunas.
EXCEÇÃO: se o pedido da loja falar de um device específico ("só no celular", "ajuste o tablet", "no desktop..."), mexa APENAS naquele layout e preserve os outros exatamente como estão na home atual.

Outras regras: não sobreponha blocos DENTRO de cada layout; coordenadas de cada layout respeitam a largura do seu canvas (${DEVICE_CANVAS.desktop}/${DEVICE_CANVAS.tablet}/${DEVICE_CANVAS.mobile}); banner nunca contém mediaUrl; productId deve vir da lista; devolva sempre a lista completa de blocos. Preserve blocos e layouts não afetados quando o pedido for pontual.
Banner pode ter "fullBleed":true (ocupa toda a largura da tela, borda a borda) e, junto, "fullHeight":true (hero da altura da tela) — use quando pedirem um banner "grande", "tela cheia", "hero" ou "de destaque".
Home atual:
${current}
Produtos (id | nome | categoria | preço | foto):
${products.map((product) => `${product.id} | ${product.name} | ${productClassificationSummary(product) || "sem categoria"} | R$${product.price.toFixed(2)} | ${product.image || product.images?.length ? "com foto" : "sem foto"}`).join("\n")}`;
}

export async function homeAiHistory(tenant: Tenant, actor: AuthUser): Promise<HomeAiHistoryItem[]> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, async (client) => (await listHomeAiHistoryRows(client)).map((row) => ({
    id: row.id, prompt: row.prompt, at: row.created_at.toISOString(), sections: row.sections,
  })));
}

export async function generateHome(
  tenant: Tenant,
  actor: AuthUser,
  body: { prompt?: unknown; currentSections?: unknown },
): Promise<{ sections: HomeSection[] }> {
  requireAdministrator(actor);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new ValidationError("PROMPT_REQUIRED");
  if (!process.env.OPENAI_API_KEY) throw new ServiceError("OPENAI_NOT_CONFIGURED", 500);
  const products = await listCatalog(tenant);
  const byId = new Map(products.map((product) => [product.id, product]));
  const currentSections = Array.isArray(body.currentSections) ? body.currentSections as HomeSection[] : [];

  let draft: DraftSection[];
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(products, currentHome(currentSections, byId)) },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new ServiceError("HOME_AI_PROVIDER_ERROR", 502, await response.text());
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
    if (!Array.isArray(parsed.sections)) throw new Error("Resposta sem sections");
    draft = parsed.sections;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("HOME_AI_INVALID_RESPONSE", 502, error instanceof Error ? error.message : String(error));
  }

  const sections: HomeSection[] = [];
  for (const item of draft) {
    const tablet = pickLayout(item?.tablet);
    const mobile = pickLayout(item?.mobile);
    if (item?.type === "product" && item.productId && byId.has(item.productId)) {
      sections.push({
        type: "product", id: randomUUID(), productId: item.productId,
        x: item.x, y: item.y, width: item.width, height: item.height,
        ...(tablet ? { tablet } : {}),
        ...(mobile ? { mobile } : {}),
      });
    } else if (item?.type === "banner") {
      const banner: Banner = {
        id: randomUUID(), type: item.mediaType === "video" ? "video" : "image",
        mediaUrl: "", title: item.title, subtitle: item.subtitle,
      };
      sections.push({
        type: "banner", id: randomUUID(), banners: [banner],
        x: item.x, y: item.y, width: item.width, height: item.height,
        ...(tablet ? { tablet } : {}),
        ...(mobile ? { mobile } : {}),
        ...(item.fullBleed ? { fullBleed: true } : {}),
        ...(item.fullBleed && item.fullHeight ? { fullHeight: true } : {}),
      });
    }
  }
  await withTenantTransaction(tenant, actor, (client) => insertHomeAiHistoryRow(client, prompt, sections));
  return { sections };
}
