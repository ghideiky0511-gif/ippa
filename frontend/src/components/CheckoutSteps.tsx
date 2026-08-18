'use client';

import Link from 'next/link';

const STEPS = [
  { step: 1, label: 'Carrinho', href: '/carrinho' },
  { step: 2, label: 'Frete', href: '/frete' },
  { step: 3, label: 'Pagamento', href: '/pagamento' },
];

// current: rota ativa. reachable: até onde o cliente já avançou (ex.: sem
// frete escolhido, os passos 2 e 3 não têm link, só o texto).
export default function CheckoutSteps({ current, reachable }: { current: string; reachable: number }) {
  return (
    <div className="checkout-steps">
      {STEPS.map(({ step, label, href }, i) => {
        const isCurrent = href === current;
        const isReachable = step <= reachable;
        return (
          <span key={step} className="checkout-step-item">
            {isReachable && !isCurrent ? (
              <Link href={href} className={'checkout-step' + (isCurrent ? ' active' : '')}>
                {step}. {label}
              </Link>
            ) : (
              <span className={'checkout-step' + (isCurrent ? ' active' : '')}>{step}. {label}</span>
            )}
            {i < STEPS.length - 1 && <span className="checkout-step-sep">—</span>}
          </span>
        );
      })}
    </div>
  );
}
