'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import type { CatalogFilters } from './CatalogApp';

interface FilterOptions {
  categories: string[];
  colors: string[];
  sizes: string[];
}

export default function Filters({ options, filters, onChange, onClear }: {
  options: FilterOptions;
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  onClear: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFilterCount = useMemo(
    () => [filters.category, filters.color, filters.size].filter(Boolean).length,
    [filters.category, filters.color, filters.size]
  );
  const hasActiveFilters = Boolean(filters.term || activeFilterCount);

  const filterFields = (
    <>
      <Select value={filters.category} disabled={options.categories.length === 0} onChange={(e) => onChange({ ...filters, category: e.target.value, subcategory: '' })}>
        <option value="">{options.categories.length === 0 ? 'Sem categorias disponíveis' : 'Todas as categorias'}</option>
        {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select value={filters.color} disabled={options.colors.length === 0} onChange={(e) => onChange({ ...filters, color: e.target.value })}>
        <option value="">{options.colors.length === 0 ? 'Sem cores disponíveis' : 'Todas as cores'}</option>
        {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select value={filters.size} disabled={options.sizes.length === 0} onChange={(e) => onChange({ ...filters, size: e.target.value })}>
        <option value="">{options.sizes.length === 0 ? 'Sem tamanhos disponíveis' : 'Todos os tamanhos'}</option>
        {options.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
    </>
  );

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-5">
      <div className="flex gap-2 md:items-center">
        <Input
          className="min-w-0 flex-1 md:max-w-md"
          placeholder="Buscar por nome ou código..."
          value={filters.term}
          onChange={(e) => onChange({ ...filters, term: e.target.value })}
        />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button type="button" variant="outline" className="shrink-0 md:hidden" onClick={() => setMobileOpen(true)}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <SheetContent side="right" className="w-[min(100%,23rem)]">
            <SheetHeader><h2 className="text-lg font-bold">Filtros</h2></SheetHeader>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">{filterFields}</div>
            <div className="border-t border-border p-5">
              <Button type="button" variant="outline" className="w-full" onClick={() => { onClear(); setMobileOpen(false); }} disabled={!hasActiveFilters}>
                <X className="size-4" aria-hidden="true" /> Limpar filtros
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="mt-3 hidden items-center gap-2 md:flex">
        {filterFields}
        {hasActiveFilters && <Button type="button" variant="ghost" size="sm" onClick={onClear}><X className="size-4" aria-hidden="true" />Limpar</Button>}
      </div>
    </div>
  );
}
