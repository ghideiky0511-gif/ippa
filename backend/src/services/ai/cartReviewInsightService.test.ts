import assert from 'node:assert/strict';
import test from 'node:test';
import type { CartReviewInsightOutput } from '@/contracts/ai';
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
  text: 'O carrinho concentra camisetas e calças em partes iguais. Considere reforçar o tamanho M e sugerir uma peça de baixo adicional.',
  suggestions: [
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
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({ text: 'a'.repeat(401), suggestions: [] }).success, false);
  assert.equal(cartReviewInsightTool.outputSchema.safeParse({
    text: 'ok',
    suggestions: [
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
      { title: 'a', evidence: 'b', action: 'c' },
    ],
  }).success, false);
  assert.equal(cartReviewInsightTool.version, '1');

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

  const result = await service(tenant, client, { items: cartItems() });
  assert.deepEqual(events, ['catalog-read', 'provider']);
  assert.equal(result.status, 'available');
  if (result.status === 'available') {
    assert.equal(result.executionId, 'execution-1');
    assert.equal(result.source, 'cache');
    assert.deepEqual(result.analysis, analysis);
  }
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
