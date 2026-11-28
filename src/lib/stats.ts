/** Statistiques du tableau de bord : séries, agrégats, coûts, prévisions. Fonctions pures. */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { normalizeHex } from './color';
import { roundG } from './movements';
import type { AppSettings, PrintJob, Project, Spool, StockMovement } from './schemas';
import { costPerGram, remainingValue } from './spool';
import { looseKey } from './text';

export type Period = '30d' | '90d' | '12m' | 'ytd' | 'all';
export type Bucket = 'day' | 'week' | 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
  '12m': '12 derniers mois',
  ytd: 'Depuis le 1er janvier',
  all: 'Depuis le début',
};

export interface Range {
  from: Date | null;
  to: Date;
}

export function periodRange(p: Period, now: Date): Range {
  const to = now;
  switch (p) {
    case '30d':
      return { from: startOfDay(subDays(now, 29)), to };
    case '90d':
      return { from: startOfDay(subDays(now, 89)), to };
    case '12m':
      return { from: startOfMonth(subMonths(now, 11)), to };
    case 'ytd':
      return { from: startOfYear(now), to };
    default:
      return { from: null, to };
  }
}

/** Granularité adaptée à la période. */
export function defaultBucket(p: Period): Bucket {
  return p === '30d' ? 'day' : p === '90d' ? 'week' : 'month';
}

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

export function inRange(d: Date | null, r: Range): boolean {
  if (!d) return r.from === null;
  return (!r.from || d >= r.from) && d <= r.to;
}

export function bucketStart(d: Date, b: Bucket): Date {
  return b === 'day' ? startOfDay(d) : b === 'week' ? startOfISOWeek(d) : startOfMonth(d);
}

export function bucketKey(d: Date, b: Bucket): string {
  return format(bucketStart(d, b), b === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd');
}

export function bucketLabel(key: string, b: Bucket): string {
  const d = parseISO(b === 'month' ? `${key}-01` : key);
  if (b === 'month') return format(d, 'MMM yy', { locale: fr });
  if (b === 'week') return `sem. ${format(d, 'd MMM', { locale: fr })}`;
  return format(d, 'd MMM', { locale: fr });
}

/** Toutes les clés de la plage, pour afficher aussi les périodes sans activité. */
export function bucketKeys(from: Date, to: Date, b: Bucket): string[] {
  const keys: string[] = [];
  let d = bucketStart(from, b);
  const end = bucketStart(to, b);
  let guard = 0;
  while (d <= end && guard++ < 1000) {
    keys.push(bucketKey(d, b));
    d = b === 'day' ? addDays(d, 1) : b === 'week' ? addDays(d, 7) : addMonths(d, 1);
  }
  return keys;
}

/** Consommation réelle : mouvements d'impression non annulés. */
export function activeConsumption(movements: StockMovement[]): StockMovement[] {
  return movements.filter((m) => m.type === 'print' && !m.reversedById && !m.deletedAt && m.deltaG < 0);
}

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
  /** Valeur secondaire (coût pour la consommation, nombre d'achats pour les dépenses). */
  extra: number;
}

function firstDate(dates: (Date | null)[], fallback: Date): Date {
  const valid = dates.filter((d): d is Date => d !== null);
  return valid.length ? new Date(Math.min(...valid.map((d) => d.getTime()))) : fallback;
}

export function consumptionSeries(
  movements: StockMovement[],
  spoolsById: Map<string, Spool>,
  r: Range,
  b: Bucket,
): SeriesPoint[] {
  const used = activeConsumption(movements).filter((m) => inRange(toDate(m.at), r));
  const from =
    r.from ??
    firstDate(
      used.map((m) => toDate(m.at)),
      r.to,
    );
  const map = new Map(bucketKeys(from, r.to, b).map((k) => [k, { g: 0, c: 0 }]));
  for (const m of used) {
    const k = bucketKey(toDate(m.at)!, b);
    const acc = map.get(k);
    if (!acc) continue;
    const g = -m.deltaG;
    acc.g += g;
    const s = spoolsById.get(m.spoolId);
    acc.c += s ? (costPerGram(s) ?? 0) * g : 0;
  }
  return [...map].map(([key, v]) => ({
    key,
    label: bucketLabel(key, b),
    value: roundG(v.g),
    extra: Math.round(v.c * 100) / 100,
  }));
}

/** Date d'achat d'une bobine (date d'achat, sinon date de création). */
export function purchaseDateOf(s: Pick<Spool, 'purchaseDate' | 'createdAt'>): Date | null {
  return toDate(s.purchaseDate) ?? toDate(s.createdAt);
}

export function spendingSeries(spools: Spool[], r: Range): SeriesPoint[] {
  const bought = spools.filter((s) => !s.deletedAt && s.price != null && inRange(purchaseDateOf(s), r));
  const from = r.from ?? firstDate(bought.map(purchaseDateOf), r.to);
  const map = new Map(bucketKeys(from, r.to, 'month').map((k) => [k, { a: 0, n: 0 }]));
  for (const s of bought) {
    const acc = map.get(bucketKey(purchaseDateOf(s)!, 'month'));
    if (!acc) continue;
    acc.a += (s.price ?? 0) + (s.shippingShare ?? 0);
    acc.n++;
  }
  return [...map].map(([key, v]) => ({
    key,
    label: bucketLabel(key, 'month'),
    value: Math.round(v.a * 100) / 100,
    extra: v.n,
  }));
}

/** Bobines qui comptent dans le stock. */
export function inStock(spools: Spool[]): Spool[] {
  return spools.filter(
    (s) => !s.deletedAt && s.status !== 'archived' && s.status !== 'empty' && s.remainingG > 0,
  );
}

export interface Slice {
  key: string;
  label: string;
  grams: number;
  value: number;
  count: number;
  hex?: string | null;
}

export function stockByMaterial(spools: Spool[]): Slice[] {
  const map = new Map<string, Slice>();
  for (const s of inStock(spools)) {
    const key = s.material || 'Inconnu';
    const acc = map.get(key) ?? { key, label: key, grams: 0, value: 0, count: 0 };
    acc.grams += s.remainingG;
    acc.value += remainingValue(s);
    acc.count++;
    map.set(key, acc);
  }
  return [...map.values()]
    .map((x) => ({ ...x, grams: roundG(x.grams), value: Math.round(x.value * 100) / 100 }))
    .sort((a, b) => b.grams - a.grams);
}

/** Stock par couleur réelle ; au-delà de `limit`, le reste est regroupé dans « Autres ». */
export function stockByColor(spools: Spool[], limit = 10): Slice[] {
  const map = new Map<string, Slice>();
  for (const s of inStock(spools)) {
    const hex = normalizeHex(s.colorHex);
    const key = `${looseKey(s.colorName) || '?'}|${hex ?? ''}`;
    const acc = map.get(key) ?? {
      key,
      label: s.colorName || 'Couleur inconnue',
      grams: 0,
      value: 0,
      count: 0,
      hex,
    };
    acc.grams += s.remainingG;
    acc.value += remainingValue(s);
    acc.count++;
    map.set(key, acc);
  }
  const sorted = [...map.values()].sort((a, b) => b.grams - a.grams);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  if (tail.length) {
    head.push({
      key: 'autres',
      label: `Autres (${tail.length})`,
      grams: tail.reduce((a, x) => a + x.grams, 0),
      value: tail.reduce((a, x) => a + x.value, 0),
      count: tail.reduce((a, x) => a + x.count, 0),
      hex: null,
    });
  }
  return head.map((x) => ({ ...x, grams: roundG(x.grams), value: Math.round(x.value * 100) / 100 }));
}

export function topFilaments(
  movements: StockMovement[],
  spoolsById: Map<string, Spool>,
  r: Range,
  limit = 8,
): Slice[] {
  const map = new Map<string, Slice>();
  for (const m of activeConsumption(movements)) {
    if (!inRange(toDate(m.at), r)) continue;
    const s = spoolsById.get(m.spoolId);
    if (!s) continue;
    const label = `${s.productLine || s.material} ${s.colorName}`.trim();
    const key = looseKey(label);
    const acc = map.get(key) ?? { key, label, grams: 0, value: 0, count: 0, hex: normalizeHex(s.colorHex) };
    acc.grams += -m.deltaG;
    acc.value += (costPerGram(s) ?? 0) * -m.deltaG;
    acc.count++;
    map.set(key, acc);
  }
  return [...map.values()]
    .map((x) => ({ ...x, grams: roundG(x.grams), value: Math.round(x.value * 100) / 100 }))
    .sort((a, b) => b.grams - a.grams)
    .slice(0, limit);
}

/* --------------------------------- Coûts --------------------------------- */

export interface PrintCost {
  material: number;
  energyKwh: number;
  energy: number;
  total: number;
}

export function printCosts(
  p: Pick<PrintJob, 'usages' | 'durationMin' | 'energyKwh' | 'status'>,
  spoolsById: Map<string, Spool>,
  settings: Pick<AppSettings, 'electricity'>,
): PrintCost {
  const material = p.usages.reduce((a, u) => {
    const s = u.spoolId ? spoolsById.get(u.spoolId) : undefined;
    return a + (s ? (costPerGram(s) ?? 0) * u.grams : 0);
  }, 0);
  const e = settings.electricity;
  const kwh =
    p.status === 'planned' || !e.enabled
      ? 0
      : (p.energyKwh ?? ((p.durationMin ?? 0) / 60) * (e.avgPowerW / 1000));
  const energy = kwh * e.pricePerKwh;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    material: r2(material),
    energyKwh: Math.round(kwh * 1000) / 1000,
    energy: r2(energy),
    total: r2(material + energy),
  };
}

export interface ProjectCost {
  id: string;
  name: string;
  budget: number | null;
  cost: number;
  grams: number;
  prints: number;
  /** Reste à imprimer (g) dans la file d'attente. */
  plannedG: number;
}

export function costByProject(
  prints: PrintJob[],
  projects: Project[],
  spoolsById: Map<string, Spool>,
  settings: Pick<AppSettings, 'electricity'>,
  r: Range,
): ProjectCost[] {
  const byId = new Map<string, ProjectCost>();
  const get = (id: string | null | undefined): ProjectCost => {
    const key = id ?? '__none__';
    let acc = byId.get(key);
    if (!acc) {
      const p = id ? projects.find((x) => x.id === id) : undefined;
      acc = {
        id: key,
        name: p?.name ?? 'Sans projet',
        budget: p?.budget ?? null,
        cost: 0,
        grams: 0,
        prints: 0,
        plannedG: 0,
      };
      byId.set(key, acc);
    }
    return acc;
  };
  for (const p of prints) {
    if (p.deletedAt) continue;
    if (p.status === 'planned') {
      get(p.projectId).plannedG += p.estimatedG ?? p.usages.reduce((a, u) => a + u.grams, 0);
      continue;
    }
    if (!inRange(toDate(p.date) ?? toDate(p.createdAt), r)) continue;
    const acc = get(p.projectId);
    const applied = p.stockApplied !== false;
    acc.cost += applied ? printCosts(p, spoolsById, settings).total : 0;
    acc.grams += applied ? p.usages.reduce((a, u) => a + (u.spoolId ? u.grams : 0), 0) : 0;
    acc.prints++;
  }
  return [...byId.values()]
    .map((x) => ({
      ...x,
      cost: Math.round(x.cost * 100) / 100,
      grams: roundG(x.grams),
      plannedG: roundG(x.plannedG),
    }))
    .sort((a, b) => b.cost - a.cost || b.plannedG - a.plannedG);
}

export interface SuccessRate {
  rate: number | null;
  success: number;
  failed: number;
  cancelled: number;
}

export function successRate(prints: PrintJob[], r: Range): SuccessRate {
  const out = { success: 0, failed: 0, cancelled: 0 };
  for (const p of prints) {
    if (p.deletedAt || p.status === 'planned') continue;
    if (!inRange(toDate(p.date) ?? toDate(p.createdAt), r)) continue;
    out[p.status]++;
  }
  const total = out.success + out.failed + out.cancelled;
  return { ...out, rate: total ? out.success / total : null };
}

/** Coût moyen au gramme du stock, pondéré par le poids net des bobines. */
export function averageCostPerGram(spools: Spool[]): number | null {
  let cost = 0;
  let grams = 0;
  for (const s of spools) {
    if (s.deletedAt || s.price == null || !s.initialNetG) continue;
    cost += s.price + (s.shippingShare ?? 0);
    grams += s.initialNetG;
  }
  return grams ? cost / grams : null;
}

/* ------------------------------- Prévisions ------------------------------- */

export interface Forecast {
  spoolId: string;
  avgPerDayG: number;
  daysLeft: number;
  date: Date;
}

/**
 * Date de rupture estimée d'une bobine, d'après sa consommation moyenne sur `windowDays` jours
 * (fenêtre réduite si la bobine est utilisée depuis moins longtemps). Null sans consommation récente.
 */
export function forecastDepletion(
  spool: Pick<Spool, 'id' | 'remainingG'>,
  movements: StockMovement[],
  now: Date,
  windowDays = 60,
): Forecast | null {
  if (spool.remainingG <= 0) return null;
  const since = subDays(now, windowDays);
  const used = activeConsumption(movements).filter((m) => m.spoolId === spool.id);
  const recent = used.filter((m) => {
    const d = toDate(m.at);
    return d !== null && d >= since && d <= now;
  });
  if (!recent.length) return null;
  const first = firstDate(
    used.map((m) => toDate(m.at)),
    now,
  );
  const days = Math.max(7, Math.min(windowDays, differenceInCalendarDays(now, first) + 1));
  const grams = recent.reduce((a, m) => a - m.deltaG, 0);
  const avg = grams / days;
  if (avg <= 0) return null;
  const daysLeft = Math.floor(spool.remainingG / avg);
  return {
    spoolId: spool.id,
    avgPerDayG: Math.round(avg * 10) / 10,
    daysLeft,
    date: addDays(startOfDay(now), daysLeft),
  };
}

export function forecasts(
  spools: Spool[],
  movements: StockMovement[],
  now: Date,
  windowDays = 60,
): Forecast[] {
  return inStock(spools)
    .map((s) => forecastDepletion(s, movements, now, windowDays))
    .filter((f): f is Forecast => f !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ------------------------------ Filtres globaux ------------------------------ */

export interface DashboardFilters {
  material: string;
  projectId: string;
}

export interface DashboardData {
  spools: Spool[];
  movements: StockMovement[];
  prints: PrintJob[];
}

/** Applique les filtres globaux (matériau, projet) aux données du tableau de bord. */
export function applyFilters(d: DashboardData, f: DashboardFilters): DashboardData {
  let spools = d.spools;
  let prints = d.prints;
  let movements = d.movements;
  if (f.material) {
    spools = spools.filter((s) => s.material === f.material);
    const ids = new Set(spools.map((s) => s.id));
    movements = movements.filter((m) => ids.has(m.spoolId));
    prints = prints.filter((p) => p.usages.some((u) => u.spoolId && ids.has(u.spoolId)));
  }
  if (f.projectId) {
    prints = prints.filter((p) => (p.projectId ?? '__none__') === f.projectId);
    const ids = new Set(prints.map((p) => p.id));
    movements = movements.filter((m) => m.type !== 'print' || (m.refId && ids.has(m.refId)));
  }
  return { spools, movements, prints };
}
