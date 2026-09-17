import assert from 'node:assert/strict';
import test from 'node:test';
import type { CartReviewInsightOutput, CartReviewInsightSummary } from '@/contracts/ai';
import type { Tenant } from '@/lib/db/tenant';
import type { AuthUser, CartItem, Product } from '@/lib/types';
import {
  buildCartReview,
  canRunCartReviewInsight,
  createCartReviewInsightService,
  createCartReviewService,
} from './cartReviewInsightService';
import { cartReviewInsightTool } from './cartReviewInsightTool';

const tenant: Tenant = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'tenant-teste',
  name: 'Tenant teste',
};
const client: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'cliente@example.test',
  name: 'Cliente teste',
  role: 'cliente',
};

function catalog(): Product[] {
  return [
    {
      id: 'product-1',
      name: 'Camiseta Teste',
      description: '',
      price: 100,
      colors: ['Vermelho'],
      sizes: ['M', 'G'],
      variants: [
        {
          id: 'v1', color: 'Vermelho', size: 'M', price: 100, availability: 'in_stock',
          classifications: [{
            id: 'c1', externalCode: 'e1', name: 'Camisetas', active: true,
            type: { id: 't1', integrationId: 'i1', externalCode: 'te1', label: 'Categoria', active: true, categoryLevel: 1 },
          }],
        },
        {
          id: 'v2', color: 'Vermelho', size: 'G', price: 100, availability: 'in_stock',
          classifications: [{
            id: 'c1', externalCode: 'e1', name: 'Camisetas', active: true,
            type: { id: 't1', integrationId: 'i1', externalCode: 'te1', label: 'Categoria', active: true, categoryLevel: 1 },
          }],
        },
      ],
    },
    {
      id: 'product-2',
      name: 'Calça Teste',
      description: '',
      price: 150,
      colors: ['Azul'],
      sizes: ['P'],
      variants: [{
        id: 'v3', color: 'Azul', size: 'P', price: 150, availability: 'in_stock',
        classifications: [{
          id: 'c2', externalCode: 'e2', name: 'Calças', active: true,
          type: { id: 't2', integrationId: 'i1', externalCode: 'te2', label: 'Categoria', active: true, categoryLevel: 1 },
        }],
      }],
    },
    {
      id: 'product-3',
      name: 'Produto sem categoria',
      description: '',
      price: 50,
      colors: ['Preto'],
      sizes: ['U'],
      variants: [{
        id: 'v4', color: 'Preto', size: 'U', price: 50, availability: 'in_stock',
        classifications: [],
      }],
    },
    // Não está no carrinho — candidato válido pra sugestão da categoria Calças.
    {
      id: 'product-4',
      name: 'Calça Adicional',
      description: '',
      price: 160,
      colors: ['Preto'],
      sizes: ['M'],
      variants: [{
        id: 'v5', color: 'Preto', size: 'M', price: 160, availability: 'in_stock',
        classifications: [{
          id: 'c2', externalCode: 'e2', name: 'Calças', active: true,
          type: { id: 't2', integrationId: 'i1', externalCode: 'te2', label: 'Categoria', active: true, categoryLevel: 1 },
        }],
      }],
    },
    // Só tem variante fora de estoque — nunca deve ser sugerido.
    {
      id: 'product-5',
      name: 'Calça Esgotada',
      description: '',
      price: 170,
      colors: ['Branco'],
      sizes: ['P'],
      variants: [{
        id: 'v6', color: 'Branco', size: 'P', price: 170, availability: 'out_of_stock',
        classifications: [{
          id: 'c2', externalCode: 'e2', name: 'Calças', active: true,
          type: { id: 't2', integrationId: 'i1', externalCode: 'te2', label: 'Categoria', active: true, categoryLevel: 1 },
        }],
      }],
    },
  ];
}

function cartItems(): CartItem[] {
  return [
    { key: 'a', id: 'product-1', name: 'Camiseta Teste', color: 'Vermelho', size: 'M', price: 100, qty: 2 },
    { key: 'b', id: 'product-1', name: 'Camiseta Teste', color: 'Vermelho', size: 'G', price: 100, qty: 1 },
    { key: 'c', id: 'product-2', name: 'Calça Teste', color: 'Azul', size: 'P', price: 150, qty: 3 },
    { key: 'legacy', id: 'product-3', name: 'Produto sem categoria', color: 'Preto', size: 'U', price: 50, qty: 1 },
  ];
}

const analysis: CartReviewInsightOutput = {
  headline: 'O carrinho concentra camisetas e calças em partes iguais.',
  highlights: ['Tamanho M concentra 2 das 7 peças.', 'Calças e camisetas dividem o mix igualmente.'],
  suggestions: [
    {
      title: 'Reforçar calças',
      evidence: 'Calças já representam metade do mix.',
      action: 'Sugerir outra peça de calça.',
      category: 'calças',
    },
    { title: 'Reforçar tamanho M', evidence: 'M é o tamanho mais presente no mix.', action: 'Sugerir outra peça no tamanho M.' },
  ],
};

test('buildCartReview agrega por categoria sem depender da IA', () => {
  const review = buildCartReview(cartItems(), catalog());

  assert.equal(review.facts.totalPieces, 7);
  assert.equal(review.facts.totalValue, 800);
  assert.equal(review.facts.distinctProducts, 3);
  assert.deepEqual(review.facts.mix.categories, [
    { label: 'Calças', quantity: 3, sharePercent: 42.9 },
    { label: 'Camisetas', quantity: 3, sharePercent: 42.9 },
  ]);
  assert.equal(review.facts.mix.piecesWithoutCategory, 1);

  const groupsByCategory = Object.fromEntries(review.groups.map((group) => [group.category, group.itemKeys]));
  assert.deepEqual(groupsByCategory['Camisetas'], ['a', 'b']);
  assert.deepEqual(groupsByCategory['Calças'], ['c']);
  assert.deepEqual(groupsByCategory['Sem categoria'], ['legacy']);
});

test('contratos da ferramenta rejeitam identificação, campos extras e texto excessivo', () => {
  const { facts } = buildCartReview(cartItems(), catalog());
  assert.equal(cartReviewInsightTool.inputSchema.safeParse({ ...facts, clientId: 'não enviar' }).success, false);
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({ ...analysis, clientName: 'não retornar' }).success, false);
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({
    headline: 'a'.repeat(161), highlights: [], suggestions: [],
  }).success, false);
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({
    headline: 'ok',
    highlights: [],
    suggestions: [
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
    ],
  }).success, false);
  // Uma peça/SKU nunca é um campo esperado — só `category`, que aponta pro
  // rótulo já recebido no mix.
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({
    headline: 'ok', highlights: [],
    suggestions: [{ title: 'a', evidence: 'b', action: 'c', productId: 'não enviar' }],
  }).success, false);
  assert.equal(cartReviewInsightTool.version, '2');

  const prompt = cartReviewInsightTool.buildPrompt(facts);
  assert.doesNotMatch(prompt, /cliente@example\.test|Cliente teste|11111111/);
});

test('carrinho vazio devolve empty_cart e não executa a ferramenta', async () => {
  let toolCalls = 0;
  const service = createCartReviewInsightService({
    readCatalog: async () => catalog(),
    runTool: async () => {
      toolCalls += 1;
      return { executionId: 'unexpected', source: 'provider', data: analysis };
    },
  });

  const result = await service(tenant, client, { items: [{ ...cartItems()[0], qty: 0 }] });
  assert.deepEqual(result, { status: 'empty_cart' });
  assert.equal(toolCalls, 0);
});

test('lê o catálogo, executa a ferramenta e repassa a origem do resultado', async () => {
  const events: string[] = [];
  const service = createCartReviewInsightService({
    readCatalog: async () => {
      events.push('catalog-read');
      return catalog();
    },
    runTool: async (_tenant, _actor, input) => {
      events.push('provider');
      assert.equal(input.totalPieces, 7);
      return { executionId: 'execution-1', source: 'cache', data: analysis };
    },
  });

  const result: CartReviewInsightSummary = await service(tenant, client, { items: cartItems() });
  assert.deepEqual(events, ['catalog-read', 'provider']);
  assert.equal(result.status, 'available');
  if (result.status === 'available') {
    assert.equal(result.executionId, 'execution-1');
    assert.equal(result.source, 'cache');
    assert.equal(result.analysis.headline, analysis.headline);
    assert.deepEqual(result.analysis.highlights, analysis.highlights);
    assert.equal(result.analysis.suggestions.length, 2);
  }
});

test('resolve peças reais do catálogo pela categoria da sugestão, sem repetir o que já está no carrinho', async () => {
  const service = createCartReviewInsightService({
    readCatalog: async () => catalog(),
    runTool: async () => ({ executionId: 'execution-2', source: 'provider', data: analysis }),
  });

  const result = await service(tenant, client, { items: cartItems() });
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;

  const [comCategoria, semCategoria] = result.analysis.suggestions;
  // "calças" (minúsculo, vindo da IA) casa com "Calças" do catálogo, ignora
  // o product-2 (já no carrinho) e o product-5 (só tem variante esgotada).
  assert.equal(comCategoria.products.length, 1);
  assert.equal(comCategoria.products[0]?.id, 'product-4');
  // Sem `category`, a sugestão nunca ganha peças anexadas.
  assert.deepEqual(semCategoria.products, []);
});

test('categoria sem correspondência no catálogo não anexa peças', async () => {
  const service = createCartReviewInsightService({
    readCatalog: async () => catalog(),
    runTool: async () => ({
      executionId: 'execution-3',
      source: 'provider',
      data: { ...analysis, suggestions: [{ ...analysis.suggestions[0], category: 'Categoria inexistente' }] },
    }),
  });

  const result = await service(tenant, client, { items: cartItems() });
  assert.equal(result.status, 'available');
  if (result.status === 'available') assert.deepEqual(result.analysis.suggestions[0].products, []);
});

test('rejeita corpo inválido antes de ler o catálogo', async () => {
  let readCalls = 0;
  const service = createCartReviewInsightService({
    readCatalog: async () => { readCalls += 1; return catalog(); },
    runTool: async () => { throw new Error('não deveria chamar'); },
  });

  await assert.rejects(() => service(tenant, client, { items: 'não é array' }));
  assert.equal(readCalls, 0);
});

test('exige papel autorizado antes de validar ou ler o catálogo', async () => {
  let readCalls = 0;
  const service = createCartReviewInsightService({
    readCatalog: async () => { readCalls += 1; return catalog(); },
    runTool: async () => { throw new Error('não deveria chamar'); },
  });

  await assert.rejects(() => service(tenant, { ...client, role: 'expedicao' }, { items: cartItems() }));
  assert.equal(readCalls, 0);
});

test('rota simples (sem IA) devolve os mesmos facts calculados', async () => {
  const service = createCartReviewService({ readCatalog: async () => catalog() });
  const review = await service(tenant, client, { items: cartItems() });
  assert.equal(review.facts.totalPieces, 7);
  assert.equal(review.groups.length, 3);
});

test('autoriza cliente e vendedora, e administrador só com adminAccess', () => {
  assert.equal(canRunCartReviewInsight(client), true);
  assert.equal(canRunCartReviewInsight({ ...client, role: 'vendedora' }), true);
  assert.equal(canRunCartReviewInsight({ ...client, role: 'expedicao' }), false);
  assert.equal(canRunCartReviewInsight({ ...client, role: 'entregador' }), false);
  assert.equal(canRunCartReviewInsight({ ...client, role: 'administrador', permissions: { adminAccess: true } }), true);
  assert.equal(canRunCartReviewInsight({ ...client, role: 'administrador', permissions: { adminAccess: false } }), false);
});
