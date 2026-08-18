'use client';
import { publicUi } from '@/lib/ui';

import type { CatalogFilters } from './CatalogApp';

interface FilterOptions {
  categories: string[];
  colors: string[];
  sizes: string[];
}

export default function Filters({
  options,
  filters,
  onChange,
  onClear,
}: {
  options: FilterOptions;
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  onClear: () => void;
}) {
  return (
    <div className={publicUi.controls}>
      <input
        className={publicUi.search}
        placeholder="Buscar por nome ou código..."
        value={filters.term}
        onChange={(e) => onChange({ ...filters, term: e.target.value })}
      />
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value, subcategory: '' })}
      >
        <option value="">Todas as categorias</option>
        {options.categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select
        value={filters.color}
        onChange={(e) => onChange({ ...filters, color: e.target.value })}
      >
        <option value="">Todas as cores</option>
        {options.colors.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select
        value={filters.size}
        onChange={(e) => onChange({ ...filters, size: e.target.value })}
      >
        <option value="">Todos os tamanhos</option>
        {options.sizes.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button className={publicUi.subtleButton} onClick={onClear}>Limpar filtros</button>
    </div>
  );
}
