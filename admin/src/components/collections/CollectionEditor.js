'use client';

import SortableProductRow from './SortableProductRow';
import ProductPicker from './ProductPicker';
import SharePanel from './SharePanel';

export default function CollectionEditor({ collection, products, onUpdate }) {
  const byId = new Map((products || []).map((p) => [p.id, p]));

  function handleLabelChange(e) {
    const label = e.target.value;
    onUpdate((h) => ({ ...h, label }));
  }

  function addProduct(productId) {
    onUpdate((h) => (h.productIds.includes(productId) ? h : { ...h, productIds: [...h.productIds, productId] }));
  }

  function removeProduct(productId) {
    onUpdate((h) => ({ ...h, productIds: h.productIds.filter((id) => id !== productId) }));
  }

  return (
    <main className="collections-editor">
      <div className="field" style={{ maxWidth: 360 }}>
        <label>Nome da coleção</label>
        <input value={collection.label} onChange={handleLabelChange} />
      </div>

      <SharePanel collectionId={collection.id} />

      <h2 className="collections-subheading">
        Produtos ({collection.productIds.length}) — arraste pra reordenar
      </h2>
      <div className="collection-product-list">
        {collection.productIds.map((id) => (
          <SortableProductRow key={id} id={id} product={byId.get(id)} onRemove={removeProduct} />
        ))}
        {collection.productIds.length === 0 && <p className="preview-empty-text">Nenhum produto ainda.</p>}
      </div>

      <ProductPicker products={products} excludeIds={collection.productIds} onAdd={addProduct} />
    </main>
  );
}
