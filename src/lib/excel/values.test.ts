import { excelSerialToDate, parseBool, parseDate, parseNumber, parseString } from './values';

describe('valeurs de cellules', () => {
  it('nombres au format français', () => {
    expect(parseNumber('25,99 €')).toEqual({ ok: true, value: 25.99 });
    expect(parseNumber('1 000 g')).toEqual({ ok: true, value: 1000 });
    expect(parseNumber(12)).toEqual({ ok: true, value: 12 });
    expect(parseNumber('')).toEqual({ ok: true, value: null });
    expect(parseNumber('abc').ok).toBe(false);
    expect(parseNumber(true).ok).toBe(false);
  });
  it('dates', () => {
    expect(parseDate('15/03/2026')).toEqual({ ok: true, value: '2026-03-15' });
    expect(parseDate('2026-03-15T10:00')).toEqual({ ok: true, value: '2026-03-15' });
    expect(parseDate(46096)).toEqual({ ok: true, value: '2026-03-15' });
    expect(parseDate(new Date(Date.UTC(2026, 2, 15)))).toEqual({ ok: true, value: '2026-03-15' });
    expect(parseDate('31/02/2026').ok).toBe(false);
    expect(parseDate('demain').ok).toBe(false);
    expect(parseDate(null)).toEqual({ ok: true, value: null });
    expect(excelSerialToDate(46096).getDate()).toBe(15);
  });
  it('booléens et textes', () => {
    expect(parseBool('Oui')).toEqual({ ok: true, value: true });
    expect(parseBool('non')).toEqual({ ok: true, value: false });
    expect(parseBool(0)).toEqual({ ok: true, value: false });
    expect(parseBool('peut-être').ok).toBe(false);
    expect(parseString('  x ')).toBe('x');
    expect(parseString('')).toBeNull();
  });
});
