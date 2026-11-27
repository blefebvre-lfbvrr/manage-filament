import {
  adjustmentTo,
  initialMovements,
  MovementError,
  reverseMovement,
  roundG,
  sumMovements,
  withRunningBalance,
} from './movements';

describe('journal des mouvements', () => {
  it('stock initial + consommation antérieure', () => {
    const ms = initialMovements('s1', 1000, 700);
    expect(ms.map((m) => [m.type, m.deltaG])).toEqual([
      ['initial', 1000],
      ['prior_consumption', -700],
    ]);
    expect(sumMovements(ms)).toBe(300);
  });
  it('date par défaut renseignée', () => {
    const [m] = initialMovements('s1', 1000);
    expect(m!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('pas de mouvement de consommation antérieure à 0', () => {
    expect(initialMovements('s1', 1000)).toHaveLength(1);
  });
  it('arrondi au dixième, sans erreurs de flottants', () => {
    expect(roundG(0.1 + 0.2)).toBe(0.3);
    expect(
      sumMovements([
        { deltaG: 1000 },
        { deltaG: -146.6 },
        { deltaG: -142.8 },
        { deltaG: -0.1, deletedAt: 'x' },
      ]),
    ).toBe(710.6);
  });
  it('ajustement vers une valeur cible', () => {
    expect(adjustmentTo('s1', 300, 250, 'weighing')?.deltaG).toBe(-50);
    expect(adjustmentTo('s1', 300, 300, 'correction')).toBeNull();
  });
  it('annulation = mouvement inverse', () => {
    const [m] = initialMovements('s1', 1000);
    const rev = reverseMovement(m!);
    expect(rev.deltaG).toBe(-1000);
    expect(rev.reversesId).toBe(m!.id);
    expect(rev.type).toBe('undo');
    expect(() => reverseMovement({ ...m!, reversedById: rev.id })).toThrow(MovementError);
    expect(() => reverseMovement(rev)).toThrow(MovementError);
  });
  it('solde courant chronologique', () => {
    const a = { deltaG: 1000, at: '2026-01-01', createdAt: '1' };
    const b = { deltaG: -200, at: '2026-02-01', createdAt: '2' };
    const c = { deltaG: -100, at: '2026-01-15', createdAt: '3' };
    expect(withRunningBalance([a, b, c]).map((m) => m.balanceAfterG)).toEqual([1000, 900, 700]);
  });
});
