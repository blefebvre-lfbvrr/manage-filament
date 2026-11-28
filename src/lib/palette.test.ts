import { searchPalette } from './palette';

const items = [
  { id: 'p1', group: 'Pages', label: 'Inventaire' },
  { id: 'p2', group: 'Pages', label: 'Impressions' },
  { id: 's1', group: 'Bobines', label: 'PLA-001', hint: 'PLA Basic Noir', keywords: 'ams slot 1' },
  { id: 's2', group: 'Bobines', label: 'PETG-001', hint: 'PETG HF Noir' },
  { id: 'a1', group: 'Actions', label: 'Nouvelle bobine' },
];

describe('palette de commandes', () => {
  it('sans saisie : tout, dans l’ordre', () => {
    expect(searchPalette('', items).map((i) => i.id)).toEqual(['p1', 'p2', 's1', 's2', 'a1']);
    expect(searchPalette('  ', items, 2)).toHaveLength(2);
  });
  it('tous les mots, sans accents, classement', () => {
    expect(searchPalette('noir', items).map((i) => i.id)).toEqual(['s1', 's2']);
    expect(searchPalette('petg noir', items).map((i) => i.id)).toEqual(['s2']);
    expect(searchPalette('pla-001', items)[0]!.id).toBe('s1');
    expect(searchPalette('IMPRESSION', items).map((i) => i.id)).toEqual(['p2']);
    expect(searchPalette('bobine', items).map((i) => i.id)).toEqual(['a1']);
    expect(searchPalette('slot 1', items).map((i) => i.id)).toEqual(['s1']);
    expect(searchPalette('zzz', items)).toEqual([]);
  });
});
