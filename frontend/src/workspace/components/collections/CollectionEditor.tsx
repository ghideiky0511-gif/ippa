// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import SortableProductRow from './SortableProductRow';
import ProductPicker from './ProductPicker';
import SharePanel from './SharePanel';

export default function CollectionEditor({ collection, products, onUpdate }) {
  const byId = new Map((products || []).map((p) => [p.id, p]));

  function handleLabelChange(e) {
    const label = e.target.value;
    onUpdate((h) => ({ ...h, label }));
  }

  function handleShowInCatalogChange(e) {
    const showInCatalog = e.target.checked;
    onUpdate((h) => ({ ...h, showInCatalog }));
  }

  function addProduct(productId) {
    onUpdate((h) => (h.productIds.includes(productId) ? h : { ...h, productIds: [...h.productIds, productId] }));
  }

  function removeProduct(productId) {
    onUpdate((h) => ({ ...h, productIds: h.productIds.filter((id) => id !== productId) }));
  }

  return (
    <main className={adminUi.collectionsEditor}>
      <div className={adminUi.field} style={{ maxWidth: 360 }}>
        <label>Nome da coleção</label>
        <input value={collection.label} onChange={handleLabelChange} />
      </div>

      <label className="contents">
        <input type="checkbox" checked={!!collection.showInCatalog} onChange={handleShowInCatalogChange} />
        Mostrar no catálogo (vitrine na barra de coleções)
      </label>

      <SharePanel collectionId={collection.id} />

      <h2 className={adminUi.subheading}>
        Produtos ({collection.productIds.length}) — arraste pra reordenar
      </h2>
      <div className={adminUi.productList}>
        {collection.productIds.map((id) => (
          <SortableProductRow key={id} id={id} product={byId.get(id)} onRemove={removeProduct} />
        ))}
        {collection.productIds.length === 0 && <p className={adminUi.previewEmpty}>Nenhum produto ainda.</p>}
      </div>

      <ProductPicker products={products} excludeIds={collection.productIds} onAdd={addProduct} />
    </main>
  );
}
