import { formatCostPerGram, formatDate, formatGrams, formatMoney, formatPercent } from './format';

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatage français', () => {
  it('grammes et kilos', () => {
    expect(nbsp(formatGrams(818.3))).toBe('818,3 g');
    expect(nbsp(formatGrams(12500))).toBe('12,5 kg');
    expect(nbsp(formatGrams(2500, 'kg'))).toBe('2,5 kg');
    expect(formatGrams(null)).toBe('—');
  });
  it('monnaie, pourcentage, dates', () => {
    expect(nbsp(formatMoney(25.99))).toBe('25,99 €');
    expect(nbsp(formatCostPerGram(0.02599))).toBe('25,99 €/kg');
    expect(nbsp(formatPercent(0.3))).toBe('30 %');
    expect(formatDate('2026-03-15')).toBe('15/03/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('pas une date')).toBe('pas une date');
  });
});
