import type { ReactNode } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import { Skeleton } from '@/components/ui/skeleton';

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
  loading = false,
  skeletonRows = 4,
}: {
  columns: ResponsiveDataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileCard: (row: T) => ReactNode;
  emptyMessage?: string;
  /** Mostra linhas-esqueleto no lugar dos dados enquanto a primeira carga do backend não chega. */
  loading?: boolean;
  skeletonRows?: number;
}) {
  if (loading && rows.length === 0) {
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
              {Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:hidden">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-brand" />
          ))}
        </div>
      </>
    );
  }

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
