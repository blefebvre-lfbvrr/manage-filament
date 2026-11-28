/** Boîte de réception : proposition de rattachement d'une tâche Bambu aux bobines. Fonctions pures. */
import { colorDistance } from '../color';
import type { FilamentUsage, Spool } from '../schemas';
import { rankCandidates } from '../slicer/match';
import type { BambuTask } from './tasks';

export interface UsageProposal {
  filamentIndex: number;
  spoolId: string | null;
  grams: number;
  reason: string;
  /** Correspondance sûre (slot AMS + même matériau + couleur identique, ou couleur identique unique). */
  certain: boolean;
}

const SAME = 40;

export function proposeUsages(task: Pick<BambuTask, 'filaments'>, spools: Spool[]): UsageProposal[] {
  const used = new Set<string>();
  return task.filaments.map((f, i) => {
    // 1. La bobine actuellement dans le slot AMS indiqué.
    if (f.slot !== null && f.slot <= 3) {
      const inSlot = spools.find((s) => !s.deletedAt && s.status === 'ams' && s.amsSlot === f.slot! + 1);
      const typeOk =
        inSlot &&
        (!f.type ||
          inSlot.material.toUpperCase() === f.type.toUpperCase().replace(/-.*$/, '') ||
          inSlot.material.toUpperCase().startsWith(f.type.toUpperCase().slice(0, 3)));
      if (inSlot && typeOk && !used.has(inSlot.id)) {
        used.add(inSlot.id);
        const colorOk = !f.color || !inSlot.colorHex || colorDistance(f.color, inSlot.colorHex) <= SAME;
        return {
          filamentIndex: i,
          spoolId: inSlot.id,
          grams: f.grams,
          reason: `slot AMS ${f.slot + 1}${colorOk ? '' : ' (couleur différente !)'}`,
          certain: colorOk,
        };
      }
    }
    // 2. Type + couleur hex la plus proche.
    const ranked = rankCandidates(
      { id: (f.slot ?? 0) + 1, type: f.type, color: f.color, usedG: f.grams, usedM: null },
      spools,
    ).filter((c) => !used.has(c.spool.id) && c.score > 0);
    const best = ranked[0];
    if (best) {
      used.add(best.spool.id);
      const sameColor = Boolean(
        f.color && best.spool.colorHex && colorDistance(f.color, best.spool.colorHex) <= SAME,
      );
      const unique = ranked.filter((c) => c.reasons.includes('même couleur')).length === 1;
      return {
        filamentIndex: i,
        spoolId: best.spool.id,
        grams: f.grams,
        reason: best.reasons.join(', '),
        certain: sameColor && unique,
      };
    }
    return {
      filamentIndex: i,
      spoolId: null,
      grams: f.grams,
      reason: 'aucune bobine correspondante',
      certain: false,
    };
  });
}

/** Toutes les correspondances sont sûres et l'impression est terminée avec succès : validation automatique possible. */
export function canAutoValidate(
  task: Pick<BambuTask, 'status' | 'filaments'>,
  proposals: UsageProposal[],
): boolean {
  return task.status === 'success' && proposals.length > 0 && proposals.every((p) => p.certain && p.spoolId);
}

export function toUsages(
  task: Pick<BambuTask, 'filaments'>,
  proposals: UsageProposal[],
  percent: number | null = null,
): FilamentUsage[] {
  const k = percent == null ? 1 : Math.max(0, Math.min(100, percent)) / 100;
  return proposals.map((p) => {
    const f = task.filaments[p.filamentIndex]!;
    return {
      spoolId: p.spoolId,
      grams: Math.round(p.grams * k * 10) / 10,
      plannedG: percent == null ? null : p.grams,
      role: 'main' as const,
      amsSlot: f.slot !== null && f.slot <= 3 ? ((f.slot + 1) as 1 | 2 | 3 | 4) : null,
      slicerType: f.type || null,
      slicerColor: f.color,
    };
  });
}
