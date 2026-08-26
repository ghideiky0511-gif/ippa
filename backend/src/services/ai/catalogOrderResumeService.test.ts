import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogLastOrderResumeInput, CatalogLastOrderResumeOutput } from '@/contracts/ai';
import type { Tenant } from '@/lib/db/tenant';
import type { AuthUser } from '@/lib/types';
import {
  buildCatalogLastOrderResumeInput,
  canRunCatalogOrderResume,
  createCatalogOrderResumeService,
} from './catalogOrderResumeService';
import { catalogLastOrderResumeTool } from './catalogLastOrderResumeTool';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const tenant: Tenant = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'tenant-teste',
  name: 'Tenant teste',
};
const seller: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'seller@example.test',
  name: 'Vendedora teste',
  role: 'vendedora',
};

function snapshot() {
  return {
    order: {
      id: '22222222-2222-4222-8222-222222222222',
      created_at: new Date('2026-08-20T12:00:00.000Z'),
      total: '900.00',
    },
    items: [
      {
        item_key: 'a', product_id: 'product-1', qty: 2, unit_price: '100.00',
        color: 'Vermelho', size: 'M', category: 'Camisetas', subcategory: 'Básicas',
      },
      {
        item_key: 'b', product_id: 'product-1', qty: 1, unit_price: '100.00',
        color: 'Vermelho', size: 'G', category: 'Camisetas', subcategory: 'Básicas',
      },
      {
        item_key: 'c', product_id: 'product-2', qty: 3, unit_price: '150.00',
        color: 'Azul', size: 'P', category: 'Calças', subcategory: 'Jeans',
      },
      {
        item_key: 'legacy', product_id: null, qty: 1, unit_price: '50.00',
        color: null, size: null, category: null, subcategory: null,
      },
    ],
    tickets: {
      client_average: '600.00',
      client_order_count: '3',
      tenant_average: '750.00',
      tenant_order_count: '12',
    },
  };
}

const analysis: CatalogLastOrderResumeOutput = {
  summary: 'A compra teve concentração equilibrada entre camisetas e calças.',
  insights: [{
    kind: 'grade',
    title: 'Grade concentrada',
    evidence: 'Três peças foram do tamanho P.',
    action: 'Comece apresentando novidades no tamanho P.',
    isInterpretation: false,
  }],
  sampleWarning: null,
};

test('calcula fatos, tickets e participações sem depender da IA', () => {
  const input = buildCatalogLastOrderResumeInput(snapshot(), NOW);

  assert.deepEqual(input.lastOrder, {
    orderDate: '2026-08-20T12:00:00.000Z',
    totalValue: 900,
    totalPieces: 7,
    distinctProducts: 3,
    daysSincePurchase: 5,
  });
  assert.deepEqual(input.tickets.client, {
    averageValue: 600,
    orderCount: 3,
    differencePercent: 50,
  });
  assert.deepEqual(input.tickets.tenant, {
    averageValue: 750,
    orderCount: 12,
    differencePercent: 20,
  });
  assert.deepEqual(input.mix.categories, [
    { label: 'Calças', quantity: 3, sharePercent: 42.9 },
    { label: 'Camisetas', quantity: 3, sharePercent: 42.9 },
  ]);
  assert.equal(input.mix.piecesWithoutCategory, 1);
  assert.equal(input.mix.sizes[0].label, 'P');
  assert.equal(input.mix.sizes[0].quantity, 3);
});

test('contratos da ferramenta rejeitam identificação e mais de três insights', () => {
  const input = buildCatalogLastOrderResumeInput(snapshot(), NOW);
  assert.equal(catalogLastOrderResumeTool.inputSchema.safeParse({ ...input, clientId: 'não enviar' }).success, false);
  assert.equal(catalogLastOrderResumeTool.outputSchema.safeParse({
    ...analysis,
    insights: Array.from({ length: 4 }, () => analysis.insights[0]),
  }).success, false);

  const prompt = catalogLastOrderResumeTool.buildPrompt(input);
  assert.doesNotMatch(prompt, /seller@example\.test|Vendedora teste|11111111/);
});

test('sem compra paga retorna no_history e não executa a ferramenta', async () => {
  let toolCalls = 0;
  const receivedPeriodStarts: Date[] = [];
  const service = createCatalogOrderResumeService({
    now: () => NOW,
    readSnapshot: async (_tenant, _user, _sessionId, periodStart) => {
      receivedPeriodStarts.push(periodStart);
      return null;
    },
    runTool: async () => {
      toolCalls += 1;
      return { executionId: 'unexpected', source: 'provider', data: analysis };
    },
  });

  assert.deepEqual(await service(tenant, seller, 'session-1'), { status: 'no_history' });
  assert.equal(toolCalls, 0);
  assert.equal(receivedPeriodStarts[0]?.toISOString(), '2025-08-25T12:00:00.000Z');
});

test('fecha a leitura antes de executar e devolve o envelope disponível', async () => {
  const events: string[] = [];
  const receivedInputs: CatalogLastOrderResumeInput[] = [];
  const service = createCatalogOrderResumeService({
    now: () => NOW,
    readSnapshot: async () => {
      events.push('read-complete');
      return snapshot();
    },
    runTool: async (_tenant, _actor, input) => {
      events.push('provider');
      receivedInputs.push(input);
      return { executionId: 'execution-1', source: 'cache', data: analysis };
    },
  });

  const result = await service(tenant, seller, 'session-1');
  assert.deepEqual(events, ['read-complete', 'provider']);
  assert.equal(receivedInputs[0]?.lastOrder.totalValue, 900);
  assert.equal(result.status, 'available');
  if (result.status === 'available') {
    assert.equal(result.executionId, 'execution-1');
    assert.equal(result.source, 'cache');
    assert.deepEqual(result.analysis, analysis);
  }
});

test('autoriza somente a vendedora responsável ou administrador habilitado', () => {
  assert.equal(canRunCatalogOrderResume(seller, seller.id), true);
  assert.equal(canRunCatalogOrderResume(seller, 'outra-vendedora'), false);
  assert.equal(canRunCatalogOrderResume({ ...seller, role: 'expedicao' }, seller.id), false);
  assert.equal(canRunCatalogOrderResume({
    ...seller,
    role: 'administrador',
    permissions: { adminAccess: true },
  }, 'outra-vendedora'), true);
  assert.equal(canRunCatalogOrderResume({
    ...seller,
    role: 'administrador',
    permissions: { adminAccess: false },
  }, seller.id), false);
});
