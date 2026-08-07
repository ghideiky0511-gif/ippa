import { Suspense } from 'react';
import CatalogApp from '@/components/CatalogApp';
import { getCatalog } from '@/lib/catalog';

// productOverrides.json é editado pela plataforma admin e precisa
// refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

// Server Component: os dados já vêm prontos no HTML inicial, sem
// depender de fetch no cliente (o que resolvia o bug do file://).
// Suspense é obrigatório aqui porque CatalogApp usa useSearchParams
// (pré-seleciona a categoria vinda do menu da home).
export default async function Page() {
  const catalog = await getCatalog();
  return (
    <Suspense>
      <CatalogApp initialProducts={catalog} />
    </Suspense>
  );
}
