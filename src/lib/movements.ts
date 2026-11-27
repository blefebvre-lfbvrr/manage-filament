/** Journal des mouvements : le restant d'une bobine est la somme de ses mouvements. */
import type { MovementType, StockMovement } from './schemas';
import { newId, nowIso } from './ids';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial: 'Stock initial',
  prior_consumption: 'Consommé avant suivi',
  print: 'Impression',
  weighing: 'Pesée',
  correction: 'Correction',
  undo: 'Annulation',
};

/** Arrondi au dixième de gramme pour éviter les erreurs de flottants. */
export function roundG(v: number): number {
  return Math.round(v * 10) / 10;
}

export function sumMovements(movements: Pick<StockMovement, 'deltaG' | 'deletedAt'>[]): number {
  return roundG(movements.filter((m) => !m.deletedAt).reduce((acc, m) => acc + m.deltaG, 0));
}

export type MovementDraft = Omit<StockMovement, 'id' | 'createdAt' | 'updatedAt'>;

export function makeMovement(draft: Omit<MovementDraft, 'at'> & { at?: string }): StockMovement {
  const now = nowIso();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...draft,
    at: draft.at ?? now,
    deltaG: roundG(draft.deltaG),
  };
}

/** Mouvements de création d'une bobine : stock initial + consommation antérieure éventuelle. */
export function initialMovements(
  spoolId: string,
  initialNetG: number,
  priorConsumedG = 0,
  opts: { at?: string; refKind?: StockMovement['refKind']; refId?: string | null; note?: string } = {},
): StockMovement[] {
  const list: StockMovement[] = [
    makeMovement({
      spoolId,
      type: 'initial',
      deltaG: initialNetG,
      at: opts.at,
      refKind: opts.refKind,
      refId: opts.refId,
      note: opts.note,
    }),
  ];
  if (priorConsumedG) {
    list.push(
      makeMovement({
        spoolId,
        type: 'prior_consumption',
        deltaG: -priorConsumedG,
        at: opts.at,
        refKind: opts.refKind,
        refId: opts.refId,
        note: 'Déjà consommé avant le suivi',
      }),
    );
  }
  return list;
}

/** Mouvement d'ajustement pour atteindre un restant cible (pesée ou correction manuelle). */
export function adjustmentTo(
  spoolId: string,
  currentG: number,
  targetG: number,
  type: Extract<MovementType, 'weighing' | 'correction'>,
  extra: Partial<MovementDraft> = {},
): StockMovement | null {
  const delta = roundG(targetG - currentG);
  if (delta === 0) return null;
  return makeMovement({ spoolId, type, deltaG: delta, ...extra });
}

export class MovementError extends Error {}

/** Mouvement inverse : on n'efface jamais l'historique, on le compense. */
export function reverseMovement(m: StockMovement, note?: string): StockMovement {
  if (m.reversedById) throw new MovementError('Ce mouvement a déjà été annulé.');
  if (m.type === 'undo')
    throw new MovementError('Une annulation ne peut pas être annulée ; refais l’opération.');
  return makeMovement({
    spoolId: m.spoolId,
    type: 'undo',
    deltaG: -m.deltaG,
    refKind: 'movement',
    refId: m.id,
    reversesId: m.id,
    note: note ?? `Annulation : ${MOVEMENT_LABELS[m.type]}`,
  });
}

/** Ajoute le solde après chaque mouvement (tri chronologique). */
export function withRunningBalance<
  T extends Pick<StockMovement, 'deltaG' | 'at' | 'createdAt' | 'deletedAt'>,
>(movements: T[]): (T & { balanceAfterG: number })[] {
  const sorted = [...movements]
    .filter((m) => !m.deletedAt)
    .sort((a, b) => a.at.localeCompare(b.at) || a.createdAt.localeCompare(b.createdAt));
  let bal = 0;
  return sorted.map((m) => {
    bal = roundG(bal + m.deltaG);
    return { ...m, balanceAfterG: bal };
  });
}
