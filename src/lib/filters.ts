/** Filtres combinés et recherche plein texte de l'inventaire. */
import type { AppSettings, Spool, SpoolStatus } from './schemas';
import { effectiveThresholds, stockLevel, type StockLevel } from './spool';
import { matchesQuery } from './text';

export interface SpoolFilters {
  query: string;
  statuses: SpoolStatus[];
  materials: string[];
  brands: string[];
  levels: StockLevel[];
  locations: string[];
  /** Masque les bobines archivées sauf si le statut « archived » est demandé. */
  includeArchived: boolean;
}

export const EMPTY_FILTERS: SpoolFilters = {
  query: '',
  statuses: [],
  materials: [],
  brands: [],
  levels: [],
  locations: [],
  includeArchived: false,
};

export function spoolSearchText(s: Spool): string {
  return [
    s.code,
    s.legacyId,
    s.brand,
    s.productLine,
    s.material,
    s.colorName,
    s.colorHex,
    s.finish,
    s.manufacturerRef,
    s.location,
    s.shop,
    s.orderNo,
    s.lot,
    s.notes,
    ...(s.tags ?? []),
    ...Object.values(s.custom ?? {}).map((v) => (v == null ? '' : String(v))),
  ]
    .filter(Boolean)
    .join(' ');
}

export function locationOf(s: Pick<Spool, 'status' | 'amsSlot' | 'location'>): string {
  if (s.status === 'ams' && s.amsSlot) return `AMS ${s.amsSlot}`;
  if (s.status === 'external') return 'Support externe';
  return s.location ?? '';
}

export function filterSpools(
  spools: Spool[],
  f: SpoolFilters,
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
): Spool[] {
  return spools.filter((s) => {
    if (s.deletedAt) return false;
    if (!f.includeArchived && s.status === 'archived' && !f.statuses.includes('archived')) return false;
    if (f.statuses.length && !f.statuses.includes(s.status)) return false;
    if (f.materials.length && !f.materials.includes(s.material)) return false;
    if (f.brands.length && !f.brands.includes(s.brand)) return false;
    if (f.locations.length && !f.locations.includes(locationOf(s))) return false;
    if (f.levels.length && !f.levels.includes(stockLevel(s.remainingG, effectiveThresholds(s, settings))))
      return false;
    if (f.query && !matchesQuery(spoolSearchText(s), f.query)) return false;
    return true;
  });
}

export function distinctValues<T>(items: T[], pick: (t: T) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const i of items) {
    const v = pick(i);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export interface SortSpec {
  id: string;
  desc: boolean;
}

/** Tri simple (vue cartes) ; la vue tableau utilise le tri de TanStack Table. */
export function sortSpools(spools: Spool[], sort: SortSpec | undefined): Spool[] {
  const s = sort ?? { id: 'code', desc: false };
  const key = (x: Spool): string | number => {
    switch (s.id) {
      case 'remainingG':
      case 'level':
      case 'percent':
        return x.initialNetG ? x.remainingG / x.initialNetG : x.remainingG;
      case 'productLine':
        return `${x.productLine} ${x.colorName}`;
      case 'colorName':
        return x.colorName;
      case 'brand':
        return x.brand;
      case 'status':
        return x.status === 'ams' ? `0${x.amsSlot}` : x.status;
      case 'price':
        return x.price ?? -1;
      default:
        return x.code;
    }
  };
  const sorted = [...spools].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const c =
      typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'fr', { numeric: true });
    return c;
  });
  return s.desc ? sorted.reverse() : sorted;
}
