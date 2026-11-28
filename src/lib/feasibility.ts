/**
 * Analyse de faisabilité : « ai-je assez de filament pour imprimer ça ? ».
 * Besoin = plan (.3mf × quantités) + marge de sécurité + marge pour les ratés,
 * comparé au stock disponible (restant − réservé par les autres projets).
 */
import { addDays } from 'date-fns';
import { findColor, findProduct, usualPrice, type CatalogLike } from './catalog';
import { colorDistance, normalizeHex } from './color';
import { roundG } from './movements';
import type { AppSettings, Spool } from './schemas';
import { sameProduct } from './slicer/bambu';
import { normalizeSlicerType } from './slicer/match';
import type { PlannedFilament } from './projects';

/** Écart de couleur (distance « redmean ») en dessous duquel on parle de la même couleur. */
export const SAME_COLOR_MAX = 40;

export type FeasibilityStatus = 'ok' | 'tight' | 'order';

export interface SpoolOption {
  spool: Spool;
  availableG: number;
  /** Écart de couleur avec le filament demandé (0 = identique). */
  colorGap: number | null;
  exact: boolean;
}

export interface OrderSuggestion {
  label: string;
  productId: string | null;
  colorId: string | null;
  colorName: string | null;
  colorHex: string | null;
  isRefill: boolean;
  netWeightG: number;
  quantity: number;
  unitPrice: number | null;
  productUrl: string | null;
}

export interface FilamentFeasibility {
  need: PlannedFilament;
  /** Besoin avec marges (g). */
  neededG: number;
  /** Bobines identiques (même gamme, même couleur), triées par disponible décroissant. */
  exact: SpoolOption[];
  /** Alternatives : même matériau, couleur la plus proche. */
  alternatives: SpoolOption[];
  /** Bobines retenues (exactes + alternatives acceptées). */
  chosen: SpoolOption[];
  availableG: number;
  missingG: number;
  status: FeasibilityStatus;
  /** Une seule bobine ne suffit pas mais plusieurs ensemble oui (changement de bobine en cours d'impression). */
  needsSwap: boolean;
  order: OrderSuggestion | null;
}

export interface FeasibilityInput {
  needs: PlannedFilament[];
  /** Bobines avec leur disponible (voir withAvailable). */
  spools: (Spool & { availableG: number })[];
  settings: Pick<AppSettings, 'projects'>;
  catalog?: CatalogLike;
  /** Alternatives acceptées : clé du besoin → ids de bobines. */
  accepted?: Record<string, string[]>;
}

export function withMargins(grams: number, settings: Pick<AppSettings, 'projects'>): number {
  const { safetyMarginPct, failMarginPct } = settings.projects;
  return roundG(grams * (1 + safetyMarginPct / 100 + failMarginPct / 100));
}

function sameMaterial(type: string, s: Spool): boolean {
  const want = normalizeSlicerType(type).toUpperCase();
  return Boolean(want) && s.material.toUpperCase() === want;
}

export function spoolOptions(
  need: PlannedFilament,
  spools: (Spool & { availableG: number })[],
): { exact: SpoolOption[]; alternatives: SpoolOption[] } {
  const exact: SpoolOption[] = [];
  const alternatives: SpoolOption[] = [];
  const hex = normalizeHex(need.color);
  for (const s of spools) {
    if (s.deletedAt || s.status === 'archived' || s.status === 'empty' || s.availableG <= 0) continue;
    if (!sameMaterial(need.type, s)) continue;
    const gap = hex && s.colorHex ? Math.round(colorDistance(hex, s.colorHex)) : null;
    const productOk = !need.productHint || sameProduct(need.productHint, s.productLine);
    const isExact = productOk && (gap === null ? false : gap <= SAME_COLOR_MAX);
    const opt = { spool: s, availableG: s.availableG, colorGap: gap, exact: isExact };
    (isExact ? exact : alternatives).push(opt);
  }
  exact.sort((a, b) => b.availableG - a.availableG);
  alternatives.sort((a, b) => (a.colorGap ?? 9999) - (b.colorGap ?? 9999) || b.availableG - a.availableG);
  return { exact, alternatives: alternatives.slice(0, 5) };
}

function orderFor(
  need: PlannedFilament,
  missingG: number,
  catalog: CatalogLike | undefined,
  history: Spool[],
): OrderSuggestion {
  const product = catalog ? findProduct(need.productHint || need.type, catalog.products) : undefined;
  let color = catalog && product ? findColor(catalog.colors, { productId: product.id }) : undefined;
  if (catalog && product && need.color) {
    const candidates = catalog.colors.filter((c) => c.productId === product.id && !c.deletedAt);
    color = candidates.sort(
      (a, b) => colorDistance(need.color!, a.hex) - colorDistance(need.color!, b.hex),
    )[0];
  }
  const net = product?.netWeightG ?? 1000;
  const refill = Boolean(product?.refillPrice);
  const brand = catalog?.brands.find((b) => b.id === product?.brandId);
  return {
    label:
      [brand?.name, product?.name ?? need.productHint ?? need.type, color?.name ?? need.color]
        .filter(Boolean)
        .join(' ') + (refill ? ' (recharge)' : ''),
    productId: product?.id ?? null,
    colorId: color?.id ?? null,
    colorName: color?.name ?? null,
    colorHex: color?.hex ?? normalizeHex(need.color),
    isRefill: refill,
    netWeightG: net,
    quantity: Math.max(1, Math.ceil(missingG / net)),
    unitPrice: usualPrice(product, history, refill),
    productUrl: color?.productUrl ?? product?.productUrl ?? null,
  };
}

export function analyzeFeasibility({
  needs,
  spools,
  settings,
  catalog,
  accepted = {},
}: FeasibilityInput): FilamentFeasibility[] {
  // Une bobine n'est pas comptée deux fois si plusieurs besoins pourraient l'utiliser.
  const left = new Map(spools.map((s) => [s.id, s.availableG]));
  return needs.map((need) => {
    const neededG = withMargins(need.grams, settings);
    const current = spools.map((s) => ({ ...s, availableG: left.get(s.id) ?? 0 }));
    const { exact, alternatives } = spoolOptions(need, current);
    const acceptedIds = accepted[need.key] ?? [];
    const chosen = [...exact, ...alternatives.filter((a) => acceptedIds.includes(a.spool.id))];
    let remaining = need.grams;
    for (const c of chosen) {
      const take = Math.min(remaining, c.availableG);
      left.set(c.spool.id, roundG((left.get(c.spool.id) ?? 0) - take));
      remaining -= take;
    }
    const availableG = roundG(chosen.reduce((a, c) => a + c.availableG, 0));
    const missingG = roundG(Math.max(0, neededG - availableG));
    const status: FeasibilityStatus =
      availableG >= neededG ? 'ok' : availableG >= need.grams ? 'tight' : 'order';
    const best = Math.max(0, ...chosen.map((c) => c.availableG));
    const needsSwap = best < need.grams && availableG >= need.grams;
    return {
      need,
      neededG,
      exact,
      alternatives,
      chosen,
      availableG,
      missingG,
      status,
      needsSwap,
      order:
        status === 'ok'
          ? null
          : orderFor(need, Math.max(missingG, status === 'tight' ? 1 : 0), catalog, spools),
    };
  });
}

export interface FeasibilitySummary {
  status: FeasibilityStatus;
  missingG: number;
  orderTotal: number;
  unknownPrices: number;
}

export function summarize(rows: FilamentFeasibility[]): FeasibilitySummary {
  const status: FeasibilityStatus = rows.some((r) => r.status === 'order')
    ? 'order'
    : rows.some((r) => r.status === 'tight')
      ? 'tight'
      : 'ok';
  let orderTotal = 0;
  let unknownPrices = 0;
  for (const r of rows) {
    if (!r.order || r.status !== 'order') continue;
    if (r.order.unitPrice == null) unknownPrices++;
    else orderTotal += r.order.unitPrice * r.order.quantity;
  }
  return {
    status,
    missingG: roundG(rows.reduce((a, r) => a + r.missingG, 0)),
    orderTotal: Math.round(orderTotal * 100) / 100,
    unknownPrices,
  };
}

/** Durée totale et date de fin possible, à raison de `printHoursPerDay` heures d'impression par jour. */
export function timeEstimate(
  totalTimeS: number,
  settings: Pick<AppSettings, 'projects'>,
  now: Date,
): { hours: number; days: number; endDate: Date } {
  const hours = totalTimeS / 3600;
  const days = Math.ceil(hours / settings.projects.printHoursPerDay);
  return { hours: Math.round(hours * 10) / 10, days, endDate: addDays(now, days) };
}
