import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalog } from '@/lib/catalog';
import { getProductsByIds } from '@/lib/catalogFacets';
import { formatBRL } from '@/lib/format';
import PrintButton from '@/components/PrintButton';
import type { Highlight } from '@/lib/types';

// `searchParams` já é uma Request-time API — só de usar isso a página vira
// dynamic sozinha, não precisa de `export const dynamic` aqui.
export default async function CatalogoPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ destaque?: string }>;
}) {
  const { destaque } = await searchParams;
  const raw = await readFile(path.join(process.cwd(), 'src/data/highlights.json'), 'utf-8');
  const highlights: Highlight[] = JSON.parse(raw);
  const highlight = highlights.find((h) => h.id === destaque);
  const products = highlight ? getProductsByIds(catalog, highlight.productIds) : [];

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar no-print">
        <PrintButton />
        <p>Use o botão acima e escolha &quot;Salvar como PDF&quot; na janela de impressão do navegador.</p>
      </div>

      <h1>{highlight?.label || 'Coleção não encontrada'}</h1>

      {products.length === 0 ? (
        <p>Nenhum produto nesta coleção.</p>
      ) : (
        <div className="pdf-grid">
          {products.map((p) => (
            <div key={p.id} className="pdf-item">
              <img src={p.image || ''} alt={p.name} />
              <div className="pdf-item-name">{p.name}</div>
              <div className="pdf-item-price">{formatBRL(p.price)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
