# Produtos similares

## Objetivo

Mostrar "você também pode gostar" no quick-view, na página cheia do produto e no carrinho, sem nenhuma regra de negócio fixa no código. Toda a lógica é dirigida por dados: configuração por tenant no Postgres (`store_settings.similar_products_settings`) + curadoria manual por produto no catálogo. O único valor "fixo" no código é o default sensato aplicado quando o tenant ainda não configurou nada.

## Onde mora cada peça

| Peça | Arquivo |
| --- | --- |
| Cálculo das recomendações | `src/services/recommendations/similarProductsService.ts` (`computeSimilarProducts`, `recommendSimilarProducts`) |
| Leitura/escrita da configuração do tenant | `src/services/settings/similarProductsService.ts` (`getSimilarProductsSettings`, `replaceSimilarProductsSettings`) |
| Acesso a linha no banco | `src/models/settingsModel.ts` (`findSimilarProductsSettingsRow`, `upsertSimilarProductsSettingsRow`) |
| Coluna no schema | `db/migrations/002_core_schema.sql` — `store_settings.similar_products_settings jsonb NOT NULL DEFAULT '{}'::jsonb` |
| Tipos | `src/lib/types.ts` — `SimilarProductsSettings`, `SimilarProductsRuleConfig`, campos `similarProductIdsQuickview`/`similarProductIdsCart` em `Product` |
| Rotas HTTP | `src/app/api/[tenantSlug]/[...path]/route.ts` — `GET similar-products-settings` (público), `PUT similar-products-settings` (admin), `POST similar-products` (calcula) |
| Consumo no frontend | `frontend/src/app/produto/[id]/page.tsx`, `frontend/src/components/ProductQuickView.tsx`, `frontend/src/app/carrinho/page.tsx` |
| Edição no admin | `frontend/src/workspace/lib/similarProductsSettingsClient*.ts` (`/ferramentas`) |

## Duas camadas de recomendação

Para cada produto-âncora (o produto sendo visto, ou os produtos no carrinho), a recomendação é resolvida em duas camadas, nessa ordem:

1. **Curadoria manual** — se o produto-âncora tem `similarProductIdsQuickview` (contexto `quickview`, também usado na página cheia do produto) ou `similarProductIdsCart` (contexto `cart`) preenchido no catálogo, esses IDs entram primeiro, na ordem cadastrada. Um produto com curadoria manual não passa pelas regras automáticas.
2. **Regras automáticas** — rodam só para âncoras sem curadoria manual. As regras disponíveis (`RULES` em `similarProductsService.ts`):
   - `sameSubcategory` — mesma `category` e mesma `subcategory` do produto do catálogo.
   - `sameCategory` — mesma `category`.
   - `complementaryCategory` — usa `settings.complementaryCategories[categoriaDoAncora]`, um mapa `categoria -> categorias complementares` que também vem do Postgres.

Quando várias regras estão ativas, os resultados de cada uma são intercalados (round-robin, função `interleave`) em vez de concatenados, para misturar as origens em vez de esgotar uma regra antes da próxima. O resultado final é deduplicado (produto já visto/já âncora não repete) e cortado no `limit` configurado para o contexto.

## Configuração por tenant (`SimilarProductsSettings`)

```ts
interface SimilarProductsRuleConfig {
  limit: number;   // quantas peças mostrar nesse contexto
  rules: string[]; // ids de regras ativas, na ordem escolhida
}

interface SimilarProductsSettings {
  quickview: SimilarProductsRuleConfig;            // quick-view E página cheia do produto (mesma âncora única)
  cart: SimilarProductsRuleConfig;                 // carrinho (várias âncoras: os produtos já escolhidos)
  complementaryCategories: Record<string, string[]>; // usado pela regra "complementaryCategory"
}
```

Isso fica salvo inteiro como um JSONB em `store_settings.similar_products_settings`, uma linha por tenant. É editável em `/ferramentas` (plataforma admin) via `PUT .../similar-products-settings`, que exige `requireSettingsAdministrator` e valida o shape (`limit` numérico > 0, `rules` array de strings, `complementaryCategories` mapa de arrays de strings) antes de gravar — payload inválido vira `ValidationError`.

## Defaults: não é regra de negócio, é bootstrap

```ts
const DEFAULT_SETTINGS: SimilarProductsSettings = {
  quickview: { limit: 4, rules: ["sameCategory"] },
  cart: { limit: 4, rules: ["sameCategory"] },
  complementaryCategories: {},
};
```

Esse objeto só existe para tenants que ainda não salvaram nenhuma configuração — é o ponto de partida razoável até alguém mexer em `/ferramentas`, não uma regra fixa de recomendação.

`getSimilarProductsSettings` aplica o default **por campo**, não no objeto inteiro:

```ts
export async function getSimilarProductsSettings(tenant: Tenant): Promise<SimilarProductsSettings> {
  const row = await withTenantTransaction(tenant, {}, (client) => findSimilarProductsSettingsRow(client));
  return {
    quickview: row?.quickview ?? DEFAULT_SETTINGS.quickview,
    cart: row?.cart ?? DEFAULT_SETTINGS.cart,
    complementaryCategories: row?.complementaryCategories ?? DEFAULT_SETTINGS.complementaryCategories,
  };
}
```

Isso importa por causa de um detalhe do schema: a coluna é `NOT NULL DEFAULT '{}'::jsonb`. Um tenant cujo `store_settings` foi criado sem nunca ter salvo configuração de produtos similares (ex.: criou a loja e só mexeu em outras configurações) tem `similar_products_settings = {}` — um objeto válido, mas incompleto, não `null`. Um fallback `row ?? DEFAULT_SETTINGS` no objeto inteiro nunca pega esse caso, porque `{}` não é "ausente" — e `computeSimilarProducts` então lê `settings.quickview.rules` de um `quickview` `undefined` e quebra. Por isso o fallback é aplicado campo a campo: tolera tanto `null` (settings nunca gravadas) quanto um objeto parcial/vazio (settings gravadas incompletamente).

## Fluxo de ponta a ponta

```
frontend (página do produto / quick-view / carrinho)
  └─ POST /api/{tenant}/similar-products { context, productIds }
       └─ recommendSimilarProducts(tenant, body)
            ├─ listCatalog(tenant)                 // Postgres, todo o catálogo do tenant
            ├─ getSimilarProductsSettings(tenant)   // Postgres, com defaults por campo
            └─ computeSimilarProducts(context, anchors, catalog, settings)
                 ├─ curadoria manual (similarProductIdsQuickview/Cart nos âncoras)
                 ├─ regras automáticas (settings[context].rules, intercaladas)
                 └─ dedup + slice(settings[context].limit)
```

`context` é `"quickview"` (default) ou `"cart"` — qualquer outro valor recebido cai em `"quickview"`. `productIds` que não existem no catálogo do tenant são simplesmente ignorados (filtrados ao montar `anchors`).

## Ao adicionar uma regra nova

1. Acrescente a função em `RULES` (`similarProductsService.ts`), com a mesma assinatura `(catalog, anchors, excluded, settings) => Product[]`.
2. Se a regra precisar de dado configurável (como `complementaryCategories`), adicione o campo em `SimilarProductsSettings` (`types.ts`) e no default (`DEFAULT_SETTINGS`) — lembre de expor o campo por padrão em `getSimilarProductsSettings`, não só confiar no `??` do objeto inteiro.
3. Atualize a validação em `replaceSimilarProductsSettings` se o novo campo tiver forma própria — hoje ela é uma verificação manual, não um schema declarativo, então campo novo = validação nova escrita à mão.
4. O `id` da regra usado em `rules: string[]` é uma string livre; regras desconhecidas (id que não bate com nenhuma chave de `RULES`) são silenciosamente ignoradas (`filter(Boolean)` em `computeSimilarProducts`), não geram erro — vale revisar isso se um typo em `/ferramentas` precisar ser visível para o admin.
