/** Logique des impressions : déductions, prorata d'échec, vérification du stock. Fonctions pures. */
import { makeMovement, roundG } from './movements';
import type { FilamentUsage, PrintJob, Spool, StockMovement } from './schemas';

/** Statuts qui consomment du filament. */
export function consumesStock(status: PrintJob['status']): boolean {
  return status !== 'planned';
}

export function totalGrams(usages: Pick<FilamentUsage, 'grams'>[]): number {
  return roundG(usages.reduce((a, u) => a + (u.grams || 0), 0));
}

export function plannedGrams(usages: Pick<FilamentUsage, 'grams' | 'plannedG'>[]): number {
  return roundG(usages.reduce((a, u) => a + (u.plannedG ?? u.grams ?? 0), 0));
}

/**
 * Impression ratée à X % : seule la part réellement déposée est déduite.
 * Les grammes prévus sont conservés dans `plannedG`.
 */
export function scaleForFailure(usages: FilamentUsage[], percent: number): FilamentUsage[] {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  return usages.map((u) => {
    const planned = u.plannedG ?? u.grams;
    return {
      ...u,
      plannedG: planned,
      grams: roundG(planned * p),
      lengthM: u.lengthM == null ? u.lengthM : Math.round(u.lengthM * p * 100) / 100,
    };
  });
}

/** Mouvements de stock à créer pour une impression (un par bobine utilisée). */
export function printMovements(
  print: Pick<PrintJob, 'id' | 'name' | 'status' | 'usages' | 'date'>,
  at?: string,
): StockMovement[] {
  if (!consumesStock(print.status)) return [];
  const when = at ?? (print.date ? `${print.date}T12:00:00.000Z` : undefined);
  const bySpool = new Map<string, number>();
  for (const u of print.usages) {
    if (!u.spoolId || !(u.grams > 0)) continue;
    bySpool.set(u.spoolId, roundG((bySpool.get(u.spoolId) ?? 0) + u.grams));
  }
  return [...bySpool].map(([spoolId, grams]) =>
    makeMovement({
      spoolId,
      type: 'print',
      deltaG: -grams,
      at: when,
      refKind: 'print',
      refId: print.id,
      note: print.name,
    }),
  );
}

/** Mouvements d'impression encore actifs (ni annulés, ni supprimés). */
export function activePrintMovements(movements: StockMovement[], printId: string): StockMovement[] {
  return movements.filter(
    (m) => m.refId === printId && m.type === 'print' && !m.reversedById && !m.deletedAt,
  );
}

export interface StockCheck {
  spoolId: string;
  code: string;
  neededG: number;
  availableG: number;
  /** Manque (g), 0 si suffisant. */
  shortG: number;
}

/** Vérifie que chaque bobine a assez de filament pour l'impression. */
export function checkStock(
  usages: Pick<FilamentUsage, 'spoolId' | 'grams'>[],
  spools: Pick<Spool, 'id' | 'code' | 'remainingG'>[],
): StockCheck[] {
  const need = new Map<string, number>();
  for (const u of usages)
    if (u.spoolId && u.grams > 0) need.set(u.spoolId, roundG((need.get(u.spoolId) ?? 0) + u.grams));
  const out: StockCheck[] = [];
  for (const [spoolId, neededG] of need) {
    const s = spools.find((x) => x.id === spoolId);
    if (!s) continue;
    const availableG = Math.max(0, s.remainingG);
    out.push({
      spoolId,
      code: s.code,
      neededG,
      availableG,
      shortG: roundG(Math.max(0, neededG - availableG)),
    });
  }
  return out;
}

/** Durée lisible : 125 → « 2 h 05 ». */
export function formatDuration(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Erreurs bloquantes d'une impression avant enregistrement. */
export function validatePrint(p: Pick<PrintJob, 'name' | 'status' | 'usages' | 'failedAtPercent'>): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('Donne un nom à l’impression.');
  if (p.failedAtPercent != null && (p.failedAtPercent < 0 || p.failedAtPercent > 100))
    errors.push('Le pourcentage doit être entre 0 et 100.');
  if (p.usages.some((u) => !(u.grams >= 0))) errors.push('Grammes invalides.');
  if (consumesStock(p.status) && p.usages.some((u) => u.grams > 0 && !u.spoolId))
    errors.push('Choisis une bobine pour chaque filament (ou mets 0 g).');
  return errors;
}
