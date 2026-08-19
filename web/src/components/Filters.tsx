'use client';

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
  const hasActiveFilters = !!(filters.category || filters.color || filters.size);

  return (
    <div className="controls">
      <p className="controls-label">Pesquisar por</p>
      <div className="search-field">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          className="search"
          placeholder="Nome ou código do produto"
          value={filters.term}
          onChange={(e) => onChange({ ...filters, term: e.target.value })}
        />
      </div>

      <p className="controls-label">Filtrar por</p>
      <div className="select-field">
        <select
          value={filters.category}
          onChange={(e) => onChange({ ...filters, category: e.target.value, subcategory: '' })}
        >
          <option value="">Categoria</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="select-field">
        <select
          value={filters.color}
          onChange={(e) => onChange({ ...filters, color: e.target.value })}
        >
          <option value="">Cor</option>
          {options.colors.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="select-field">
        <select
          value={filters.size}
          onChange={(e) => onChange({ ...filters, size: e.target.value })}
        >
          <option value="">Tamanho</option>
          {options.sizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <button className={'btn-clear' + (hasActiveFilters ? ' visible' : '')} onClick={onClear}>Limpar filtros</button>
    </div>
  );
}
