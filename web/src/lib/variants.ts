// Uma peça é vendida numa grade fixa de cor x tamanho: cada variante do feed
// já é uma combinação (cor, tamanho) com preço e disponibilidade próprios.
// Este helper monta essa grade completa pra página/quick-view de detalhe,
// incluindo combinações que a peça simplesmente não tem (célula vazia).

export function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

export function buildVariantMatrix(product) {
  const colors = [...(product.colors || [])].sort();
  const sizes = sortSizes(product.sizes || []);
  const byKey = new Map((product.variants || []).map((v) => [`${v.color}|${v.size}`, v]));

  const rows = colors.map((color) => ({
    color,
    cells: sizes.map((size) => byKey.get(`${color}|${size}`) || null),
  }));

  const availableColors = colors.filter((color) =>
    (product.variants || []).some((v) => v.color === color && v.availability === 'in_stock')
  );

  return { colors, sizes, rows, availableColors };
}

export function deliveryLabel(availability) {
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

export function productDeliveryLabel(product) {
  const values = new Set((product.variants || []).map((v) => v.availability));
  if (values.has('in_stock')) return deliveryLabel('in_stock');
  if (values.has('preorder') || values.has('backorder')) return deliveryLabel('preorder');
  if (values.size === 1) return deliveryLabel([...values][0]);
  return 'Sob consulta';
}
