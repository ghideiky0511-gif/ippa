'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';

const STEPS = [
  { step: 1, label: 'Carrinho', href: '/carrinho' },
  { step: 2, label: 'Entrega', href: '/frete' },
  { step: 3, label: 'Pagamento', href: '/pagamento' },
];

// current: rota ativa. reachable: até onde o cliente já avançou (ex.: sem
// frete escolhido, os passos 2 e 3 não têm link, só o texto).
export default function CheckoutSteps({ current, reachable }: { current: string; reachable: number }) {
  return (
    <div className={publicUi.checkoutSteps}>
      {STEPS.map(({ step, label, href }, i) => {
        const isCurrent = href === current;
        const isReachable = step <= reachable;
        return (
          <span key={step} className="inline-flex items-center">
            {isReachable && !isCurrent ? (
              <Link href={href} className={[publicUi.checkoutStep, isCurrent ? 'font-bold text-brand-primary' : ''].join(' ')}>
                {step}. {label}
              </Link>
            ) : (
              <span className={[publicUi.checkoutStep, isCurrent ? 'font-bold text-brand-primary' : ''].join(' ')}>{step}. {label}</span>
            )}
            {i < STEPS.length - 1 && <span className={publicUi.checkoutSeparator}>—</span>}
          </span>
        );
      })}
    </div>
  );
}
