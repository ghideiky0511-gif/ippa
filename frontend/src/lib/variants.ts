// Uma peça é vendida numa grade fixa de cor x tamanho: cada variante do feed
// já é uma combinação (cor, tamanho) com preço e disponibilidade próprios.
// Este helper monta essa grade completa pra página/quick-view de detalhe,
// incluindo combinações que a peça simplesmente não tem (célula vazia).

import type { Availability, Product, Variant } from './types';

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

export interface VariantMatrixRow {
  color: string;
  cells: (Variant | null)[];
}

export interface VariantMatrix {
  colors: string[];
  sizes: string[];
  rows: VariantMatrixRow[];
  availableColors: string[];
}

export function buildVariantMatrix(product: Product): VariantMatrix {
  const colors = [...(product.colors || [])].sort();
  const sizes = sortSizes(product.sizes || []);
  const variants = product.variants || [];
  const byKey = new Map(variants.map((v) => [`${v.color}|${v.size}`, v]));

  // Um produto pode não declarar um dos eixos (ex: peça única sem grade de
  // cor). Sem isso, colors.map/sizes.map sobre [] descartaria a variante
  // inteira — projeta o eixo ausente numa chave vazia pra ela não sumir.
  const rowKeys = colors.length > 0 ? colors : [''];
  const cellKeys = sizes.length > 0 ? sizes : [''];

  const rows = rowKeys.map((color) => ({
    color,
    cells: cellKeys.map((size) => byKey.get(`${color}|${size}`) || null),
  }));

  const availableColors = colors.filter((color) =>
    variants.some((v) => v.color === color && v.availability === 'in_stock')
  );

  return { colors, sizes, rows, availableColors };
}

/** Eixos de variação que um produto pode declarar. Hoje só cor e tamanho
 *  existem no contrato (Product.colors / Product.sizes); o union fica aberto
 *  pra receber eixos de outros negócios (voltagem, sabor) sem virar enum. */
export type VariantAxis = 'color' | 'size';

export type VariantShapeKind = 'single' | 'single-axis' | 'grid';

export interface VariantShape {
  /** 0 eixos declarados = single; 1 eixo = single-axis; 2+ = grid. */
  kind: VariantShapeKind;
  /** Eixos DECLARADOS (com pelo menos um valor), na ordem canônica. */
  axes: VariantAxis[];
}

function shapeFromAxes(axes: VariantAxis[]): VariantShape {
  const kind: VariantShapeKind = axes.length === 0 ? 'single' : axes.length === 1 ? 'single-axis' : 'grid';
  return { kind, axes };
}

// Classifica a forma da grade pelos eixos DECLARADOS do produto (colors/
// sizes), ignorando disponibilidade — a forma de uma peça não muda quando o
// estoque zera, só as células mudam de estado. Por isso não olha
// variants[].availability.
//
// Pack (backend/src/contracts/products.ts, scope 'grade'|'pack') não é um
// eixo de variação — é um bundle fechado, ortogonal aos eixos. Quando ganhar
// fluxo de compra próprio, o caminho é um VariantShapeKind 'pack' adicional
// checado ANTES dos eixos aqui, não um terceiro eixo nesta lista.
export function getVariantShape(product: Product): VariantShape {
  const axes: VariantAxis[] = [];
  if ((product.colors || []).length > 0) axes.push('color');
  if ((product.sizes || []).length > 0) axes.push('size');
  return shapeFromAxes(axes);
}

/** Equivalente a getVariantShape, mas a partir de um VariantMatrix já
 *  montado — pra quem só tem o matrix em mãos (ex: telas admin) e não quer
 *  importar o tipo Product só pra derivar a forma. */
export function shapeFromMatrix(matrix: VariantMatrix): VariantShape {
  const axes: VariantAxis[] = [];
  if (matrix.colors.length > 0) axes.push('color');
  if (matrix.sizes.length > 0) axes.push('size');
  return shapeFromAxes(axes);
}

// Disponibilidades que podem ser adicionadas ao carrinho (out_of_stock e
// combinações inexistentes ficam de fora) — usado tanto na grade do
// quick-view/página de produto (ProductDetailContent.tsx) quanto na grade
// inline do carrinho (CartRows.tsx), pra não duplicar a mesma lista.
export const ADDABLE_AVAILABILITY = new Set<Availability>(['in_stock', 'preorder', 'backorder']);

// Células de UMA cor que podem ser adicionadas ao carrinho — a projeção que
// a página do carrinho usa quando a cor da linha já está escolhida (recorte
// de tela, não a forma do produto: o produto pode ser 'grid' inteiro).
export function addableCellsForColor(matrix: VariantMatrix, color: string): { size: string; cell: Variant }[] {
  const row = matrix.rows.find((r) => r.color === color);
  if (!row) return [];
  return matrix.sizes
    .map((size, i) => ({ size, cell: row.cells[i] }))
    .filter((entry): entry is { size: string; cell: Variant } => !!entry.cell && ADDABLE_AVAILABILITY.has(entry.cell.availability));
}

export function deliveryLabel(availability?: Availability): string {
  switch (availability) {
    case 'in_stock':
      return 'Pronta entrega';
    case 'preorder':
    case 'backorder':
      return 'Pré-venda';
    case 'out_of_stock':
      return 'Esgotado';
    default:
      return 'Sob consulta';
  }
}

// Divide uma quantidade escolhida entre "dentro do estoque" e "excedente"
// (o que vira encomenda/backorder), a partir do stockQty da variante. Sem
// stockQty (ERP não manda ainda), tudo é tratado como dentro do estoque —
// mesmo comportamento de hoje, sem limite.
export function splitStockQty(qty: number, stockQty?: number): { inStock: number; excess: number } {
  if (stockQty === undefined || stockQty === null) return { inStock: qty, excess: 0 };
  const inStock = Math.min(qty, Math.max(0, stockQty));
  return { inStock, excess: Math.max(0, qty - inStock) };
}

export function productDeliveryLabel(product: Product): string {
  const values = new Set((product.variants || []).map((v) => v.availability));
  if (values.has('in_stock')) return deliveryLabel('in_stock');
  if (values.has('preorder') || values.has('backorder')) return deliveryLabel('preorder');
  if (values.size === 1) return deliveryLabel([...values][0]);
  return 'Sob consulta';
}
