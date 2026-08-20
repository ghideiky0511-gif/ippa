'use client';

import { ChevronDown, ChevronUp, Image as ImageIcon, Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import { adminUi } from '@/workspace/lib/ui';
import type { HomeSection } from '@/domain/catalog/types';
import type { Product } from '@/domain/products/types';

function sectionSummary(section: HomeSection, products: Product[]) {
  if (section.type === 'banner') {
    const count = section.banners.length;
    const title = section.banners[0]?.title;
    return { label: 'Banner', detail: title || `${count} ${count === 1 ? 'imagem/vídeo' : 'imagens/vídeos'}`, Icon: ImageIcon };
  }
  const product = products.find((p) => p.id === section.productId);
  return { label: 'Produto', detail: product?.name || 'Produto não encontrado', Icon: ShoppingBag };
}

export default function BuilderMobileList({
  sections,
  products,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  sections: HomeSection[];
  products: Product[];
  onSelect: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const sorted = [...sections].sort((a, b) => (a.y || 0) - (b.y || 0));

  return (
    <div className="flex flex-col gap-3 px-4 pb-24">
      <p className={adminUi.hint}>Arraste é otimizado para desktop — aqui você reordena com as setas e edita tocando no bloco.</p>
      {sorted.length === 0 && (
        <p className={`${adminUi.previewEmpty} rounded-brand border border-dashed border-border bg-surface p-6 text-center`}>
          Nenhum bloco ainda. Monte a home pelo desktop ou gere um layout com IA.
        </p>
      )}
      {sorted.map((section, index) => {
        const { label, detail, Icon } = sectionSummary(section, products);
        return (
          <div key={section.id} className="flex items-center gap-3 rounded-brand border border-border bg-surface p-3">
            <div className="flex flex-col gap-1">
              <button type="button" className="flex size-8 items-center justify-center rounded-control text-muted-foreground disabled:opacity-30" disabled={index === 0} onClick={() => onMoveUp(section.id)} aria-label="Mover para cima">
                <ChevronUp className="size-4" />
              </button>
              <button type="button" className="flex size-8 items-center justify-center rounded-control text-muted-foreground disabled:opacity-30" disabled={index === sorted.length - 1} onClick={() => onMoveDown(section.id)} aria-label="Mover para baixo">
                <ChevronDown className="size-4" />
              </button>
            </div>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onSelect(section.id)}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-background text-brand-primary"><Icon className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
            </button>
            <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-brand-background hover:text-brand-primary" onClick={() => onSelect(section.id)} aria-label="Editar bloco">
              <Pencil className="size-4" />
            </button>
            <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-control text-red-500 hover:bg-red-50" onClick={() => onRemove(section.id)} aria-label="Excluir bloco">
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
