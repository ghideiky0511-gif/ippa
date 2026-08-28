'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className={`${publicUi.container} py-5 pb-14`}>
      <div className="max-w-[420px]">
        <h1>Página não encontrada</h1>
        <p>O endereço que você acessou não existe ou foi removido.</p>
        <Link href="/" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao catálogo</Link>
      </div>
    </main>
  );
}
