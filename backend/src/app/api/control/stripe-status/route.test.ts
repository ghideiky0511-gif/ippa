import assert from 'node:assert/strict';
import test from 'node:test';
import { readStripePlatformStatus } from './route';

function clientWithAccount(account: unknown) {
  return {
    accounts: { retrieve: async () => account },
  };
}

test('stripe status: informa a conta da plataforma em modo teste', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  const status = await readStripePlatformStatus(clientWithAccount({
    id: 'acct_platform',
    business_profile: { name: 'IPPA Plataforma' },
    country: 'BR',
    capabilities: { transfers: 'active' },
  }));

  assert.deepEqual(status, {
    configured: true,
    available: true,
    mode: 'test',
    accountId: 'acct_platform',
    displayName: 'IPPA Plataforma',
    country: 'BR',
    connectEnabled: true,
  });
});

test('stripe status: informa modo live e Connect desabilitado', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
  const status = await readStripePlatformStatus(clientWithAccount({
    id: 'acct_platform',
    capabilities: { transfers: 'inactive' },
  }));

  assert.deepEqual(status, {
    configured: true,
    available: true,
    mode: 'live',
    accountId: 'acct_platform',
    displayName: null,
    country: null,
    connectEnabled: false,
  });
});

test('stripe status: falha da consulta nao lanca', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  const status = await readStripePlatformStatus({
    accounts: { retrieve: async () => { throw new Error('Stripe indisponivel'); } },
  });

  assert.deepEqual(status, { configured: true, available: false });
});

test('stripe status: sem cliente retorna nao configurado', async () => {
  assert.deepEqual(await readStripePlatformStatus(null), { configured: false });
});
