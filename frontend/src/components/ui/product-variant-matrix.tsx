import type { ReactNode } from 'react';
import { COLOR_MAP } from '@/lib/config';
import { shapeFromMatrix, type VariantMatrix, type VariantShape } from '@/lib/variants';
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

type RenderCell = (context: VariantMatrixCellContext) => VariantMatrixCell;

type ProductVariantMatrixProps = {
  matrix: VariantMatrix;
  /** Forma declarada do produto. Omitida → derivada do próprio matrix. */
  shape?: VariantShape;
  renderCell: RenderCell;
};

/** Estrutura visual da grade de variantes — tabela cor × tamanho quando o
 *  produto declara os dois eixos, e um layout mais simples (chips / controle
 *  único) quando declara só um eixo ou nenhum, pra não forçar uma tabela
 *  vazia ou de 1 linha num header "Cor" que não faz sentido nesses casos. */
export function ProductVariantMatrix({ matrix, shape, renderCell }: ProductVariantMatrixProps) {
  const resolved = shape ?? shapeFromMatrix(matrix);

  if (resolved.kind === 'grid') return <MatrixTable matrix={matrix} renderCell={renderCell} />;

  if (resolved.kind === 'single') {
    const cell = matrix.rows[0]?.cells[0] ?? null;
    const rendered = renderCell({ cell, color: '', size: '' });
    return (
      <div className={publicUi.variantSingle}>
        <div className={[publicUi.variantSingleCell, rendered.className ?? ''].join(' ')} title={rendered.title}>
          {rendered.content}
        </div>
      </div>
    );
  }

  // single-axis: só cor ou só tamanho foi declarado — o outro fica ''.
  const axis = resolved.axes[0];
  const values = axis === 'color' ? matrix.colors : matrix.sizes;
  return (
    <div className={publicUi.variantAxisList}>
      {values.map((value, index) => {
        const color = axis === 'color' ? value : '';
        const size = axis === 'size' ? value : '';
        const cell = axis === 'color' ? (matrix.rows[index]?.cells[0] ?? null) : (matrix.rows[0]?.cells[index] ?? null);
        const rendered = renderCell({ cell, color, size });
        return (
          <div key={value} className={[publicUi.variantAxisChip, rendered.className ?? ''].join(' ')} title={rendered.title}>
            {axis === 'color' && <span className={publicUi.swatch} style={{ background: COLOR_MAP[value] || '#ccc' }} />}
            <span className={publicUi.variantAxisLabel}>{value}</span>
            {rendered.content}
          </div>
        );
      })}
    </div>
  );
}

function MatrixTable({ matrix, renderCell }: { matrix: VariantMatrix; renderCell: RenderCell }) {
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
