/** Génération des codes courts lisibles (ex. PLA-001), utilisés sur les étiquettes QR. */
import { normalizeText } from './text';

export function codePrefix(material: string): string {
  const m = normalizeText(material)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!m) return 'FIL';
  return m.slice(0, 4);
}

/** Prochain code libre pour un préfixe donné : PLA-001, PLA-002… */
export function nextCode(prefix: string, existing: Iterable<string>): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let max = 0;
  for (const c of existing) {
    const m = re.exec(c);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Génère n codes successifs. */
export function nextCodes(prefix: string, existing: Iterable<string>, n: number): string[] {
  const taken = new Set(existing);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = nextCode(prefix, taken);
    taken.add(c);
    out.push(c);
  }
  return out;
}
