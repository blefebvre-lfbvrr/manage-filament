import { colorDistance, contrastRatio, normalizeHex, readableTextColor } from './color';

describe('couleurs', () => {
  it('normalise les codes hex', () => {
    expect(normalizeHex('#fff')).toBe('#FFFFFF');
    expect(normalizeHex('000000FF')).toBe('#000000');
    expect(normalizeHex('3f8e43')).toBe('#3F8E43');
    expect(normalizeHex('rouge')).toBeNull();
    expect(normalizeHex(12)).toBeNull();
  });
  it('contraste WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(readableTextColor('#000000')).toBe('#FFFFFF');
    expect(readableTextColor('#FFFFFF')).toBe('#000000');
    expect(readableTextColor('#FF9016')).toBe('#000000');
    expect(readableTextColor(null)).toBe('#000000');
  });
  it('distance entre couleurs', () => {
    expect(colorDistance('#000000', '#000000')).toBe(0);
    expect(colorDistance('#000000', '#010101')).toBeLessThan(colorDistance('#000000', '#FFFFFF'));
    expect(colorDistance('x', '#000000')).toBe(Infinity);
  });
});
