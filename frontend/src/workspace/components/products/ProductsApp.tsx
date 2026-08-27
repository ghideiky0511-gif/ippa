'use client';

import { useMemo, useState } from 'react';
import { ImageOff, Plus, Settings2 } from 'lucide-react';
import Link from '@/components/TenantLink';
import ProductImage from '@/components/ProductImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ProductAdmin } from '@/domain/products/types';
import type { StoreSettings } from '@/domain/catalog/types';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { KpiCard } from '@/workspace/components/shared/KpiCard';
import { createProduct } from '@/workspace/lib/catalogClient';
import { saveStoreSettings } from '@/workspace/lib/storeSettingsClient';
import { useRouter } from 'next/navigation';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function sourceLabel(source: ProductAdmin['sourceOrigin']) {
  return source === 'erp' ? 'ERP' : source === 'bootstrap' ? 'Importado' : 'Manual';
}

function sourceClass(source: ProductAdmin['sourceOrigin']) {
  return source === 'erp' ? 'bg-blue-50 text-blue-700' : source === 'bootstrap' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
}

function productHasImage(product: ProductAdmin) {
  return Boolean(product.image || product.images?.length);
}

function productIsAvailable(product: ProductAdmin) {
  return product.variants.some((variant) => variant.availability === 'in_stock');
}

const EMPTY_PRODUCT = { name: '', price: '', category: '', referenceId: '', description: '', image: '', color: '', size: '' };

export default function ProductsApp({ products, initialSettings }: { products: ProductAdmin[]; initialSettings: StoreSettings }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | ProductAdmin['sourceOrigin']>('all');
  const [availability, setAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [creating, setCreating] = useState(false);
  const [configuringMarkup, setConfiguringMarkup] = useState(false);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingState, setCreatingState] = useState(false);
  const [markup, setMarkup] = useState(initialSettings.defaultMarkup?.toString() ?? '');
  const [markupState, setMarkupState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const queryOk = !term || [product.name, product.referenceId, product.category].some((value) => value?.toLowerCase().includes(term));
      const sourceOk = source === 'all' || product.sourceOrigin === source;
      const available = productIsAvailable(product);
      const availabilityOk = availability === 'all' || (availability === 'available' && available) || (availability === 'unavailable' && !available);
      return queryOk && sourceOk && availabilityOk;
    });
  }, [availability, products, query, source]);

  const kpis = useMemo(() => ({
    total: products.length,
    erp: products.filter((product) => product.sourceOrigin === 'erp').length,
    available: products.filter(productIsAvailable).length,
    withoutImage: products.filter((product) => !productHasImage(product)).length,
  }), [products]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(newProduct.price);
    if (!newProduct.name.trim() || !Number.isFinite(price) || price < 0) {
      setCreateError('Informe nome e preço de atacado válido.');
      return;
    }
    if (Boolean(newProduct.color.trim()) !== Boolean(newProduct.size.trim())) {
      setCreateError('Preencha cor e tamanho juntos, ou deixe ambos vazios.');
      return;
    }
    setCreatingState(true);
    setCreateError(null);
    try {
      await createProduct({ name: newProduct.name, price, category: newProduct.category || undefined, referenceId: newProduct.referenceId || undefined, description: newProduct.description || undefined, image: newProduct.image || undefined, variant: newProduct.color && newProduct.size ? { color: newProduct.color, size: newProduct.size } : undefined });
      setNewProduct(EMPTY_PRODUCT);
      setCreating(false);
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível cadastrar o produto.');
    } finally {
      setCreatingState(false);
    }
  }

  async function saveMarkup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = markup.trim() ? Number(markup) : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      setMarkupState('error');
      return;
    }
    setMarkupState('saving');
    try {
      await saveStoreSettings(value ? { defaultMarkup: value } : {});
      setMarkupState('saved');
      router.refresh();
    } catch {
      setMarkupState('error');
    }
  }

  return <div>
    <HubHeader title="Hub de produtos" description="Acompanhe o catálogo e abra cada peça para consultar ou editar seu cadastro local." primaryAction={{ label: 'Cadastrar produto', onClick: () => setCreating(true), icon: <Plus className="size-4" aria-hidden="true" /> }} secondaryActions={<Button type="button" variant="outline" size="sm" onClick={() => setConfiguringMarkup(true)}><Settings2 className="size-4" aria-hidden="true" />Markup padrão</Button>} />

    <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Produtos ativos" value={kpis.total} hint="Catálogo publicado" />
        <KpiCard label="Sincronizados com ERP" value={kpis.erp} hint="Somente leitura no workspace" />
        <KpiCard label="Disponíveis" value={kpis.available} hint="Ao menos uma variante pronta-entrega" />
        <KpiCard label="Sem foto" value={kpis.withoutImage} hint="Precisam de mídia no cadastro" />
      </section>

      <section className="rounded-brand border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className={`${adminUi.field} min-w-[15rem] flex-1`}><label htmlFor="product-search">Buscar produto</label><Input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, referência ou categoria..." /></div>
          <div className={`${adminUi.field} w-full sm:w-44`}><label htmlFor="product-source">Origem</label><select id="product-source" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">Todas</option><option value="erp">ERP</option><option value="manual">Manual</option><option value="bootstrap">Importado</option></select></div>
          <div className={`${adminUi.field} w-full sm:w-48`}><label htmlFor="product-availability">Disponibilidade</label><select id="product-availability" value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}><option value="all">Todas</option><option value="available">Pronta-entrega</option><option value="unavailable">Sem pronta-entrega</option></select></div>
        </div>

        {filtered.length === 0 ? <p className={`${adminUi.previewEmpty} mt-4`}>Nenhum produto encontrado com estes filtros.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => <Card key={product.id} className="overflow-hidden"><div className="flex gap-3 p-3"><ProductImage src={product.image} alt={product.name} className="h-28 w-20 shrink-0 rounded-control bg-brand-background" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 font-bold text-foreground">{product.name}</p><Badge className={sourceClass(product.sourceOrigin)}>{sourceLabel(product.sourceOrigin)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">REF {product.referenceId || 'não informada'} · {product.category}</p><p className="mt-2 text-sm font-semibold text-foreground">{money(product.price)}</p><p className="mt-1 text-xs text-muted-foreground">{product.variants.length} variante{product.variants.length === 1 ? '' : 's'} · {productIsAvailable(product) ? 'pronta-entrega' : 'sem pronta-entrega'}</p></div></div><div className="flex items-center justify-between border-t border-border px-3 py-2">{!productHasImage(product) ? <span className="inline-flex items-center gap-1 text-xs text-amber-700"><ImageOff className="size-3.5" />Sem foto</span> : <span className="max-w-[11rem] truncate text-xs text-muted-foreground">{product.colors.join(', ') || 'Sem grade'}</span>}<Button asChild size="sm" variant="outline"><Link href={`/workspace/produtos/${product.id}`}>Ver detalhes</Link></Button></div></Card>)}
        </div>}
      </section>
    </main>

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="max-h-[90dvh] overflow-y-auto md:max-w-2xl"><DialogHeader><div><DialogTitle>Cadastrar produto manual</DialogTitle><DialogDescription>Produtos cadastrados aqui podem ser editados no detalhe.</DialogDescription></div><DialogCloseButton /></DialogHeader><form className="grid gap-3" onSubmit={submitCreate}><div className="grid gap-3 sm:grid-cols-2">{([['name', 'Nome *'], ['price', 'Preço de atacado *'], ['referenceId', 'Referência'], ['category', 'Categoria'], ['color', 'Cor da primeira variante'], ['size', 'Tamanho da primeira variante']] as const).map(([field, label]) => <div className={adminUi.field} key={field}><label>{label}</label><Input type={field === 'price' ? 'number' : 'text'} step={field === 'price' ? '0.01' : undefined} min={field === 'price' ? '0' : undefined} value={newProduct[field]} onChange={(event) => setNewProduct((current) => ({ ...current, [field]: event.target.value }))} /></div>)}</div><div className={adminUi.field}><label>Imagem principal</label><Input type="url" value={newProduct.image} onChange={(event) => setNewProduct((current) => ({ ...current, image: event.target.value }))} placeholder="https://..." /></div><div className={adminUi.field}><label>Descrição</label><textarea className="min-h-20 rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm" value={newProduct.description} onChange={(event) => setNewProduct((current) => ({ ...current, description: event.target.value }))} /></div>{createError && <p className="text-sm text-[#b00020]">{createError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button loading={creatingState}>Cadastrar</Button></div></form></DialogContent></Dialog>

    <Dialog open={configuringMarkup} onOpenChange={setConfiguringMarkup}><DialogContent><DialogHeader><div><DialogTitle>Markup padrão</DialogTitle><DialogDescription>Aplica-se apenas a produtos que não vêm do ERP e não possuem valor próprio.</DialogDescription></div><DialogCloseButton /></DialogHeader><form className="grid gap-3" onSubmit={saveMarkup}><div className={adminUi.field}><label>Multiplicador</label><Input type="number" step="0.1" min="0" value={markup} onChange={(event) => { setMarkup(event.target.value); setMarkupState('idle'); }} placeholder="Ex.: 2.3" /></div>{markupState === 'error' && <p className="text-sm text-[#b00020]">Informe um markup positivo ou deixe vazio para remover.</p>}{markupState === 'saved' && <p className="text-sm text-emerald-700">Markup padrão salvo.</p>}<div className="flex justify-end"><Button loading={markupState === 'saving'}>Salvar</Button></div></form></DialogContent></Dialog>
  </div>;
}
