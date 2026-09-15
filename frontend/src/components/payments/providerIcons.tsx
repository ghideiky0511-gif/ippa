// Ícone de marca do provider (Stripe hoje) pra caber ao lado do ícone de
// método sem estourar o espaço da linha de resumo -- ver
// PaymentMethodIndicator.tsx. SVG local (não a imagem do CDN da Brandfetch)
// pra não depender de rede em produção e ficar ilegível em fundo claro/escuro.
// Provider sem entrada aqui simplesmente não ganha ícone de marca (methodIcon
// + providerLabel em texto já cobrem esse caso, ver paymentMethodMeta.ts).

// Path do glifo "S" oficial da Stripe (fonte: brand kit da Stripe / projeto
// simple-icons, MIT) -- o mesmo traço usado no favicon/ícone de app deles,
// só sem o quadrado de fundo, pra caber como ícone inline igual aos de
// método (pix/cartão).
function StripeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#635BFF" aria-hidden="true">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
    </svg>
  );
}

// Mercado Pago não tem entrada aqui de propósito -- sem um path de glifo
// oficial verificado à mão (o da Stripe acima já existia no repo antes
// desta mudança), o risco de publicar uma marca registrada desenhada
// errado de memória é maior que o ganho. providerLabel/methodIcon (ver
// paymentMethodMeta.ts) já cobrem esse provider em texto sem ícone de
// marca -- comportamento suportado, não uma lacuna.
const PROVIDER_ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  stripe: StripeIcon,
};

export function providerIcon(provider: string): ((props: { className?: string }) => React.JSX.Element) | null {
  return PROVIDER_ICONS[provider] ?? null;
}
