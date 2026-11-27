import { looseKey, matchesQuery, normalizeText } from './text';

describe('texte', () => {
  it('normalise accents et casse', () => {
    expect(normalizeText('  Déjà  Consommé ')).toBe('deja consomme');
    expect(normalizeText(null)).toBe('');
    expect(looseKey('Restant (g)')).toBe('restant g');
    expect(looseKey('Seuil « bientôt vide » (g)')).toBe('seuil bientot vide g');
  });
  it('recherche plein texte multi-mots', () => {
    expect(matchesQuery('PLA Basic Vert gui AMS 4', 'vert pla')).toBe(true);
    expect(matchesQuery('PLA Basic Vert gui', 'petg')).toBe(false);
    expect(matchesQuery('quoi que ce soit', '')).toBe(true);
  });
});
