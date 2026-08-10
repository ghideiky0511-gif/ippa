import { readFile } from 'node:fs/promises';
import path from 'node:path';
import rawCatalog from '@/data/catalog.json';
import type { Product } from './types';

export const catalog = rawCatalog as unknown as Product[];

type ProductOverride = Partial<
  Pick<Product, 'sku' | 'suggestedRetailPrice' | 'markup' | 'similarProductIdsQuickview' | 'similarProductIdsCart'>
>;

interface StoreSettings {
  // Markup sugerido padrão (ex. 2.3) aplicado a toda peça que não tenha
  // preço sugerido/markup próprio (nem do ERP, nem editado em /produtos) —
  // editável em /produtos (GET/PUT /api/store-settings). Uma peça com
  // override próprio (ou dado vindo do ERP) nunca é afetada por esse valor.
  defaultMarkup?: number;
  // Liga/desliga de ferramentas opcionais do catálogo, editável em
  // /ferramentas (GET/PUT /api/store-settings). Cada chave é o id de uma
  // ferramenta (ver TOOLS em admin/src/components/tools/ToolsApp.js);
  // ausente = ligada (comportamento padrão de quando a ferramenta foi
  // construída). Uma ferramenta desligada some do catálogo mesmo quando o
  // produto tem o dado preenchido — ver stripDisabledFeatures abaixo.
  features?: Record<string, boolean>;
}

function applyDefaultMarkup(product: Product, defaultMarkup: number | undefined): Product {
  if (!defaultMarkup || product.suggestedRetailPrice !== undefined || product.markup !== undefined) {
    return product;
  }
  return {
    ...product,
    suggestedRetailPrice: Math.round(product.price * defaultMarkup * 100) / 100,
    markup: defaultMarkup,
  };
}

function stripDisabledFeatures(product: Product, features: Record<string, boolean> | undefined): Product {
  if (features?.suggestedPrice === false) {
    const { suggestedRetailPrice, markup, ...rest } = product;
    return rest as Product;
  }
  return product;
}

// Ordem customizada da grade de /catalogo (todos os cards do mesmo tamanho,
// só posição é editável — ver /catalogo na plataforma admin, arrastar em
// qualquer direção pra reordenar, GET/PUT /api/catalog-order). Produtos
// fora de `order` (ex. recém-chegados do ERP, ainda não posicionados)
// aparecem depois, na ordem relativa natural do catalog.json.
function applyCatalogOrder(products: Product[], order: string[]): Product[] {
  if (order.length === 0) return products;
  const rank = new Map(order.map((id, i) => [id, i]));
  const ordered: Product[] = [];
  const rest: Product[] = [];
  for (const p of products) {
    (rank.has(p.id) ? ordered : rest).push(p);
  }
  ordered.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...ordered, ...rest];
}

// Enriquecimento manual por produto (código, preço sugerido, markup),
// markup sugerido padrão da loja, liga/desliga de ferramentas opcionais e
// ordem customizada da grade — editáveis pela plataforma admin em
// /produtos, /ferramentas e /catalogo (GET/PUT em /api/product-overrides,
// /api/store-settings e /api/catalog-order) — dado da loja, não do ERP.
// Mesclado por cima do catalog.json em tempo de request, então uma edição
// salva no admin aparece aqui sem rebuild (mesmo padrão de
// homeSections/highlights). Prioridade por produto: override próprio >
// dado do ERP (já no catalog.json) > markup padrão da loja — e por cima de
// tudo isso, uma ferramenta desligada some independente da prioridade.
export async function getCatalog(): Promise<Product[]> {
  const [overridesRaw, settingsRaw, orderRaw] = await Promise.all([
    readFile(path.join(process.cwd(), 'src/data/productOverrides.json'), 'utf-8'),
    readFile(path.join(process.cwd(), 'src/data/storeSettings.json'), 'utf-8'),
    readFile(path.join(process.cwd(), 'src/data/catalogOrder.json'), 'utf-8'),
  ]);
  const overrides: Record<string, ProductOverride> = JSON.parse(overridesRaw);
  const settings: StoreSettings = JSON.parse(settingsRaw);
  const order: string[] = JSON.parse(orderRaw);

  const merged = catalog.map((p) => {
    const withOverride = overrides[p.id] ? { ...p, ...overrides[p.id] } : p;
    const withDefault = applyDefaultMarkup(withOverride, settings.defaultMarkup);
    return stripDisabledFeatures(withDefault, settings.features);
  });

  return applyCatalogOrder(merged, order);
}
