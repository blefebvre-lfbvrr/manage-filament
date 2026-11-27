import { codePrefix, nextCode, nextCodes } from './codes';

describe('codes courts', () => {
  it('préfixe par matériau', () => {
    expect(codePrefix('PLA')).toBe('PLA');
    expect(codePrefix('PETG')).toBe('PETG');
    expect(codePrefix('ABS/ASA')).toBe('ABSA');
    expect(codePrefix('')).toBe('FIL');
  });
  it('prochain code libre', () => {
    expect(nextCode('PLA', [])).toBe('PLA-001');
    expect(nextCode('PLA', ['PLA-001', 'PLA-042', 'PETG-100', 'B04'])).toBe('PLA-043');
  });
  it('plusieurs codes à la suite', () => {
    expect(nextCodes('PLA', ['PLA-001'], 3)).toEqual(['PLA-002', 'PLA-003', 'PLA-004']);
  });
});
