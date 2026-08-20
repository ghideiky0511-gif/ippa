import type { ReactNode } from 'react';
import { adminUi } from '@/workspace/lib/ui';

export interface ResponsiveDataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function ResponsiveDataTable<T>({
  columns,
  rows,
  rowKey,
  mobileCard,
  emptyMessage = 'Nenhum registro encontrado.',
}: {
  columns: ResponsiveDataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileCard: (row: T) => ReactNode;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className={`${adminUi.previewEmpty} mt-3`}>{emptyMessage}</p>;
  }

  return (
    <>
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className={adminUi.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>{column.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col gap-3 md:hidden">
        {rows.map((row) => <div key={rowKey(row)}>{mobileCard(row)}</div>)}
      </div>
    </>
  );
}
