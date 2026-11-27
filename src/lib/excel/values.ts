/** Conversion des valeurs de cellules (format français toléré). */
import { normalizeText } from '../text';

export type Parsed<T> = { ok: true; value: T | null } | { ok: false; error: string };

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function parseNumber(v: unknown): Parsed<number> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === 'number')
    return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, error: 'nombre invalide' };
  if (typeof v === 'boolean') return { ok: false, error: 'booléen au lieu d’un nombre' };
  const s = String(v)
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[€$£g%]|kg|eur/gi, '')
    .replace(',', '.');
  if (s === '' || s === '-') return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n)
    ? { ok: true, value: n }
    : { ok: false, error: `« ${String(v)} » n’est pas un nombre` };
}

function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date Excel (numéro de série) → Date locale. */
export function excelSerialToDate(serial: number): Date {
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(utc);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function parseDate(v: unknown): Parsed<string> {
  if (isBlank(v)) return { ok: true, value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false, error: 'date invalide' };
    // SheetJS crée des dates à minuit UTC décalées : on ajoute 12 h pour retomber sur le bon jour.
    const shifted = new Date(v.getTime() + 12 * 3600 * 1000);
    return {
      ok: true,
      value: toIsoDay(new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())),
    };
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 2958465) return { ok: false, error: 'numéro de date Excel invalide' };
    return { ok: true, value: toIsoDay(excelSerialToDate(v)) };
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = Number(yRaw!.length === 2 ? `20${yRaw}` : yRaw);
    const date = new Date(y, Number(mo) - 1, Number(d));
    if (date.getMonth() !== Number(mo) - 1) return { ok: false, error: `date « ${s} » invalide` };
    return { ok: true, value: toIsoDay(date) };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { ok: true, value: `${m[1]}-${m[2]}-${m[3]}` };
  return { ok: false, error: `« ${s} » n’est pas une date reconnue (jj/mm/aaaa)` };
}

export function parseBool(v: unknown): Parsed<boolean> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === 'boolean') return { ok: true, value: v };
  if (typeof v === 'number') return { ok: true, value: v !== 0 };
  const n = normalizeText(v);
  if (['oui', 'o', 'yes', 'y', 'true', 'vrai', 'x', '1', '✓', 'ok'].includes(n))
    return { ok: true, value: true };
  if (['non', 'n', 'no', 'false', 'faux', '0', '-'].includes(n)) return { ok: true, value: false };
  return { ok: false, error: `« ${String(v)} » n’est pas oui/non` };
}

export function parseString(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return parseDate(v).ok ? (parseDate(v) as { value: string }).value : String(v);
  return String(v).trim();
}
