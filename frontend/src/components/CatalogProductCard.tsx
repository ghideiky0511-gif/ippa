import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { COLOR_MAP } from '@/lib/config';
import type { Product } from '@/domain/products/types';

const MAX_COLOR_DOTS = 6;

interface CatalogProductCardProps {
  product: Product;
  onOpen: () => void;
  /** Conteúdo específico do contexto, como o botão do carrinho. */
  imageAction?: ReactNode;
  /** Link público ou botão interno para abrir o produto. */
  title: ReactNode;
  price: ReactNode;
}

/** A apresentação do produto é única; carrinho e talão injetam apenas suas ações. */
export default function CatalogProductCard({ product, onOpen, imageAction, title, price }: CatalogProductCardProps) {
  const colors = product.colors || [];
  const shownColors = colors.slice(0, MAX_COLOR_DOTS);
  const extraColors = colors.length - shownColors.length;

  return (
    <Card className="group flex min-w-0 flex-col overflow-hidden transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(44,28,36,.12)]">
      <div className="relative aspect-[9/16] overflow-hidden">
        <button type="button" className="block size-full cursor-pointer border-0 bg-transparent p-0" aria-label={`Ver cores e tamanhos de ${product.name}`} onClick={onOpen}>
          {product.videoUrl ? (
            <video className="block size-full bg-brand-background object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" src={product.videoUrl} autoPlay loop muted playsInline disablePictureInPicture />
          ) : (
            <img src={product.image || 'https://via.placeholder.com/400x500?text=Sem+imagem'} alt={product.name} className="block size-full bg-brand-background object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" />
          )}
        </button>
        {imageAction}
        {shownColors.length > 0 && (
          <div className={`pointer-events-none absolute bottom-3 left-2.5 hidden flex-wrap items-center gap-1.5 rounded-full bg-white/90 px-2 py-1.5 backdrop-blur-sm group-hover:flex sm:flex ${imageAction ? 'right-14' : 'right-2.5'}`}>
            {shownColors.map((color) => <span key={color} className="inline-block size-3.5 shrink-0 rounded-full border border-black/15" style={{ background: COLOR_MAP[color] || '#ccc' }} title={color} />)}
            {extraColors > 0 && <span className="text-[11px] text-brand-muted">+{extraColors}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {product.category && <Badge>{product.category}</Badge>}
        <h3 className="min-h-[2.7em] text-[15px] font-semibold leading-[1.35]">{title}</h3>
        {product.referenceId && <div className="-mt-1 text-[11px] text-brand-muted">{product.referenceId}</div>}
        {price}
      </div>
    </Card>
  );
}
