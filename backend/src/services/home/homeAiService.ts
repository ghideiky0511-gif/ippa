import { randomUUID } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Banner, HomeSection, Product } from "@/lib/types";
import type { HomeAiHistoryItem } from "@/contracts/catalog";
import { insertHomeAiHistoryRow, listHomeAiHistoryRows } from "@/models/homeAiModel";
import { listCatalog } from "@/services/catalog";
import { ForbiddenError, ServiceError, ValidationError } from "@/services/shared/errors";

interface DraftSection {
  type: "banner" | "product";
  title?: string;
  subtitle?: string;
  mediaType?: "image" | "video";
  productId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function requireAdministrator(actor: AuthUser): void {
  if (actor.role !== "administrador" || actor.permissions?.adminAccess !== true) throw new ForbiddenError();
}

function currentHome(sections: HomeSection[], productsById: Map<string, Product>): string {
  if (sections.length === 0) return "(a home está vazia)";
  return sections.map((section, index) => section.type === "banner"
    ? `${index + 1}. banner ${section.banners[0]?.title ?? "(sem título)"} — x:${section.x ?? 0} y:${section.y ?? 0} w:${section.width ?? 0} h:${section.height ?? 0}`
    : `${index + 1}. produto ${productsById.get(section.productId)?.name ?? section.productId} (${section.productId}) — x:${section.x ?? 0} y:${section.y ?? 0} w:${section.width ?? 0} h:${section.height ?? 0}`,
  ).join("\n");
}

function systemPrompt(products: Product[], current: string): string {
  return `Monte o layout da home de um catálogo de moda atacado. Responda SOMENTE com JSON válido no formato
{"sections":[{"type":"banner","mediaType":"image","title":"...","subtitle":"...","x":0,"y":0,"width":1200,"height":500},{"type":"product","productId":"<id real>","x":0,"y":520,"width":280,"height":360}]}.
Regras: canvas de 1200px; não sobreponha blocos; banner nunca contém mediaUrl; productId deve vir da lista; devolva sempre a lista completa. Preserve blocos não afetados quando o pedido for pontual.
Home atual:
${current}
Produtos (id | nome | categoria | preço | foto):
${products.map((product) => `${product.id} | ${product.name} | ${product.category}${product.subcategory ? ` / ${product.subcategory}` : ""} | R$${product.price.toFixed(2)} | ${product.image || product.images?.length ? "com foto" : "sem foto"}`).join("\n")}`;
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
    if (item?.type === "product" && item.productId && byId.has(item.productId)) {
      sections.push({
        type: "product", id: randomUUID(), productId: item.productId,
        x: item.x, y: item.y, width: item.width, height: item.height,
      });
    } else if (item?.type === "banner") {
      const banner: Banner = {
        id: randomUUID(), type: item.mediaType === "video" ? "video" : "image",
        mediaUrl: "", title: item.title, subtitle: item.subtitle,
      };
      sections.push({
        type: "banner", id: randomUUID(), banners: [banner],
        x: item.x, y: item.y, width: item.width, height: item.height,
      });
    }
  }
  await withTenantTransaction(tenant, actor, (client) => insertHomeAiHistoryRow(client, prompt, sections));
  return { sections };
}
