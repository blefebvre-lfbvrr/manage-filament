/** Correspondances indicatives entre profils Bambu et gammes du catalogue. */
import { looseKey } from '../text';

// Identifiants de profils Bambu courants (tray_info_idx). Liste volontairement courte :
// le nom du profil (filament_settings_id) est la source privilégiée.
const TRAY_IDX: Record<string, string> = {
  GFA00: 'PLA Basic',
  GFA01: 'PLA Matte',
  GFB00: 'ABS',
  GFB01: 'ASA',
  GFG02: 'PETG HF',
};

/** « Bambu PLA Basic @BBL A1 » → « PLA Basic » ; « Generic PLA @BBL A1 » → null. */
export function productFromSettingsId(settingsId: string | null | undefined): string | null {
  if (!settingsId) return null;
  let s = settingsId
    .replace(/^"|"$/g, '')
    .replace(/\s*@.*$/, '')
    .trim();
  if (/^generic\b/i.test(s)) return null;
  s = s.replace(/^bambu(\s+lab)?\s+/i, '').trim();
  return s || null;
}

export function productFromTrayIdx(idx: string | null | undefined): string | null {
  if (!idx) return null;
  return TRAY_IDX[idx.toUpperCase()] ?? null;
}

export function productHint(settingsId?: string | null, trayIdx?: string | null): string | null {
  return productFromSettingsId(settingsId) ?? productFromTrayIdx(trayIdx);
}

export function sameProduct(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = looseKey(a).replace(/\+$/, '');
  const kb = looseKey(b).replace(/\+$/, '');
  return ka === kb || ka.replace(/ /g, '') === kb.replace(/ /g, '');
}

/** Masse (g) depuis une longueur, si le slicer n'a pas donné le poids. */
export function gramsFromLength(lengthM: number, densityGcm3 = 1.24, diameterMm = 1.75): number {
  const r = diameterMm / 20; // rayon en cm
  return Math.round(Math.PI * r * r * lengthM * 100 * densityGcm3 * 100) / 100;
}

/** « 1d 2h 3m 4s » / « 2h 5m » → secondes. */
export function parseDurationText(text: string | null | undefined): number | null {
  if (!text) return null;
  const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\b/gi;
  let total = 0;
  let found = false;
  for (const m of text.matchAll(re)) {
    found = true;
    const v = Number(m[1]);
    total += v * { d: 86400, h: 3600, m: 60, s: 1 }[m[2]!.toLowerCase() as 'd' | 'h' | 'm' | 's'];
  }
  return found ? Math.round(total) : null;
}
