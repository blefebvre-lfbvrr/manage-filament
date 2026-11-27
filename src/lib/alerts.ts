/** Alertes de stock, rappels de séchage et liste de courses. Fonctions pures. */
import { differenceInCalendarDays } from 'date-fns';
import { findColor, findProduct, usualPrice } from './catalog';
import { formatGrams } from './format';
import { roundG } from './movements';
import type {
  AlertRule,
  AppSettings,
  CatalogBrand,
  CatalogColor,
  CatalogProduct,
  ShoppingItem,
  Spool,
} from './schemas';
import { isHygroscopic, spoolLevel, type StockLevel } from './spool';
import { inStock, toDate } from './stats';
import { looseKey } from './text';

export type Severity = 'info' | 'warning' | 'critical';

export interface Alert {
  /** Clé stable (sert à mémoriser « lu » et « notifié »). */
  key: string;
  kind: 'level' | 'rule' | 'drying' | 'weighing' | 'backup';
  severity: Severity;
  title: string;
  body: string;
  link: string;
}

export const SCOPE_LABELS: Record<AlertRule['scope'], string> = {
  spool: 'Bobine',
  material: 'Matériau',
  productLine: 'Gamme',
  color: 'Couleur',
  productColor: 'Gamme + couleur',
};

/** Séparateur de la valeur « gamme + couleur » d'une règle (ex. « PLA Basic|Noir »). */
export const PRODUCT_COLOR_SEP = '|';

export function ruleLabel(r: Pick<AlertRule, 'scope' | 'value'>): string {
  if (r.scope === 'productColor') return r.value.split(PRODUCT_COLOR_SEP).join(' ');
  return r.value;
}

export function ruleMatches(r: Pick<AlertRule, 'scope' | 'value'>, s: Spool): boolean {
  const v = looseKey(r.value);
  switch (r.scope) {
    case 'spool':
      return s.id === r.value || s.code === r.value;
    case 'material':
      return looseKey(s.material) === v;
    case 'productLine':
      return looseKey(s.productLine) === v;
    case 'color':
      return looseKey(s.colorName) === v;
    case 'productColor': {
      const [line = '', color = ''] = r.value.split(PRODUCT_COLOR_SEP);
      return looseKey(s.productLine) === looseKey(line) && looseKey(s.colorName) === looseKey(color);
    }
  }
}

export interface RuleStatus {
  rule: AlertRule;
  spools: Spool[];
  spoolCount: number;
  grams: number;
  /** Bobines manquantes pour atteindre le minimum (0 si OK). */
  missingSpools: number;
  /** Grammes manquants (0 si OK). */
  missingG: number;
  ok: boolean;
}

/**
 * Une règle compte les bobines en stock (ni vides, ni archivées) qui lui correspondent.
 * Les bobines « à changer » ne comptent pas comme une bobine disponible.
 */
export function evaluateRule(
  rule: AlertRule,
  spools: Spool[],
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
): RuleStatus {
  const matching = inStock(spools).filter((s) => ruleMatches(rule, s));
  const usable = matching.filter((s) => spoolLevel(s, settings) !== 'critical');
  const grams = roundG(matching.reduce((a, s) => a + s.remainingG, 0));
  const missingSpools = rule.minSpools ? Math.max(0, rule.minSpools - usable.length) : 0;
  const missingG = rule.minGrams ? Math.max(0, roundG(rule.minGrams - grams)) : 0;
  return {
    rule,
    spools: matching,
    spoolCount: usable.length,
    grams,
    missingSpools,
    missingG,
    ok: missingSpools === 0 && missingG === 0,
  };
}

export function evaluateRules(
  rules: AlertRule[],
  spools: Spool[],
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
): RuleStatus[] {
  return rules.filter((r) => r.enabled && !r.deletedAt).map((r) => evaluateRule(r, spools, settings));
}

/* ------------------------------- Séchage ------------------------------- */

export interface DryingStatus {
  spool: Spool;
  /** Jours depuis le dernier séchage (ou depuis l'ouverture si jamais séchée). */
  days: number;
  since: 'dried' | 'opened' | 'unknown';
}

/** Bobines hygroscopiques ouvertes qui n'ont pas été séchées depuis `dryingReminderDays` jours. */
export function dryingDue(
  spools: Spool[],
  products: CatalogProduct[],
  settings: Pick<AppSettings, 'dryingReminderDays'>,
  now: Date,
): DryingStatus[] {
  if (!settings.dryingReminderDays) return [];
  const out: DryingStatus[] = [];
  for (const s of spools) {
    if (s.deletedAt || !['opened', 'ams', 'external'].includes(s.status) || s.remainingG <= 0) continue;
    const product = s.catalogProductId ? products.find((p) => p.id === s.catalogProductId) : undefined;
    if (!(product?.hygroscopic ?? isHygroscopic(s.material))) continue;
    const dried = toDate(s.lastDriedAt);
    const opened = toDate(s.openedAt);
    const ref = dried ?? opened;
    const days = ref ? differenceInCalendarDays(now, ref) : Number.POSITIVE_INFINITY;
    if (days >= settings.dryingReminderDays)
      out.push({
        spool: s,
        days: Number.isFinite(days) ? days : -1,
        since: dried ? 'dried' : opened ? 'opened' : 'unknown',
      });
  }
  return out.sort((a, b) => b.days - a.days);
}

/* ------------------------------- Alertes ------------------------------- */

const LEVEL_SEVERITY: Record<StockLevel, Severity | null> = {
  ok: null,
  low: 'info',
  critical: 'warning',
  empty: 'critical',
};
const LEVEL_TEXT: Record<StockLevel, string> = {
  ok: '',
  low: 'bientôt vide',
  critical: 'à changer',
  empty: 'vide',
};

export interface AlertInput {
  spools: Spool[];
  rules: AlertRule[];
  products: CatalogProduct[];
  settings: AppSettings;
  now: Date;
  backupDue?: boolean;
}

export function buildAlerts({ spools, rules, products, settings, now, backupDue }: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  for (const s of spools) {
    if (s.deletedAt || s.status === 'archived' || s.status === 'sealed') continue;
    // Une bobine marquée vide n'alerte plus (elle est traitée par la liste de courses).
    if (s.status === 'empty') continue;
    const level = spoolLevel(s, settings);
    const severity = LEVEL_SEVERITY[level];
    if (!severity) continue;
    alerts.push({
      key: `level:${s.id}:${level}`,
      kind: 'level',
      severity,
      title: `${s.code} ${LEVEL_TEXT[level]}`,
      body: `${s.productLine || s.material} ${s.colorName} : ${formatGrams(s.remainingG)} restants${s.status === 'ams' ? ` (AMS ${s.amsSlot})` : ''}.`,
      link: `/spools/${s.id}`,
    });
  }
  for (const st of evaluateRules(rules, spools, settings)) {
    if (st.ok) continue;
    const parts: string[] = [];
    if (st.missingSpools) parts.push(`${st.spoolCount}/${st.rule.minSpools} bobine(s)`);
    if (st.missingG) parts.push(`${formatGrams(st.grams)} / ${formatGrams(st.rule.minGrams)}`);
    alerts.push({
      key: `rule:${st.rule.id}:${st.spoolCount}:${Math.round(st.grams / 50)}`,
      kind: 'rule',
      severity: st.spoolCount === 0 && st.grams <= 0 ? 'critical' : 'warning',
      title: `Stock minimum : ${ruleLabel(st.rule)}`,
      body: `En stock : ${parts.join(', ')}. À racheter.`,
      link: '/shopping',
    });
  }
  for (const d of dryingDue(spools, products, settings, now)) {
    alerts.push({
      key: `drying:${d.spool.id}:${d.spool.lastDriedAt ?? d.spool.openedAt ?? 'x'}`,
      kind: 'drying',
      severity: 'info',
      title: `Séchage conseillé : ${d.spool.code}`,
      body:
        d.since === 'unknown'
          ? `${d.spool.material} ouvert, jamais séché.`
          : `${d.spool.material} ${d.since === 'dried' ? 'séché' : 'ouvert'} il y a ${d.days} jours.`,
      link: `/spools/${d.spool.id}`,
    });
  }
  for (const s of spools) {
    if (s.deletedAt || !s.needsWeighing || s.status === 'archived') continue;
    alerts.push({
      key: `weighing:${s.id}`,
      kind: 'weighing',
      severity: 'info',
      title: `Pesée recommandée : ${s.code}`,
      body: 'Le restant est estimé ou incohérent.',
      link: '/weigh',
    });
  }
  if (backupDue)
    alerts.push({
      key: `backup:${now.toISOString().slice(0, 10)}`,
      kind: 'backup',
      severity: 'info',
      title: 'Sauvegarde conseillée',
      body: 'Télécharge une sauvegarde JSON de tes données.',
      link: '/data#backup',
    });
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ---------------------------- Liste de courses ---------------------------- */

export interface ShoppingLine {
  key: string;
  label: string;
  brand: string | null;
  productLine: string | null;
  colorName: string | null;
  colorHex: string | null;
  catalogProductId: string | null;
  catalogColorId: string | null;
  isRefill: boolean;
  quantity: number;
  unitPrice: number | null;
  productUrl: string | null;
  reason: string;
  source: ShoppingItem['source'];
  /** Id de la ligne enregistrée (ajouts manuels). */
  itemId?: string;
}

export interface Catalog {
  brands: CatalogBrand[];
  products: CatalogProduct[];
  colors: CatalogColor[];
}

function lineFor(
  template: Pick<
    Spool,
    | 'brand'
    | 'productLine'
    | 'material'
    | 'colorName'
    | 'colorHex'
    | 'catalogProductId'
    | 'catalogColorId'
    | 'isRefill'
  >,
  catalog: Catalog,
  history: Spool[],
): Omit<ShoppingLine, 'key' | 'quantity' | 'reason' | 'source'> {
  const product =
    (template.catalogProductId && catalog.products.find((p) => p.id === template.catalogProductId)) ||
    findProduct(template.productLine, catalog.products);
  const color =
    (template.catalogColorId && catalog.colors.find((c) => c.id === template.catalogColorId)) ||
    findColor(catalog.colors, { productId: product?.id, name: template.colorName });
  const label =
    [template.brand, template.productLine || template.material, template.colorName]
      .filter(Boolean)
      .join(' ') + (template.isRefill ? ' (recharge)' : '');
  return {
    label,
    brand: template.brand || null,
    productLine: template.productLine || template.material || null,
    colorName: template.colorName || null,
    colorHex: template.colorHex ?? color?.hex ?? null,
    catalogProductId: product?.id ?? null,
    catalogColorId: color?.id ?? null,
    isRefill: template.isRefill,
    unitPrice: usualPrice(product, history, template.isRefill) ?? null,
    productUrl: color?.productUrl ?? product?.productUrl ?? null,
  };
}

/**
 * Suggestions automatiques :
 * - règles de stock minimum non respectées ;
 * - bobines à changer / vides (et bientôt vides si l'option est active) sans bobine de rechange
 *   identique (même gamme + couleur) encore neuve.
 */
export function shoppingSuggestions(
  spools: Spool[],
  rules: AlertRule[],
  catalog: Catalog,
  settings: AppSettings,
): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>();
  const keyOf = (line: string | null | undefined, color: string | null | undefined, refill: boolean) =>
    `${looseKey(line)}|${looseKey(color)}|${refill ? 'r' : 'b'}`;
  const add = (
    k: string,
    base: Omit<ShoppingLine, 'key' | 'quantity' | 'reason' | 'source'>,
    qty: number,
    reason: string,
  ) => {
    const cur = lines.get(k);
    if (cur) {
      cur.quantity = Math.max(cur.quantity, qty);
      if (!cur.reason.includes(reason)) cur.reason += ` · ${reason}`;
    } else lines.set(k, { ...base, key: k, quantity: qty, reason, source: 'alert' });
  };

  for (const st of evaluateRules(rules, spools, settings)) {
    if (st.ok) continue;
    const r = st.rule;
    const sample = st.spools[0] ?? spools.find((s) => ruleMatches(r, s));
    let template: Parameters<typeof lineFor>[0];
    if (sample) template = sample;
    else {
      const [line, color] =
        r.scope === 'productColor'
          ? r.value.split(PRODUCT_COLOR_SEP)
          : [
              r.scope === 'productLine' || r.scope === 'material' ? r.value : '',
              r.scope === 'color' ? r.value : '',
            ];
      template = {
        brand: '',
        productLine: line ?? '',
        material: r.scope === 'material' ? r.value : '',
        colorName: color ?? '',
        colorHex: null,
        catalogProductId: null,
        catalogColorId: null,
        isRefill: false,
      };
    }
    const qty = Math.max(st.missingSpools, st.missingG ? Math.ceil(st.missingG / 1000) : 0, 1);
    add(
      keyOf(
        template.productLine || template.material,
        r.scope === 'material' || r.scope === 'productLine' ? '' : template.colorName,
        template.isRefill,
      ),
      lineFor(template, catalog, spools),
      qty,
      `minimum « ${ruleLabel(r)} »`,
    );
  }

  const levels: StockLevel[] = settings.shoppingIncludeLow
    ? ['low', 'critical', 'empty']
    : ['critical', 'empty'];
  for (const s of spools) {
    if (s.deletedAt || s.status === 'archived') continue;
    const level = s.status === 'empty' ? 'empty' : spoolLevel(s, settings);
    if (!levels.includes(level)) continue;
    const spare = spools.some(
      (o) =>
        o.id !== s.id &&
        !o.deletedAt &&
        o.status !== 'archived' &&
        o.status !== 'empty' &&
        looseKey(o.productLine) === looseKey(s.productLine) &&
        looseKey(o.colorName) === looseKey(s.colorName) &&
        spoolLevel(o, settings) === 'ok',
    );
    if (spare) continue;
    add(
      keyOf(s.productLine || s.material, s.colorName, s.isRefill),
      lineFor(s, catalog, spools),
      1,
      `${s.code} ${level === 'empty' ? 'vide' : level === 'critical' ? 'à changer' : 'bientôt vide'}`,
    );
  }
  return [...lines.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

export function itemToLine(i: ShoppingItem): ShoppingLine {
  return {
    key: `item:${i.id}`,
    itemId: i.id,
    label: i.label,
    brand: i.brand ?? null,
    productLine: i.productLine ?? null,
    colorName: i.colorName ?? null,
    colorHex: i.colorHex ?? null,
    catalogProductId: i.catalogProductId ?? null,
    catalogColorId: i.catalogColorId ?? null,
    isRefill: i.isRefill,
    quantity: i.quantity,
    unitPrice: i.unitPrice ?? null,
    productUrl: i.productUrl ?? null,
    reason: i.note || (i.source === 'project' ? 'projet' : 'ajout manuel'),
    source: i.source,
  };
}

export function shoppingTotal(lines: Pick<ShoppingLine, 'quantity' | 'unitPrice'>[]): {
  total: number;
  unknown: number;
} {
  let total = 0;
  let unknown = 0;
  for (const l of lines) {
    if (l.unitPrice == null) unknown++;
    else total += l.unitPrice * l.quantity;
  }
  return { total: Math.round(total * 100) / 100, unknown };
}

/** Texte prêt à coller (message, note…). */
export function shoppingText(lines: ShoppingLine[], currency = 'EUR'): string {
  const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency });
  const rows = lines.map(
    (l) =>
      `- ${l.quantity} × ${l.label}${l.unitPrice != null ? ` (~${fmt(l.unitPrice)})` : ''}${l.productUrl ? ` — ${l.productUrl}` : ''}`,
  );
  const { total, unknown } = shoppingTotal(lines);
  return [
    `Liste de courses filament`,
    ...rows,
    ``,
    `Total estimé : ${fmt(total)}${unknown ? ` (+ ${unknown} prix inconnu${unknown > 1 ? 's' : ''})` : ''}`,
  ].join('\n');
}
