'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { publicUi } from '@/lib/ui';
import { useTenant } from '@/components/TenantProvider';

export default function ConfirmarContaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { href } = useTenant();
  const [error, setError] = useState('');
  const confirmationRequested = useRef(false);

  useEffect(() => {
    // Evita consumir o token duas vezes no Strict Mode do React durante o desenvolvimento.
    if (confirmationRequested.current) return;
    confirmationRequested.current = true;
    const token = searchParams.get('token');
    if (!token) {
      setError('Link de confirmação inválido.');
      return;
    }
    let cancelled = false;
    apiFetch('/api/auth/confirm-first-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!cancelled) setError(data.error || 'Não foi possível confirmar sua conta.');
        return;
      }
      if (!cancelled) {
        router.replace(href('/'));
        router.refresh();
      }
    }).catch(() => {
      if (!cancelled) setError('Não foi possível confirmar sua conta. Tente novamente.');
    });
    return () => { cancelled = true; };
  }, [href, router, searchParams]);

  return <div className={publicUi.loginPage}>
    <section className={publicUi.loginForm}>
      <h1 className="m-0 text-center text-xl font-bold text-[#222]">Confirmando sua conta</h1>
      {error
        ? <p className={publicUi.error}>{error}</p>
        : <p className="m-0 text-center text-sm text-brand-muted">Aguarde um instante…</p>}
    </section>
  </div>;
}
