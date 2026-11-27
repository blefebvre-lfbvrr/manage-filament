/** Rattachement des filaments du slicer aux bobines : type, puis couleur, puis slot AMS. */
import { colorDistance, normalizeHex } from '../color';
import type { Spool } from '../schemas';
import { materialFromProductLine } from '../spool';
import { sameProduct } from './bambu';
import type { SlicerFilament } from './types';

export interface MatchCandidate {
  spool: Spool;
  score: number;
  reasons: string[];
}

/** Couleurs considérées identiques (même teinte à quelques nuances près). */
const SAME_COLOR = 40;

export function normalizeSlicerType(type: string): string {
  const t = type.trim().toUpperCase();
  if (/^(PLA-S|SUPPORT)/.test(t) || /SUPPORT/.test(t)) return 'Support';
  return materialFromProductLine(t) || t;
}

export function rankCandidates(f: SlicerFilament, spools: Spool[]): MatchCandidate[] {
  const material = normalizeSlicerType(f.type);
  const hex = normalizeHex(f.color);
  const out: MatchCandidate[] = [];
  for (const s of spools) {
    if (s.deletedAt || s.status === 'archived') continue;
    const reasons: string[] = [];
    let score = 0;
    const sameMaterial =
      material &&
      (s.material.toUpperCase() === material.toUpperCase() ||
        materialFromProductLine(s.productLine).toUpperCase() === material.toUpperCase());
    if (material && !sameMaterial) continue;
    if (sameMaterial) {
      score += 20;
      reasons.push(`même matériau (${material})`);
    }
    if (sameProduct(f.productHint, s.productLine)) {
      score += 25;
      reasons.push(`même gamme (${s.productLine})`);
    }
    if (hex && s.colorHex) {
      const d = colorDistance(hex, s.colorHex);
      if (d <= SAME_COLOR) {
        score += 40;
        reasons.push('même couleur');
      } else if (d <= 150) {
        score += 20;
        reasons.push('couleur proche');
      } else score -= 10;
    }
    if (s.status === 'ams') {
      score += 10;
      if (s.amsSlot === f.id) {
        score += 15;
        reasons.push(`slot AMS ${s.amsSlot}`);
      } else reasons.push(`dans l’AMS (slot ${s.amsSlot})`);
    } else if (s.status === 'external') {
      score += 5;
      reasons.push('support externe');
    }
    if (s.status === 'empty' || s.remainingG <= 0) {
      score -= 30;
      reasons.push('bobine vide');
    } else if (s.remainingG < f.usedG) {
      score -= 5;
      reasons.push('stock insuffisant');
    }
    out.push({ spool: s, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || b.spool.remainingG - a.spool.remainingG);
}

/** Meilleure bobine si la correspondance est assez sûre (même couleur, ou bon slot AMS). */
export function autoMatch(f: SlicerFilament, spools: Spool[]): MatchCandidate | null {
  const best = rankCandidates(f, spools)[0];
  if (!best) return null;
  return best.score >= 55 ? best : null;
}

/** Attribue une bobine distincte à chaque filament quand c'est possible. */
export function autoMatchAll(filaments: SlicerFilament[], spools: Spool[]): (MatchCandidate | null)[] {
  const used = new Set<string>();
  return filaments.map((f) => {
    const best = rankCandidates(f, spools).find((c) => !used.has(c.spool.id) && c.score >= 55) ?? null;
    if (best) used.add(best.spool.id);
    return best;
  });
}
