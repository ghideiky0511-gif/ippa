import type { ReactNode } from 'react';
import { COLOR_MAP } from '@/lib/config';
import type { VariantMatrix } from '@/lib/variants';
import { publicUi } from '@/lib/ui';
import type { Variant } from '@/domain/products/types';

export type VariantMatrixCellContext = {
  cell: Variant | null;
  color: string;
  size: string;
};

export type VariantMatrixCell = {
  content: ReactNode;
  className?: string;
  title?: string;
};

type ProductVariantMatrixProps = {
  matrix: VariantMatrix;
  renderCell: (context: VariantMatrixCellContext) => VariantMatrixCell;
};

/** Estrutura visual única da grade cor × tamanho. */
export function ProductVariantMatrix({ matrix, renderCell }: ProductVariantMatrixProps) {
  return (
    <div className={publicUi.variantMatrix}>
      <table className={publicUi.variantMatrixTable}>
        <thead className={publicUi.variantMatrixHead}>
          <tr>
            <th className={publicUi.variantMatrixHeadCell}>Cor</th>
            {matrix.sizes.map((size) => <th key={size} className={publicUi.variantMatrixHeadCell}>{size}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.color} className={publicUi.variantMatrixRow}>
              <td className={publicUi.variantMatrixColor}>
                <span className={publicUi.swatch} style={{ background: COLOR_MAP[row.color] || '#ccc' }} />
                {row.color}
              </td>
              {row.cells.map((cell, index) => {
                const rendered = renderCell({ cell, color: row.color, size: matrix.sizes[index] });
                return (
                  <td key={matrix.sizes[index]} className={[publicUi.variantMatrixCell, rendered.className ?? ''].join(' ')} title={rendered.title}>
                    {rendered.content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
