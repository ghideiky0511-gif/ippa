'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { publicUi } from '@/lib/ui';
import { useAuthUser } from './AuthProvider';
import type { CatalogFilters } from './CatalogApp';
import type { CategoryTreeEntry } from '@/domain/catalog/types';

interface FilterOptions {
  categories: CategoryTreeEntry[];
  colors: string[];
  sizes: string[];
}

export default function Filters({ options, filters, onChange, onClear }: {
  options: FilterOptions;
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  onClear: () => void;
}) {
  const { suggestedPiecesEnabled } = useAuthUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFilterCount = useMemo(
    () => [filters.classificationId, filters.color, filters.size].filter(Boolean).length + (filters.selected ? 1 : 0) + (filters.suggested ? 1 : 0),
    [filters.classificationId, filters.color, filters.size, filters.selected, filters.suggested]
  );
  const categories = options.categories.flatMap(function flatten(node): CategoryTreeEntry[] {
    return [node, ...node.children.flatMap(flatten)];
  });
  const hasActiveFilters = Boolean(filters.term || activeFilterCount);

  const filterFields = (
    <>
      <Select value={filters.classificationId} disabled={categories.length === 0} onChange={(e) => onChange({ ...filters, classificationId: e.target.value })}>
        <option value="">{options.categories.length === 0 ? 'Sem categorias disponíveis' : 'Todas as categorias'}</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{' '.repeat(category.level - 1)}{category.name}</option>)}
      </Select>
      <Select value={filters.color} disabled={options.colors.length === 0} onChange={(e) => onChange({ ...filters, color: e.target.value })}>
        <option value="">{options.colors.length === 0 ? 'Sem cores disponíveis' : 'Todas as cores'}</option>
        {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select value={filters.size} disabled={options.sizes.length === 0} onChange={(e) => onChange({ ...filters, size: e.target.value })}>
        <option value="">{options.sizes.length === 0 ? 'Sem tamanhos disponíveis' : 'Todos os tamanhos'}</option>
        {options.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select value={filters.selected} onChange={(e) => onChange({ ...filters, selected: e.target.value as CatalogFilters['selected'] })}>
        <option value="">Selecionados</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </Select>
      {suggestedPiecesEnabled && (
        <Select value={filters.suggested} onChange={(e) => onChange({ ...filters, suggested: e.target.value as CatalogFilters['suggested'] })}>
          <option value="">Sugeridos</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </Select>
      )}
    </>
  );

  const searchField = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        className="min-w-0 pl-9 shadow-sm transition-[border-color,box-shadow] focus-visible:shadow-[0_0_0_4px_rgba(24,24,27,.10)]"
        placeholder="Buscar por nome ou código..."
        value={filters.term}
        onChange={(e) => onChange({ ...filters, term: e.target.value })}
      />
    </div>
  );

  return (
    <div className={publicUi.catalogToolbar}>
      {/* Mobile: barra de busca + botão que abre o Sheet com os filtros.
          Desktop: barra de busca some daqui, filtros viram coluna fixa ao lado. */}
      <div className="flex gap-2 md:hidden">
        {searchField}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => setMobileOpen(true)}>
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
      <div className="hidden md:flex md:flex-col md:gap-4">
        <h2 className={publicUi.catalogSidebarTitle}>Filtros</h2>
        {searchField}
        <div className={publicUi.catalogFilterGroup}>{filterFields}</div>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onClear}>
            <X className="size-4" aria-hidden="true" />Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
