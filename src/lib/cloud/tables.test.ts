import { mergeTable, parseTable, serializeTable, stamp } from './tables';

const r = (id: string, updatedAt: string, extra: object = {}) => ({ id, updatedAt, ...extra });

describe('synchronisation par table', () => {
  it('premier envoi : tout est poussé', () => {
    expect(mergeTable([r('a', '1')], null)).toMatchObject({ pushNeeded: true, toLocal: [] });
  });
  it('fusion : le plus récent gagne de chaque côté', () => {
    const m = mergeTable(
      [r('a', '2026-01-02', { v: 'local' }), r('b', '2026-01-01', { v: 'local' }), r('c', '2026-01-01')],
      [r('a', '2026-01-01', { v: 'distant' }), r('b', '2026-01-03', { v: 'distant' }), r('d', '2026-01-01')],
    );
    expect(m.merged.map((x) => [x.id, (x as { v?: string }).v])).toEqual([
      ['a', 'local'],
      ['b', 'distant'],
      ['c', undefined],
      ['d', undefined],
    ]);
    expect(m.toLocal.map((x) => x.id)).toEqual(['b', 'd']);
    expect(m.pushNeeded).toBe(true);
  });
  it('identique : rien à faire', () => {
    const same = [r('a', '1'), r('b', '2')];
    expect(mergeTable(same, [...same].reverse())).toMatchObject({ pushNeeded: false, toLocal: [] });
  });
  it('tâche Bambu validée prioritaire sur « en attente »', () => {
    const pending = { id: 't', state: 'pending', receivedAt: '2026-02-01' };
    const validated = { id: 't', state: 'validated', decidedAt: '2026-01-31', receivedAt: '2026-01-30' };
    expect(stamp(validated) > stamp(pending)).toBe(true);
    expect(mergeTable([pending], [validated]).toLocal).toEqual([validated]);
  });
  it('aller-retour du fichier', () => {
    const text = serializeTable('spools', [r('a', '1'), r('b', '2')], 'now');
    expect(parseTable(text)).toEqual([r('a', '1'), r('b', '2')]);
    expect(() => parseTable('{"records":[]}')).toThrow();
  });
});
