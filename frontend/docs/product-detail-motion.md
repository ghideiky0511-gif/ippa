# Transição do Quick View para a página do produto

O Quick View e `/produto/[id]` são duas apresentações do mesmo detalhe. A
animação entre elas é uma transição compartilhada do Motion, e não duas
animações independentes.

## Contrato que não pode ser quebrado

Para um produto `id`, as duas telas precisam renderizar o mesmo `layoutId`
dentro do mesmo `LayoutGroup`:

```tsx
<LayoutGroup id={PRODUCT_DETAIL_LAYOUT_GROUP_ID}>
  {/* página e Quick View */}
</LayoutGroup>

<motion.div layoutId={productDetailLayoutId(product.id)} />
```

Esses valores estão centralizados em
`src/components/product-detail-motion.ts`. Não escreva uma string de
`layoutId` manualmente e não crie um segundo gerador: IDs diferentes fazem o
Motion tratar a página e o painel como elementos sem relação, causando saltos
ou uma transição que simplesmente não acontece.

## Onde alterar

- Mantenha o conteúdo que participa da transição em
  `ProductDetailContent.tsx`. Ele é usado tanto por `ProductQuickView.tsx`
  quanto por `ProductPageDetail.tsx`.
- Use a prop `presentation` apenas para diferenças de layout entre painel e
  página. Se for preciso criar outro elemento compartilhado (por exemplo, a
  foto principal), centralize seu ID no mesmo módulo e renderize-o nos dois
  destinos.
- `AppShell.tsx` é dono do `LayoutGroup`; Quick View e conteúdo da rota devem
  continuar abaixo dele. Não mova o painel para fora desse grupo.

## Ciclo de navegação

1. `ProductPageLink` marca o produto em transição e navega para a rota.
2. O Quick View permanece montado enquanto a página monta o mesmo detalhe.
   Isso dá ao Motion os dois retângulos que ele precisa medir.
3. `onLayoutAnimationComplete` da página chama
   `completeProductPageTransition`. Só então o painel é desmontado.

Não substitua essa conclusão por um `setTimeout` nem feche o Quick View logo
após `router.push`: ambos removem a origem antes do fim da medição e produzem
pisca, salto ou duplicação visual.

## Checklist para mudanças no Quick View

- Abrir o Quick View e navegar por **Abrir página do produto** em viewport
  desktop e mobile.
- Confirmar que página e painel renderizam `ProductDetailContent` para o
  mesmo `product.id`.
- Confirmar que não foi alterado o `LayoutGroup` de `AppShell` nem o uso de
  `productDetailLayoutId`.
- Testar com `prefers-reduced-motion`; a troca deve continuar funcional sem
  depender de duração fixa.
