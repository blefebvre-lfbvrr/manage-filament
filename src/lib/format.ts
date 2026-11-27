import { format, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Évite l'affichage « -0 » dû aux arrondis. */
const noNegZero = (v: number, step: number) => (Math.abs(v) < step / 2 ? 0 : v);

export function formatGrams(g: number | null | undefined, unit: 'g' | 'kg' = 'g'): string {
  if (g === null || g === undefined || Number.isNaN(g)) return '—';
  g = noNegZero(g, 0.1);
  if (unit === 'kg' || Math.abs(g) >= 10000) {
    return `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
  }
  return `${g.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
}

export function formatMoney(v: number | null | undefined, currency = 'EUR'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 });
}

export function formatCostPerGram(v: number | null | undefined, currency = 'EUR'): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 1000).toLocaleString('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 })}/kg`;
}

export function formatPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return noNegZero(v, 0.01).toLocaleString('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
}

export function formatDate(iso: string | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, pattern, { locale: fr });
}

export function formatDateTime(iso: string | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, `${pattern} HH:mm`, { locale: fr });
}
