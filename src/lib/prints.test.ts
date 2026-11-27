import {
  activePrintMovements,
  checkStock,
  consumesStock,
  formatDuration,
  plannedGrams,
  printMovements,
  scaleForFailure,
  totalGrams,
  validatePrint,
} from './prints';
import type { FilamentUsage } from './schemas';

const u = (spoolId: string | null, grams: number, extra: Partial<FilamentUsage> = {}): FilamentUsage => ({
  spoolId,
  grams,
  role: 'main',
  ...extra,
});

describe('impressions', () => {
  it('statuts consommateurs', () => {
    expect(consumesStock('planned')).toBe(false);
    expect(consumesStock('failed')).toBe(true);
  });

  it('ratée à X % : prorata conservant le prévu', () => {
    const scaled = scaleForFailure([u('a', 100, { lengthM: 33 }), u('b', 50.5)], 40);
    expect(scaled.map((x) => [x.plannedG, x.grams, x.lengthM])).toEqual([
      [100, 40, 13.2],
      [50.5, 20.2, undefined],
    ]);
    // Réappliquer un autre pourcentage repart du prévu.
    expect(scaleForFailure(scaled, 50)[0]!.grams).toBe(50);
    expect(scaleForFailure(scaled, 150)[0]!.grams).toBe(100);
    expect(totalGrams(scaled)).toBe(60.2);
    expect(plannedGrams(scaled)).toBe(150.5);
  });

  it('mouvements : un par bobine, rien pour une impression planifiée', () => {
    const p = {
      id: 'p1',
      name: 'Boîte',
      status: 'success' as const,
      date: '2026-11-20',
      usages: [u('a', 30), u('a', 12.3), u('b', 0), u(null, 5)],
    };
    const ms = printMovements(p);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      spoolId: 'a',
      deltaG: -42.3,
      type: 'print',
      refId: 'p1',
      at: '2026-11-20T12:00:00.000Z',
    });
    expect(printMovements({ ...p, status: 'planned' })).toEqual([]);
    expect(activePrintMovements([...ms, { ...ms[0]!, id: 'x', reversedById: 'y' }], 'p1')).toHaveLength(1);
  });

  it('vérification du stock avant impression', () => {
    const res = checkStock(
      [u('a', 180), u('b', 20), u('a', 20)],
      [
        { id: 'a', code: 'PETG-001', remainingG: 120 },
        { id: 'b', code: 'PLA-001', remainingG: 500 },
      ],
    );
    expect(res).toEqual([
      { spoolId: 'a', code: 'PETG-001', neededG: 200, availableG: 120, shortG: 80 },
      { spoolId: 'b', code: 'PLA-001', neededG: 20, availableG: 500, shortG: 0 },
    ]);
  });

  it('validation et durée', () => {
    expect(validatePrint({ name: ' ', status: 'success', usages: [], failedAtPercent: null })).toContain(
      'Donne un nom à l’impression.',
    );
    expect(
      validatePrint({ name: 'x', status: 'success', usages: [u(null, 10)], failedAtPercent: 120 }),
    ).toHaveLength(2);
    expect(
      validatePrint({ name: 'x', status: 'planned', usages: [u(null, 10)], failedAtPercent: null }),
    ).toEqual([]);
    expect(formatDuration(125)).toBe('2 h 05');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(null)).toBe('—');
  });
});
