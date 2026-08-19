// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import SimilarProductsField from './SimilarProductsField';
import { formatBRL, formatMarkup } from '@/workspace/lib/format';
import { saveProductOverrides } from '@/workspace/lib/productOverridesClient';
import { saveStoreSettings } from '@/workspace/lib/storeSettingsClient';
import { createProduct } from '@/workspace/lib/catalogClient';

function toNumberOrUndefined(raw) {
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function ProductsApp({ products, initialOverrides, initialSettings }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState(initialOverrides || {});
  const [rowSaveState, setRowSaveState] = useState({}); // productId -> 'saving' | 'saved' | 'error'
  const [query, setQuery] = useState('');

  const [defaultMarkupInput, setDefaultMarkupInput] = useState(
    initialSettings?.defaultMarkup != null ? String(initialSettings.defaultMarkup) : ''
  );
  const [defaultMarkupSaveState, setDefaultMarkupSaveState] = useState('idle');
  const [newProduct, setNewProduct] = useState({
    name: '', price: '', category: '', referenceId: '', description: '', image: '', color: '', size: '',
  });
  const [newProductState, setNewProductState] = useState('idle');
  const [newProductError, setNewProductError] = useState('');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return (products || [])
      .filter((p) => {
        const referenceId = overrides[p.id]?.referenceId || '';
        return (p.name || '').toLowerCase().includes(q) || referenceId.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [products, overrides, q]);

  // Sugestões pros datalists de categoria/subcategoria/coleção — juntando o
  // que já existe no catálogo (ERP + overrides salvos) com o que foi digitado
  // nesta sessão mas ainda não salvo, pra já sugerir de volta sem precisar
  // recarregar a página.
  const classificationOptions = useMemo(() => {
    const categories = new Set();
    const subcategories = new Set();
    const collections = new Set();
    for (const p of products || []) {
      if (p.category) categories.add(p.category);
      if (p.subcategory) subcategories.add(p.subcategory);
      if (p.collection) collections.add(p.collection);
    }
    for (const o of Object.values(overrides)) {
      if (o?.category) categories.add(o.category);
      if (o?.subcategory) subcategories.add(o.subcategory);
      if (o?.collection) collections.add(o.collection);
    }
    return {
      categories: Array.from(categories).sort(),
      subcategories: Array.from(subcategories).sort(),
      collections: Array.from(collections).sort(),
    };
  }, [products, overrides]);

  function updateField(id, field, value) {
    setOverrides((prev) => {
      const next = { ...(prev[id] || {}), [field]: value };
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete next[field];
      return { ...prev, [id]: next };
    });
    setRowSaveState((prev) => ({ ...prev, [id]: undefined }));
  }

  function addSimilarProduct(id, field, productId) {
    const current = overrides[id]?.[field] || [];
    if (current.includes(productId)) return;
    updateField(id, field, [...current, productId]);
  }

  function removeSimilarProduct(id, field, productId) {
    const current = overrides[id]?.[field] || [];
    updateField(id, field, current.filter((pid) => pid !== productId));
  }

  async function handleAlterar(id) {
    setRowSaveState((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const cleaned = Object.fromEntries(
        Object.entries(overrides).filter(([, o]) => o && Object.keys(o).length > 0)
      );
      await saveProductOverrides(cleaned);
      setOverrides(cleaned);
      setRowSaveState((prev) => ({ ...prev, [id]: 'saved' }));
    } catch {
      setRowSaveState((prev) => ({ ...prev, [id]: 'error' }));
    }
  }

  async function handleApplyDefaultMarkup() {
    setDefaultMarkupSaveState('saving');
    try {
      const defaultMarkup = toNumberOrUndefined(defaultMarkupInput);
      await saveStoreSettings(defaultMarkup ? { defaultMarkup } : {});
      setDefaultMarkupSaveState('saved');
    } catch {
      setDefaultMarkupSaveState('error');
    }
  }

  function updateNewProduct(field, value) {
    setNewProduct((current) => ({ ...current, [field]: value }));
    setNewProductState('idle');
    setNewProductError('');
  }

  async function handleCreateProduct(event) {
    event.preventDefault();
    const price = Number(newProduct.price);
    if (!newProduct.name.trim() || !Number.isFinite(price) || price < 0) {
      setNewProductError('Informe nome e preço de atacado igual ou maior que zero.');
      return;
    }
    if ((newProduct.color.trim() && !newProduct.size.trim()) || (!newProduct.color.trim() && newProduct.size.trim())) {
      setNewProductError('Preencha cor e tamanho juntos, ou deixe ambos em branco.');
      return;
    }
    setNewProductState('saving');
    setNewProductError('');
    try {
      await createProduct({
        name: newProduct.name,
        price,
        category: newProduct.category || undefined,
        referenceId: newProduct.referenceId || undefined,
        description: newProduct.description || undefined,
        image: newProduct.image || undefined,
        variant: newProduct.color && newProduct.size
          ? { color: newProduct.color, size: newProduct.size }
          : undefined,
      });
      setNewProduct({ name: '', price: '', category: '', referenceId: '', description: '', image: '', color: '', size: '' });
      setNewProductState('saved');
      router.refresh();
    } catch (error) {
      setNewProductState('error');
      setNewProductError(error instanceof Error ? error.message : 'Não foi possível cadastrar o produto.');
    }
  }

  return (
    <div className="products-page">
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Produtos</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <form className={`${adminUi.defaultMarkup} grid gap-3`} onSubmit={handleCreateProduct}>
          <div>
            <h2 className="text-base font-bold">Adicionar produto ao catálogo</h2>
            <p className={adminUi.hint}>Cadastre o básico agora. A grade e o estoque podem ser configurados depois.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className={adminUi.field}>
              <label>Nome *</label>
              <input value={newProduct.name} onChange={(e) => updateNewProduct('name', e.target.value)} required />
            </div>
            <div className={adminUi.field}>
              <label>Preço de atacado *</label>
              <input type="number" step="0.01" min="0" value={newProduct.price} onChange={(e) => updateNewProduct('price', e.target.value)} required />
            </div>
            <div className={adminUi.field}>
              <label>Referência (REF)</label>
              <input value={newProduct.referenceId} onChange={(e) => updateNewProduct('referenceId', e.target.value)} placeholder="Único por loja" />
            </div>
            <div className={adminUi.field}>
              <label>Categoria</label>
              <input list="classification-categories" value={newProduct.category} onChange={(e) => updateNewProduct('category', e.target.value)} placeholder="Sem categoria" />
            </div>
            <div className={adminUi.field}>
              <label>Cor da primeira variante</label>
              <input value={newProduct.color} onChange={(e) => updateNewProduct('color', e.target.value)} placeholder="Ex.: Preto" />
            </div>
            <div className={adminUi.field}>
              <label>Tamanho da primeira variante</label>
              <input value={newProduct.size} onChange={(e) => updateNewProduct('size', e.target.value)} placeholder="Ex.: M" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className={adminUi.field}>
              <label>URL da imagem</label>
              <input type="url" value={newProduct.image} onChange={(e) => updateNewProduct('image', e.target.value)} placeholder="https://..." />
            </div>
            <div className={adminUi.field}>
              <label>Descrição</label>
              <input value={newProduct.description} onChange={(e) => updateNewProduct('description', e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={adminUi.primaryButton} disabled={newProductState === 'saving'}>
              {newProductState === 'saving' ? 'Cadastrando…' : 'Adicionar produto'}
            </button>
            {newProductState === 'saved' && <span className={adminUi.status}>Produto adicionado ao catálogo.</span>}
            {newProductError && <span className="text-[13px] text-red-700">{newProductError}</span>}
          </div>
        </form>
        <p className={adminUi.previewEmpty}>
          Código, preço sugerido de revenda e markup são dados opcionais da loja — quando o Bippa/ERP mandar
          esses campos direto no catálogo, eles aparecem sozinhos; o que for editado aqui tem prioridade sobre
          o dado do ERP. O chip de markup no catálogo só aparece com o preço sugerido preenchido (por aqui,
          pelo markup padrão abaixo, ou pelo ERP), e só se a loja tiver essa funcionalidade ligada em{' '}
          <code>CONFIG.features.suggestedPrice</code>.
        </p>
        <p className={adminUi.previewEmpty}>
          Categoria e subcategoria já vêm do ERP, mas podem ser corrigidas aqui — a edição tem prioridade sobre
          o que foi importado. Coleção não tem origem no ERP: fica em branco pra peças atemporais (vendem o ano
          todo) e só é preenchida pra marcar uma peça própria de uma época, ex. &quot;Verão 2027&quot;.
        </p>

        <div className={adminUi.defaultMarkup}>
          <div className={adminUi.field} style={{ maxWidth: 200 }}>
            <label>Markup sugerido padrão (todas as peças)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={defaultMarkupInput}
              onChange={(e) => {
                setDefaultMarkupInput(e.target.value);
                setDefaultMarkupSaveState('idle');
              }}
              placeholder="ex.: 2.3"
            />
          </div>
          <button
            className={adminUi.primaryButton}
            onClick={handleApplyDefaultMarkup}
            disabled={defaultMarkupSaveState === 'saving'}
          >
            {defaultMarkupSaveState === 'saving' ? 'Aplicando…' : 'Aplicar a todas as peças'}
          </button>
          {defaultMarkupSaveState === 'saved' && <span className={adminUi.status}>Aplicado</span>}
          {defaultMarkupSaveState === 'error' && <span className={adminUi.status}>Erro ao salvar</span>}
        </div>
        <p className={adminUi.previewEmpty}>
          Vale só pra peça sem preço sugerido/markup próprio (nem do ERP, nem editado abaixo). Pra uma peça
          específica ficar diferente do padrão, busque ela abaixo e altere direto — a edição da peça sempre
          tem prioridade sobre o padrão.
        </p>

        <div className={adminUi.field} style={{ maxWidth: 360 }}>
          <label>Buscar produto</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou código..." />
        </div>

        <datalist id="classification-categories">
          {classificationOptions.categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="classification-subcategories">
          {classificationOptions.subcategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="classification-collections">
          {classificationOptions.collections.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className={adminUi.overridesList}>
          {results.map((p) => {
            const o = overrides[p.id] || {};
            const state = rowSaveState[p.id];
            return (
              <div key={p.id} className={adminUi.overrideCard}>
                <div className={adminUi.overrideRow}>
                  <img src={p.image || ''} alt={p.name} />
                  <div className={adminUi.productInfo}>
                    <span className={adminUi.productName}>{p.name}</span>
                    <span className={adminUi.productPrice}>Atacado: {formatBRL(p.price)}</span>
                  </div>
                  <div className={adminUi.field}>
                    <label>Referência</label>
                    <input
                      value={o.referenceId ?? ''}
                      onChange={(e) => updateField(p.id, 'referenceId', e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className={adminUi.field}>
                    <label>Preço sugerido</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={o.suggestedRetailPrice ?? ''}
                      onChange={(e) => updateField(p.id, 'suggestedRetailPrice', toNumberOrUndefined(e.target.value))}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className={adminUi.field}>
                    <label>Markup {p.markup ? `(${formatMarkup(p.markup)} hoje)` : ''}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={o.markup ?? ''}
                      onChange={(e) => updateField(p.id, 'markup', toNumberOrUndefined(e.target.value))}
                      placeholder="Auto"
                    />
                  </div>
                  <div className={adminUi.overrideActions}>
                    <button className={adminUi.primaryButton} onClick={() => handleAlterar(p.id)} disabled={state === 'saving'}>
                      {state === 'saving' ? 'Alterando…' : 'Alterar'}
                    </button>
                    {state === 'saved' && <span className={adminUi.status}>Alterado</span>}
                    {state === 'error' && <span className={adminUi.status}>Erro</span>}
                  </div>
                </div>
                <div className="contents">
                  <div className={adminUi.field}>
                    <label>Categoria</label>
                    <input
                      list="classification-categories"
                      value={o.category ?? p.category ?? ''}
                      onChange={(e) => updateField(p.id, 'category', e.target.value)}
                      placeholder="Categoria do ERP"
                    />
                  </div>
                  <div className={adminUi.field}>
                    <label>Subcategoria</label>
                    <input
                      list="classification-subcategories"
                      value={o.subcategory ?? p.subcategory ?? ''}
                      onChange={(e) => updateField(p.id, 'subcategory', e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className={adminUi.field}>
                    <label>Coleção</label>
                    <input
                      list="classification-collections"
                      value={o.collection ?? p.collection ?? ''}
                      onChange={(e) => updateField(p.id, 'collection', e.target.value)}
                      placeholder="Vazio = atemporal"
                    />
                  </div>
                </div>
                <SimilarProductsField
                  label="Produtos similares — quick-view"
                  productIds={o.similarProductIdsQuickview || []}
                  allProducts={products}
                  onAdd={(id) => addSimilarProduct(p.id, 'similarProductIdsQuickview', id)}
                  onRemove={(id) => removeSimilarProduct(p.id, 'similarProductIdsQuickview', id)}
                />
                <SimilarProductsField
                  label="Produtos similares — carrinho"
                  productIds={o.similarProductIdsCart || []}
                  allProducts={products}
                  onAdd={(id) => addSimilarProduct(p.id, 'similarProductIdsCart', id)}
                  onRemove={(id) => removeSimilarProduct(p.id, 'similarProductIdsCart', id)}
                />
              </div>
            );
          })}
          {q && results.length === 0 && <p className={adminUi.previewEmpty}>Nenhum produto encontrado.</p>}
          {!q && <p className={adminUi.previewEmpty}>Busque um produto pra editar código, preço sugerido ou markup.</p>}
        </div>
      </main>
    </div>
  );
}
