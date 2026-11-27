/** Calculs métier sur les bobines (fonctions pures). */
import type { AppSettings, Spool, SpoolStatus } from './schemas';
import { normalizeText } from './text';

export type StockLevel = 'ok' | 'low' | 'critical' | 'empty';

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  ok: 'OK',
  low: 'Bientôt vide',
  critical: 'À changer',
  empty: 'Vide',
};

export const SPOOL_STATUS_LABELS: Record<SpoolStatus, string> = {
  sealed: 'Neuve scellée',
  opened: 'Ouverte',
  ams: 'Dans l’AMS',
  external: 'Support externe',
  empty: 'Vide',
  archived: 'Archivée',
};

export interface Thresholds {
  lowG: number;
  criticalG: number;
}

export function effectiveThresholds(
  spool: Pick<Spool, 'lowThresholdG' | 'criticalThresholdG'>,
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
): Thresholds {
  return {
    lowG: spool.lowThresholdG ?? settings.lowThresholdG,
    criticalG: spool.criticalThresholdG ?? settings.criticalThresholdG,
  };
}

/** Niveau de stock d'une bobine selon ses seuils (ou les seuils globaux). */
export function spoolLevel(
  spool: Pick<Spool, 'remainingG' | 'lowThresholdG' | 'criticalThresholdG'>,
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
): StockLevel {
  return stockLevel(spool.remainingG, effectiveThresholds(spool, settings));
}

/** Niveau de stock, mêmes règles que l'Excel : Vide ≤ 0 < À changer ≤ seuil bas < Bientôt vide ≤ seuil haut < OK. */
export function stockLevel(remainingG: number, t: Thresholds): StockLevel {
  if (remainingG <= 0) return 'empty';
  if (remainingG <= t.criticalG) return 'critical';
  if (remainingG <= t.lowG) return 'low';
  return 'ok';
}

export function percentRemaining(remainingG: number, initialNetG: number): number | null {
  if (!initialNetG || initialNetG <= 0) return null;
  return remainingG / initialNetG;
}

/** Coût au gramme : (prix + frais de port répartis) / poids net initial. */
export function costPerGram(spool: Pick<Spool, 'price' | 'shippingShare' | 'initialNetG'>): number | null {
  if (spool.price === null || spool.price === undefined) return null;
  if (!spool.initialNetG || spool.initialNetG <= 0) return null;
  return (spool.price + (spool.shippingShare ?? 0)) / spool.initialNetG;
}

export function consumedG(spool: Pick<Spool, 'initialNetG' | 'remainingG'>): number {
  return spool.initialNetG - spool.remainingG;
}

/** Valeur restante en stock (€). */
export function remainingValue(
  spool: Pick<Spool, 'price' | 'shippingShare' | 'initialNetG' | 'remainingG'>,
): number {
  const cpg = costPerGram(spool);
  if (cpg === null) return 0;
  return Math.max(0, spool.remainingG) * cpg;
}

/** Poids net à partir d'une pesée brute. */
export function netFromGross(grossG: number, tareG: number | null | undefined): number {
  return Math.round((grossG - (tareG ?? 0)) * 10) / 10;
}

const MATERIAL_PATTERNS: [RegExp, string][] = [
  [/support/, 'Support'],
  [/petg|pet-g/, 'PETG'],
  [/pctg/, 'PCTG'],
  [/\bpet\b/, 'PET'],
  [/tpu|tpe|flex/, 'TPU'],
  [/abs.*asa|asa.*abs/, 'ABS/ASA'],
  [/\basa\b/, 'ASA'],
  [/\babs\b/, 'ABS'],
  [/\bpa\b|nylon|paht|pa6|pa12/, 'PA'],
  [/\bpc\b|polycarbonate/, 'PC'],
  [/pva/, 'PVA'],
  [/hips/, 'HIPS'],
  [/pla/, 'PLA'],
];

/** Déduit le matériau générique d'un nom de gamme (« PLA Matte » → PLA). */
export function materialFromProductLine(productLine: string): string {
  const n = normalizeText(productLine);
  if (!n) return '';
  for (const [re, mat] of MATERIAL_PATTERNS) if (re.test(n)) return mat;
  return productLine.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
}

/** Matériaux qui reprennent l'humidité et nécessitent un séchage. */
export function isHygroscopic(material: string): boolean {
  return ['PETG', 'PCTG', 'TPU', 'PA', 'PC', 'PVA', 'ABS', 'ASA', 'ABS/ASA'].includes(material.toUpperCase());
}

/** Libellé court d'une bobine. */
export function spoolLabel(s: Pick<Spool, 'code' | 'productLine' | 'material' | 'colorName'>): string {
  return [s.code, s.productLine || s.material, s.colorName].filter(Boolean).join(' · ');
}

/** Statut automatique si la bobine est vidée. */
export function statusAfterRemainingChange(current: SpoolStatus, remainingG: number): SpoolStatus {
  if (remainingG <= 0 && current !== 'archived') return 'empty';
  if (remainingG > 0 && current === 'empty') return 'opened';
  return current;
}
