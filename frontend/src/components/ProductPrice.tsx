import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { publicUi } from '@/lib/ui';

type PriceDiscount = {
  percent: number;
  label?: string;
};

type ProductPriceProps = {
  price: number;
  discount?: PriceDiscount | null;
  presentation?: 'card' | 'detail' | 'workspace' | 'compact';
  animatePromotion?: boolean;
  onAnimationEnd?: () => void;
};

/** Apresenta preço atual e promocional com a mesma regra em todos os contextos. */
export default function ProductPrice({
  price,
  discount,
  presentation = 'card',
  animatePromotion = false,
  onAnimationEnd,
}: ProductPriceProps) {
  const percent = discount?.percent ?? 0;
  const hasPromotion = Number.isFinite(percent) && percent > 0;
  const promotionalPrice = hasPromotion ? priceWithPercentOff(price, percent) : undefined;

  if (presentation === 'workspace') {
    return (
      <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1" title={discount?.label}>
        <span className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Atual</span>
          <span className={hasPromotion ? 'text-sm text-muted-foreground line-through' : 'text-sm font-semibold text-foreground'}>
            {formatBRL(price)}
          </span>
        </span>
        {promotionalPrice !== undefined && (
          <>
            <span className="flex flex-col">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Promoção</span>
              <span className="text-base font-bold text-brand-primary">{formatBRL(promotionalPrice)}</span>
            </span>
            <span className="mb-0.5 rounded-full bg-brand-primary px-2 py-0.5 text-[11px] font-semibold text-white">
              -{percent}%
            </span>
          </>
        )}
      </div>
    );
  }

  if (!hasPromotion || promotionalPrice === undefined) {
    if (presentation === 'card') return <div className="text-base font-bold text-foreground">{formatBRL(price)}</div>;
    if (presentation === 'compact') return <span className="text-[13px] text-brand-muted">{formatBRL(price)}</span>;
    return <div className="contents">{formatBRL(price)}</div>;
  }

  if (presentation === 'compact') {
    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]" title={discount?.label}>
        <span className="text-brand-muted line-through">{formatBRL(price)}</span>
        <span className="font-semibold text-brand-primary">{formatBRL(promotionalPrice)}</span>
      </span>
    );
  }

  if (presentation === 'detail') {
    return (
      <div
        className={[publicUi.discountRow, animatePromotion ? 'animate-[qty-discount-pop_.5s_ease]' : ''].join(' ')}
        title={discount?.label}
        onAnimationEnd={onAnimationEnd}
      >
        <span className={publicUi.originalPrice}>{formatBRL(price)}</span>
        <span className="contents">{formatBRL(promotionalPrice)}</span>
        <span className={publicUi.discountBadge}>-{percent}%</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" title={discount?.label}>
      <span className="relative text-sm text-brand-muted after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-current">
        {formatBRL(price)}
      </span>
      <span className="text-xl font-bold text-brand-primary">{formatBRL(promotionalPrice)}</span>
      <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">-{percent}%</span>
    </div>
  );
}
