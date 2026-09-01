'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type StripeStatus =
  | { configured: false }
  | { configured: true; available: false }
  | { configured: true; available: true; mode: 'test' | 'live'; accountId: string; displayName: string | null; country: string | null; connectEnabled: boolean };

export default function ControlStripePage() {
  const [status, setStatus] = useState<StripeStatus | null>(null);

  useEffect(() => {
    void fetch('/api/control-session/stripe-status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setStatus(payload));
  }, []);

  return <main className="mx-auto max-w-5xl p-6">
    <header className="mb-7">
      <Link className="text-sm underline" href="/control">← Control IPPA</Link>
      <div className="mt-3 flex items-center gap-3">
        <img
          src="https://cdn.brandfetch.io/idxAg10C0L/w/480/h/480/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B"
          alt="Stripe"
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-xl object-cover"
        />
        <div>
          <h1 className="text-2xl font-semibold">Stripe</h1>
          <p className="text-sm text-brand-muted">Conta de pagamentos da plataforma.</p>
        </div>
      </div>
    </header>
    <section className="rounded-brand bg-white p-5 shadow-sm">
      {!status ? <p className="text-sm text-brand-muted">Consultando status da Stripe...</p> : !status.configured ? <p className="text-sm text-brand-muted">Stripe não configurada na plataforma.</p> : !status.available ? <p className="text-sm text-red-700">Stripe configurada, mas não foi possível consultar a conta agora.</p> : <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 font-medium ${status.mode === 'live' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{status.mode === 'live' ? 'Produção' : 'Teste'}</span>
        <span><span className="text-brand-muted">Conta: </span>{status.displayName || status.accountId}</span>
        {status.country && <span><span className="text-brand-muted">País: </span>{status.country}</span>}
        <span><span className="text-brand-muted">Connect: </span>{status.connectEnabled ? 'Habilitado' : 'Não habilitado'}</span>
      </div>}
    </section>
  </main>;
}
