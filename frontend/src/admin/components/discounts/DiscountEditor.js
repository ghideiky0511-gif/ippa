'use client';

import ProductPicker from '@/admin/components/collections/ProductPicker';

const TYPE_OPTIONS = [
  { value: 'quantity', label: 'Por quantidade de peças' },
  { value: 'products', label: 'Peças específicas' },
];

function toNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function DiscountEditor({ discount, products, onUpdate }) {
  const byId = new Map((products || []).map((p) => [p.id, p]));

  function handleLabelChange(e) {
    const label = e.target.value;
    onUpdate((d) => ({ ...d, label }));
  }

  function handleTypeChange(e) {
    const type = e.target.value;
    onUpdate((d) => ({ ...d, type }));
  }

  function handleActiveToggle() {
    onUpdate((d) => ({ ...d, active: !d.active }));
  }

  function updateTier(index, field, value) {
    onUpdate((d) => ({
      ...d,
      tiers: d.tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  function addTier() {
    onUpdate((d) => {
      const last = d.tiers[d.tiers.length - 1];
      const minQty = last ? last.minQty + 5 : 10;
      const percent = last ? last.percent + 5 : 10;
      return { ...d, tiers: [...d.tiers, { minQty, percent }] };
    });
  }

  function removeTier(index) {
    onUpdate((d) => ({ ...d, tiers: d.tiers.filter((_, i) => i !== index) }));
  }

  function addProduct(productId) {
    onUpdate((d) => (d.productIds.includes(productId) ? d : { ...d, productIds: [...d.productIds, productId] }));
  }

  function removeProduct(productId) {
    onUpdate((d) => ({ ...d, productIds: d.productIds.filter((id) => id !== productId) }));
  }

  function handlePercentChange(e) {
    const percent = toNumber(e.target.value, discount.percent);
    onUpdate((d) => ({ ...d, percent }));
  }

  return (
    <main className="collections-editor">
      <div className="field-row">
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Nome do desconto</label>
          <input value={discount.label} onChange={handleLabelChange} />
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Tipo de desconto</label>
          <select value={discount.type} onChange={handleTypeChange}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ maxWidth: 100 }}>
          <label>Ativo</label>
          <button
            type="button"
            className={'toggle-switch' + (discount.active ? ' on' : '')}
            onClick={handleActiveToggle}
            aria-pressed={discount.active}
            aria-label={discount.active ? 'Desativar desconto' : 'Ativar desconto'}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      {discount.type === 'quantity' ? (
        <>
          <h2 className="collections-subheading">Faixas de desconto</h2>
          <p className="preview-empty-text">
            Progressivo pela quantidade TOTAL de peças do pedido (somando todas as peças e cores) — quem
            atinge uma faixa recebe aquele desconto sobre o pedido inteiro.
          </p>
          <div className="discount-tiers">
            {discount.tiers.map((tier, i) => (
              <div key={i} className="discount-tier-row">
                <span>acima de</span>
                <input
                  type="number"
                  min="1"
                  value={tier.minQty}
                  onChange={(e) => updateTier(i, 'minQty', toNumber(e.target.value, tier.minQty))}
                />
                <span>peças, aplicar desconto de</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tier.percent}
                  onChange={(e) => updateTier(i, 'percent', toNumber(e.target.value, tier.percent))}
                />
                <span>%</span>
                <button className="btn btn-icon btn-danger" onClick={() => removeTier(i)} title="Remover faixa">
                  ✕
                </button>
              </div>
            ))}
            {discount.tiers.length === 0 && <p className="preview-empty-text">Nenhuma faixa ainda.</p>}
          </div>
          <button className="btn" onClick={addTier}>+ adicionar faixa de desconto</button>
        </>
      ) : (
        <>
          <h2 className="collections-subheading">Peças específicas ({discount.productIds.length})</h2>
          <p className="preview-empty-text">
            Desconto fixo aplicado só nas peças escolhidas abaixo, independente da quantidade do pedido.
          </p>
          <div className="field" style={{ maxWidth: 160 }}>
            <label>Desconto (%)</label>
            <input type="number" min="0" max="100" value={discount.percent} onChange={handlePercentChange} />
          </div>
          <div className="collection-product-list">
            {discount.productIds.map((id) => {
              const p = byId.get(id);
              return (
                <div key={id} className="product-override-row">
                  <img src={p?.image || ''} alt={p?.name || ''} />
                  <div className="product-override-info">
                    <span className="product-item-name">{p?.name || id}</span>
                  </div>
                  <button className="btn btn-icon btn-danger" onClick={() => removeProduct(id)} title="Remover">
                    ✕
                  </button>
                </div>
              );
            })}
            {discount.productIds.length === 0 && <p className="preview-empty-text">Nenhuma peça ainda.</p>}
          </div>
          <ProductPicker products={products} excludeIds={discount.productIds} onAdd={addProduct} />
        </>
      )}
    </main>
  );
}
