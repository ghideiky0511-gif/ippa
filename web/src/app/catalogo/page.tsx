import { Suspense } from 'react';
import CatalogApp from '@/components/CatalogApp';
import catalog from '@/data/catalog.json';

// Server Component: os dados já vêm prontos no HTML inicial, sem
// depender de fetch no cliente (o que resolvia o bug do file://).
// Suspense é obrigatório aqui porque CatalogApp usa useSearchParams
// (pré-seleciona a categoria vinda do menu da home).
export default function Page() {
  return (
    <Suspense>
      <CatalogApp initialProducts={catalog} />
    </Suspense>
  );
}
