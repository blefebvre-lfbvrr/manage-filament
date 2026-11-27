import {
  costPerGram,
  effectiveThresholds,
  isHygroscopic,
  materialFromProductLine,
  netFromGross,
  percentRemaining,
  remainingValue,
  statusAfterRemainingChange,
  stockLevel,
} from './spool';

const t = { lowG: 150, criticalG: 50 };

describe('stockLevel (mêmes règles que l’Excel)', () => {
  it.each([
    [500, 'ok'],
    [150.1, 'ok'],
    [150, 'low'],
    [51, 'low'],
    [50, 'critical'],
    [1, 'critical'],
    [0, 'empty'],
    [-11.3, 'empty'],
  ])('%s g → %s', (g, level) => expect(stockLevel(g, t)).toBe(level));
});

describe('calculs bobine', () => {
  it('seuils propres à la bobine prioritaires', () => {
    expect(
      effectiveThresholds(
        { lowThresholdG: 300, criticalThresholdG: null },
        { lowThresholdG: 150, criticalThresholdG: 50 },
      ),
    ).toEqual({ lowG: 300, criticalG: 50 });
  });
  it('pourcentage restant', () => {
    expect(percentRemaining(250, 1000)).toBe(0.25);
    expect(percentRemaining(250, 0)).toBeNull();
  });
  it('coût au gramme avec frais de port', () => {
    expect(costPerGram({ price: 25.99, shippingShare: 1, initialNetG: 1000 })).toBeCloseTo(0.02699);
    expect(costPerGram({ price: null, shippingShare: 1, initialNetG: 1000 })).toBeNull();
    expect(costPerGram({ price: 20, shippingShare: null, initialNetG: 0 })).toBeNull();
  });
  it('valeur restante jamais négative', () => {
    expect(remainingValue({ price: 20, shippingShare: 0, initialNetG: 1000, remainingG: 500 })).toBe(10);
    expect(remainingValue({ price: 20, shippingShare: 0, initialNetG: 1000, remainingG: -10 })).toBe(0);
    expect(remainingValue({ price: null, shippingShare: 0, initialNetG: 1000, remainingG: 10 })).toBe(0);
  });
  it('poids net depuis une pesée brute', () => {
    expect(netFromGross(1032.44, 250)).toBe(782.4);
    expect(netFromGross(500, null)).toBe(500);
  });
  it('statut après changement du restant', () => {
    expect(statusAfterRemainingChange('ams', 0)).toBe('empty');
    expect(statusAfterRemainingChange('empty', 20)).toBe('opened');
    expect(statusAfterRemainingChange('archived', 0)).toBe('archived');
    expect(statusAfterRemainingChange('sealed', 100)).toBe('sealed');
  });
});

describe('materialFromProductLine', () => {
  it.each([
    ['PLA Basic', 'PLA'],
    ['PLA Matte', 'PLA'],
    ['PETG Translucent', 'PETG'],
    ['PETG HF', 'PETG'],
    ['TPU 95A HF', 'TPU'],
    ['ABS / ASA', 'ABS/ASA'],
    ['ASA', 'ASA'],
    ['Support for PLA', 'Support'],
    ['PA6-CF', 'PA'],
    ['Résine X', 'RÉSINE'],
    ['', ''],
  ])('%s → %s', (line, mat) => expect(materialFromProductLine(line)).toBe(mat));
  it('matériaux hygroscopiques', () => {
    expect(isHygroscopic('PETG')).toBe(true);
    expect(isHygroscopic('PLA')).toBe(false);
  });
});
