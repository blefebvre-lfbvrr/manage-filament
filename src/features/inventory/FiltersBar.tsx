import { Filter, Search, X } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EMPTY_FILTERS, type SpoolFilters } from '@/lib/filters';
import { SPOOL_STATUSES } from '@/lib/schemas';
import { SPOOL_STATUS_LABELS, STOCK_LEVEL_LABELS, type StockLevel } from '@/lib/spool';

type ListKey = 'statuses' | 'materials' | 'brands' | 'levels' | 'locations';

function MultiFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  if (!options.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Filtrer par ${label.toLowerCase()}${selected.length ? ` (${selected.length} sélectionné)` : ''}`}
        >
          {label}
          {selected.length > 0 && <Badge tone="info">{selected.length}</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) =>
              onChange(c ? [...selected, o.value] : selected.filter((x) => x !== o.value))
            }
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => onChange([])}>
              Tout effacer
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const FiltersBar = forwardRef<
  HTMLInputElement,
  {
    filters: SpoolFilters;
    onChange: (f: SpoolFilters) => void;
    materials: string[];
    brands: string[];
    locations: string[];
    resultCount: number;
  }
>(function FiltersBar({ filters, onChange, materials, brands, locations, resultCount }, ref) {
  const set = <K extends ListKey>(k: K, v: SpoolFilters[K]) => onChange({ ...filters, [k]: v });
  const active =
    filters.statuses.length +
    filters.materials.length +
    filters.brands.length +
    filters.levels.length +
    filters.locations.length +
    (filters.query ? 1 : 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={ref}
          type="search"
          aria-label="Rechercher une bobine"
          placeholder="Rechercher (code, couleur, gamme, notes…)  —  raccourci /"
          className="pl-9"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="text-muted-foreground size-4" aria-hidden />
        <MultiFilter
          label="Statut"
          options={SPOOL_STATUSES.map((s) => ({ value: s, label: SPOOL_STATUS_LABELS[s] }))}
          selected={filters.statuses}
          onChange={(v) => set('statuses', v)}
        />
        <MultiFilter
          label="Niveau"
          options={(['ok', 'low', 'critical', 'empty'] as StockLevel[]).map((l) => ({
            value: l,
            label: STOCK_LEVEL_LABELS[l],
          }))}
          selected={filters.levels}
          onChange={(v) => set('levels', v)}
        />
        <MultiFilter
          label="Matériau"
          options={materials.map((m) => ({ value: m, label: m }))}
          selected={filters.materials}
          onChange={(v) => set('materials', v)}
        />
        <MultiFilter
          label="Marque"
          options={brands.map((m) => ({ value: m, label: m }))}
          selected={filters.brands}
          onChange={(v) => set('brands', v)}
        />
        <MultiFilter
          label="Emplacement"
          options={locations.map((m) => ({ value: m, label: m }))}
          selected={filters.locations}
          onChange={(v) => set('locations', v)}
        />
        <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={filters.includeArchived}
            onChange={(e) => onChange({ ...filters, includeArchived: e.target.checked })}
          />
          Archivées
        </label>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            <X aria-hidden /> Réinitialiser
          </Button>
        )}
        <span className="text-muted-foreground ml-auto text-sm" role="status" aria-live="polite">
          {resultCount} bobine{resultCount > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
});
