'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CircleX, LoaderCircle, LockKeyhole, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from '@/components/TenantLink';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProductVariantMatrix } from '@/components/ui/product-variant-matrix';
import type { ProductAdmin, UpdateManualProductInput } from '@/domain/products/types';
import { buildVariantMatrix, deliveryLabel } from '@/lib/variants';
import { productClassificationSummary } from '@/lib/classifications';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { refreshProductFromErp, updateManualProduct } from '@/workspace/lib/catalogClient';
import SimilarProductsField from './SimilarProductsField';
import { fetchClassifications } from '@/workspace/lib/classificationsClient';
import type { ClassificationEntry } from '@/domain/catalog/types';

type DraftVariant = { id?: string; color: string; size: string; price: string; availability: 'in_stock' | 'preorder' | 'backorder' | 'out_of_stock'; classificationIds: string[] };

function money(value?: number) {
  return value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function sourceLabel(source: ProductAdmin['sourceOrigin']) {
  return source === 'erp' ? 'Sincronizado pelo ERP' : source === 'bootstrap' ? 'Importado' : 'Cadastro manual';
}

function valueOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function DetailValue({ label, value }: { label: string; value?: string | number }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm text-foreground">{value === undefined || value === '' ? 'Não informado' : value}</p></div>;
}

export default function ProductDetailApp({ initialProduct, allProducts, erpIntegrationActive }: { initialProduct: ProductAdmin; allProducts: ProductAdmin[]; erpIntegrationActive: boolean }) {
  const [product, setProduct] = useState(initialProduct);
  const readOnly = product.sourceOrigin === 'erp';
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [referenceId, setReferenceId] = useState(product.referenceId ?? '');
  const [price, setPrice] = useState(String(product.price));
  const [suggestedRetailPrice, setSuggestedRetailPrice] = useState(product.suggestedRetailPrice?.toString() ?? '');
  const [markup, setMarkup] = useState(product.markup?.toString() ?? '');
  const [image, setImage] = useState(product.image ?? '');
  const [gallery, setGallery] = useState((product.images ?? []).join('\n'));
  const [videoUrl, setVideoUrl] = useState(product.videoUrl ?? '');
  const [variants, setVariants] = useState<DraftVariant[]>(product.variants.map((variant) => ({ id: variant.id, color: variant.color, size: variant.size, price: String(variant.price), availability: variant.availability, classificationIds: variant.classifications.map((classification) => classification.id) })));
  const [classifications, setClassifications] = useState<ClassificationEntry[]>([]);
  const [quickviewIds, setQuickviewIds] = useState(product.similarProductIdsQuickview ?? []);
  const [cartIds, setCartIds] = useState(product.similarProductIdsCart ?? []);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSucceeded, setRefreshSucceeded] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const galleryUrls = useMemo(() => gallery.split('\n').map((url) => url.trim()).filter(Boolean), [gallery]);
  const canRefreshFromErp = erpIntegrationActive && Boolean(product.referenceId) && (product.sourceOrigin === 'erp' || product.sourceOrigin === 'bootstrap');

  useEffect(() => { void fetchClassifications().then(setClassifications).catch(() => {}); }, []);

  function applyProduct(updated: ProductAdmin) {
    setProduct(updated);
    setName(updated.name);
    setDescription(updated.description);
    setReferenceId(updated.referenceId ?? '');
    setPrice(String(updated.price));
    setSuggestedRetailPrice(updated.suggestedRetailPrice?.toString() ?? '');
    setMarkup(updated.markup?.toString() ?? '');
    setImage(updated.image ?? '');
    setGallery((updated.images ?? []).join('\n'));
    setVideoUrl(updated.videoUrl ?? '');
    setVariants(updated.variants.map((variant) => ({ id: variant.id, color: variant.color, size: variant.size, price: String(variant.price), availability: variant.availability, classificationIds: variant.classifications.map((classification) => classification.id) })));
    setQuickviewIds(updated.similarProductIdsQuickview ?? []);
    setCartIds(updated.similarProductIdsCart ?? []);
  }

  function updateVariant(index: number, change: Partial<DraftVariant>) {
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...change } : variant));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const numericPrice = Number(price);
    const numericSuggested = suggestedRetailPrice.trim() ? Number(suggestedRetailPrice) : undefined;
    const numericMarkup = markup.trim() ? Number(markup) : undefined;
    const payload: UpdateManualProductInput = {
      name,
      description,
      referenceId: valueOrUndefined(referenceId),
      price: numericPrice,
      suggestedRetailPrice: numericSuggested,
      markup: numericMarkup,
      image: valueOrUndefined(image),
      images: galleryUrls,
      imagesByColor: product.imagesByColor,
      videoUrl: valueOrUndefined(videoUrl),
      variants: variants.map((variant) => ({ id: variant.id, color: variant.color, size: variant.size, price: Number(variant.price), availability: variant.availability, classificationIds: variant.classificationIds })),
      similarProductIdsQuickview: quickviewIds,
      similarProductIdsCart: cartIds,
    };
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateManualProduct(product.id, payload);
      applyProduct(updated);
      setMessage({ tone: 'success', text: 'Produto salvo com sucesso.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o produto.' });
    } finally {
      setSaving(false);
    }
  }

  async function refreshFromErp() {
    if (!canRefreshFromErp) return;
    setRefreshing(true);
    setRefreshSucceeded(false);
    setRefreshFailed(false);
    setMessage(null);
    try {
      const result = await refreshProductFromErp(product.id);
      if (result.status === 'not_found') {
        setRefreshFailed(true);
        setMessage({ tone: 'error', text: 'Esta referência não foi mais encontrada no ERP. Confirme se ela foi desativada ou removida.' });
        return;
      }
      applyProduct(result.product);
      setRefreshSucceeded(true);
      setMessage({ tone: 'success', text: 'Produto atualizado com os dados mais recentes do ERP.' });
    } catch (error) {
      setRefreshFailed(true);
      setMessage({
        tone: 'error',
        text: error instanceof Error && error.message
          ? error.message
          : 'Não foi possível atualizar o produto a partir do ERP. Verifique a integração e tente novamente.',
      });
    } finally {
      setRefreshing(false);
    }
  }

  return <div>
    <HubHeader title={product.name} description={sourceLabel(product.sourceOrigin)} secondaryActions={<><Link href="/workspace/produtos" className={adminUi.button}><ArrowLeft className="mr-1.5 inline size-3.5" aria-hidden="true" />Voltar ao hub</Link>{canRefreshFromErp && <Button type="button" variant="outline" disabled={refreshing} onClick={refreshFromErp}><span className="relative size-4" aria-hidden="true"><RefreshCw className={`absolute inset-0 size-4 transition-opacity duration-200 ease-out ${!refreshing && !refreshSucceeded && !refreshFailed ? 'opacity-100' : 'opacity-0'}`} /><LoaderCircle className={`absolute inset-0 size-4 animate-spin transition-opacity duration-200 ease-out ${refreshing ? 'opacity-100' : 'opacity-0'}`} /><Check className={`absolute inset-0 size-4 text-emerald-600 transition-opacity duration-200 ease-out ${!refreshing && refreshSucceeded ? 'opacity-100' : 'opacity-0'}`} /><CircleX className={`absolute inset-0 size-4 text-[#b00020] transition-opacity duration-200 ease-out ${!refreshing && refreshFailed ? 'opacity-100' : 'opacity-0'}`} /></span>Atualizar do ERP</Button>}</>} />
    <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
      {readOnly && <section className="flex gap-3 rounded-brand border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><p className="font-bold">Produto controlado pelo ERP</p><p className="mt-1">Os dados desta peça são somente leitura no Bippa. Faça qualquer alteração diretamente no ERP e aguarde a sincronização.</p></div></section>}
      {message && <p className={`rounded-brand border p-3 text-sm ${message.tone === 'error' ? 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</p>}

      <section className="grid gap-4 rounded-brand border border-border bg-surface p-4 md:grid-cols-[11rem_1fr]">
        <ProductImage src={product.image} alt={product.name} className="aspect-[4/5] w-full rounded-control bg-brand-background md:w-44" />
        <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-4"><DetailValue label="Referência" value={product.referenceId} /><div><p className="text-xs text-muted-foreground">Preço de atacado</p><ProductPrice price={product.price} discount={product.activeDiscount} presentation="workspace" /></div><DetailValue label="Preço sugerido" value={money(product.suggestedRetailPrice)} /><div><p className="text-xs text-muted-foreground">Origem</p><Badge className="mt-1">{sourceLabel(product.sourceOrigin)}</Badge></div><DetailValue label="Classificações" value={productClassificationSummary(product)} /></div>
      </section>

      {product.compositions && product.compositions.length > 0 && <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Composição</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{product.compositions.map((composition) => <Card key={composition.id} className="p-3"><h3 className="font-semibold">{composition.typeDescription ?? composition.description}</h3>{composition.typeDescription && composition.description !== composition.typeDescription && <p className="mt-1 text-xs text-muted-foreground">{composition.description}</p>}<ul className="mt-3 space-y-1 text-sm text-foreground">{composition.items.map((item, index) => <li key={`${item.material}-${index}`} className="flex justify-between gap-3"><span>{item.material}</span><span className="font-medium">{item.percentage.toLocaleString('pt-BR')}%</span></li>)}</ul>{composition.items.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum material informado pelo ERP.</p>}</Card>)}</div></section>}

      {readOnly ? <ReadOnlyContent product={product} /> : <form className="flex flex-col gap-6" onSubmit={save}>
        <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Dados do produto</h2><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Field label="Nome *"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Referência"><Input value={referenceId} onChange={(event) => setReferenceId(event.target.value)} /></Field><Field label="Preço de atacado *"><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></Field><Field label="Preço sugerido"><Input type="number" min="0" step="0.01" value={suggestedRetailPrice} onChange={(event) => setSuggestedRetailPrice(event.target.value)} /></Field><Field label="Markup"><Input type="number" min="0" step="0.1" value={markup} onChange={(event) => setMarkup(event.target.value)} /></Field></div><Field label="Descrição" className="mt-3"><textarea className="min-h-24 rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} /></Field></section>
        <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Mídias</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Imagem principal"><Input type="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://..." /></Field><Field label="Vídeo"><Input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://..." /></Field></div><Field label="Galeria (uma URL por linha)" className="mt-3"><textarea className="min-h-24 rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm" value={gallery} onChange={(event) => setGallery(event.target.value)} /></Field></section>
        <section className="rounded-brand border border-border bg-surface p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Grade e variantes</h2><p className="mt-1 text-sm text-muted-foreground">Remover uma linha desativa a variante sem apagar o histórico.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setVariants((current) => [...current, { color: '', size: '', price, availability: 'in_stock', classificationIds: [] }])}><Plus className="size-4" />Adicionar</Button></div><div className="mt-4 flex flex-col gap-2">{variants.map((variant, index) => <div key={variant.id ?? `new-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_10rem_auto]"><Input value={variant.color} onChange={(event) => updateVariant(index, { color: event.target.value })} placeholder="Cor" required /><Input value={variant.size} onChange={(event) => updateVariant(index, { size: event.target.value })} placeholder="Tamanho" required /><Input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} placeholder="Preço" required /><select className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm" value={variant.availability} onChange={(event) => updateVariant(index, { availability: event.target.value as DraftVariant['availability'] })}><option value="in_stock">Pronta-entrega</option><option value="preorder">Pré-venda</option><option value="backorder">Sob encomenda</option><option value="out_of_stock">Indisponível</option></select><Button type="button" variant="ghost" size="sm" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /><span className="sr-only">Remover variante</span></Button><label className="sm:col-span-5"><span className="sr-only">Classificações</span><select multiple className="min-h-20 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm" value={variant.classificationIds} onChange={(event) => updateVariant(index, { classificationIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value) })}>{classifications.filter((entry) => entry.classification.active).map((entry) => <option key={entry.classification.id} value={entry.classification.id}>{entry.type.label}: {entry.classification.name}</option>)}</select></label></div>)}{variants.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma variante cadastrada.</p>}</div></section>
        <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Produtos similares</h2><p className="mt-1 text-sm text-muted-foreground">A curadoria manual substitui a recomendação automática naquele contexto.</p><div className="mt-3 grid gap-3 lg:grid-cols-2"><SimilarProductsField label="Quick-view e página do produto" productIds={quickviewIds} allProducts={allProducts} onAdd={(id: string) => setQuickviewIds((current) => current.includes(id) ? current : [...current, id])} onRemove={(id: string) => setQuickviewIds((current) => current.filter((currentId) => currentId !== id))} /><SimilarProductsField label="Carrinho" productIds={cartIds} allProducts={allProducts} onAdd={(id: string) => setCartIds((current) => current.includes(id) ? current : [...current, id])} onRemove={(id: string) => setCartIds((current) => current.filter((currentId) => currentId !== id))} /></div></section>
        <div className="flex justify-end"><Button loading={saving}>Salvar alterações</Button></div>
      </form>}
    </main>
  </div>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`${adminUi.field} ${className ?? ''}`}><label>{label}</label>{children}</div>;
}

function ReadOnlyContent({ product }: { product: ProductAdmin }) {
  const matrix = buildVariantMatrix(product);

  return <>
    <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Descrição</h2><p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{product.description || 'Não informada.'}</p></section>
    <section className="rounded-brand border border-border bg-surface p-4">
      <h2 className="font-bold">Grade e variantes</h2>
      {product.variants.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma variante informada.</p> : (
        <div className="mt-3">
          <ProductVariantMatrix
            matrix={matrix}
            renderCell={({ cell }) => {
              if (!cell) return { content: '—', className: 'text-brand-muted/60', title: 'Não existe nessa combinação' };
              return {
                title: deliveryLabel(cell.availability),
                content: <div className="flex flex-col items-center gap-0.5 whitespace-nowrap leading-tight"><span className="font-semibold text-foreground">{money(cell.price)}</span><span className="text-[10px] text-muted-foreground">{deliveryLabel(cell.availability)}</span><span className="text-[10px] text-muted-foreground">Estoque: {cell.stockQty ?? 0}</span></div>,
              };
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground"><span className="text-brand-muted/60">—</span> essa combinação de cor e tamanho não existe nesta referência</p>
        </div>
      )}
    </section>
    {product.images && product.images.length > 1 && <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Galeria</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{product.images.map((url) => <ProductImage key={url} src={url} alt={product.name} className="aspect-[4/5] rounded-control bg-brand-background" />)}</div></section>}
  </>;
}
