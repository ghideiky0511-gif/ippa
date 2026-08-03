import CatalogApp from '@/components/CatalogApp';
import catalog from '@/data/catalog.json';

// Server Component: os dados já vêm prontos no HTML inicial, sem
// depender de fetch no cliente (o que resolvia o bug do file://).
export default function Page() {
  return <CatalogApp initialProducts={catalog} />;
}
