import { buildDemoData } from './demo';
import { makeMovement } from './movements';
import type { PrintJob, Spool } from './schemas';
import {
  activeConsumption,
  applyFilters,
  averageCostPerGram,
  bucketKey,
  bucketKeys,
  bucketLabel,
  consumptionSeries,
  costByProject,
  defaultBucket,
  forecastDepletion,
  forecasts,
  inRange,
  periodRange,
  printCosts,
  spendingSeries,
  stockByColor,
  stockByMaterial,
  successRate,
  topFilaments,
} from './stats';

const now = new Date('2026-11-27T12:00:00Z');
const demo = buildDemoData(now);
const byId = new Map(demo.spools.map((s) => [s.id, s]));
const elec = { electricity: { enabled: true, avgPowerW: 100, pricePerKwh: 0.25 } };
const noElec = { electricity: { enabled: false, avgPowerW: 100, pricePerKwh: 0.25 } };

describe('périodes et regroupements', () => {
  it('plages', () => {
    expect(periodRange('30d', now).from!.toISOString().slice(0, 10)).toBe('2026-10-29');
    expect(periodRange('12m', now).from!.getMonth()).toBe(11); // décembre 2025
    expect(periodRange('ytd', now).from!.getFullYear()).toBe(2026);
    expect(periodRange('all', now).from).toBeNull();
    expect(defaultBucket('30d')).toBe('day');
    expect(defaultBucket('90d')).toBe('week');
    expect(defaultBucket('all')).toBe('month');
    expect(inRange(null, { from: null, to: now })).toBe(true);
    expect(inRange(null, { from: now, to: now })).toBe(false);
  });
  it('clés et libellés', () => {
    const d = new Date(2026, 10, 27);
    expect(bucketKey(d, 'day')).toBe('2026-11-27');
    expect(bucketKey(d, 'week')).toBe('2026-11-23');
    expect(bucketKey(d, 'month')).toBe('2026-11');
    expect(bucketLabel('2026-11', 'month')).toBe('nov. 26');
    expect(bucketLabel('2026-11-23', 'week')).toBe('sem. 23 nov.');
    expect(bucketKeys(new Date(2026, 0, 15), new Date(2026, 3, 1), 'month')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });
});

describe('séries', () => {
  it('consommation : somme des impressions non annulées, coût associé', () => {
    const r = periodRange('all', now);
    const series = consumptionSeries(demo.movements, byId, r, 'month');
    const total = series.reduce((a, p) => a + p.value, 0);
    const expected = activeConsumption(demo.movements).reduce((a, m) => a - m.deltaG, 0);
    expect(total).toBeCloseTo(expected, 0);
    expect(series.every((p) => p.extra >= 0)).toBe(true);
    // Un mouvement annulé ne compte pas.
    const m = makeMovement({
      spoolId: 'demo-spool-1',
      type: 'print',
      deltaG: -500,
      at: now.toISOString(),
      reversedById: 'x',
    });
    expect(
      consumptionSeries([...demo.movements, m], byId, r, 'month').reduce((a, p) => a + p.value, 0),
    ).toBeCloseTo(total, 0);
    // Périodes vides incluses.
    expect(consumptionSeries([], byId, periodRange('30d', now), 'day')).toHaveLength(30);
  });

  it('dépenses par mois', () => {
    const s = spendingSeries(demo.spools, periodRange('all', now));
    const total = s.reduce((a, p) => a + p.value, 0);
    const expected = demo.spools.reduce((a, x) => a + (x.price ?? 0) + (x.shippingShare ?? 0), 0);
    expect(total).toBeCloseTo(expected, 2);
    expect(s.reduce((a, p) => a + p.extra, 0)).toBe(demo.spools.length);
  });

  it('stock par matériau et par couleur', () => {
    const mat = stockByMaterial(demo.spools);
    expect(mat[0]!.key).toBe('PLA');
    expect(mat.find((x) => x.key === 'PLA')!.count).toBe(9); // la bobine vide est exclue
    const col = stockByColor(demo.spools, 3);
    expect(col).toHaveLength(4);
    expect(col[3]!.label).toMatch(/^Autres/);
    expect(col[0]!.hex).toMatch(/^#/);
  });

  it('top des filaments', () => {
    const top = topFilaments(demo.movements, byId, periodRange('all', now), 3);
    expect(top).toHaveLength(3);
    expect(top[0]!.grams).toBeGreaterThanOrEqual(top[1]!.grams);
  });
});

describe('coûts', () => {
  const spool = demo.spools[0]!;
  const print: PrintJob = {
    ...demo.prints[0]!,
    usages: [{ spoolId: spool.id, grams: 100, role: 'main' }],
    durationMin: 120,
    energyKwh: null,
    status: 'success',
  };
  it('matière + électricité', () => {
    const cpg = (spool.price! + (spool.shippingShare ?? 0)) / 1000;
    expect(printCosts(print, byId, noElec)).toEqual({
      material: Math.round(cpg * 100 * 100) / 100,
      energyKwh: 0,
      energy: 0,
      total: Math.round(cpg * 100 * 100) / 100,
    });
    const c = printCosts(print, byId, elec);
    expect(c.energyKwh).toBe(0.2);
    expect(c.energy).toBe(0.05);
    expect(printCosts({ ...print, energyKwh: 1 }, byId, elec).energy).toBe(0.25);
    expect(printCosts({ ...print, status: 'planned' }, byId, elec).energy).toBe(0);
  });
  it('coût par projet, avec file d’attente et « Sans projet »', () => {
    const extra: PrintJob = { ...print, id: 'x', projectId: null };
    const res = costByProject([...demo.prints, extra], demo.projects, byId, noElec, periodRange('all', now));
    const none = res.find((r) => r.id === '__none__')!;
    expect(none.name).toBe('Sans projet');
    expect(none.prints).toBe(1);
    const first = res.find((r) => r.id === 'demo-project-1')!;
    expect(first.budget).toBe(60);
    expect(first.plannedG).toBe(360);
    expect(res.reduce((a, r) => a + r.prints, 0)).toBe(
      demo.prints.filter((p) => p.status !== 'planned').length + 1,
    );
  });
  it('taux de réussite et coût moyen', () => {
    const r = successRate(demo.prints, periodRange('all', now));
    expect(r.success + r.failed + r.cancelled).toBe(demo.prints.filter((p) => p.status !== 'planned').length);
    expect(r.rate).toBeGreaterThan(0.5);
    expect(successRate([], periodRange('all', now)).rate).toBeNull();
    expect(averageCostPerGram(demo.spools)).toBeGreaterThan(0.02);
    expect(averageCostPerGram([])).toBeNull();
  });
});

describe('prévision de rupture', () => {
  const s: Pick<Spool, 'id' | 'remainingG'> = { id: 'a', remainingG: 300 };
  const mv = (daysAgo: number, g: number) =>
    makeMovement({
      spoolId: 'a',
      type: 'print',
      deltaG: -g,
      at: new Date(now.getTime() - daysAgo * 86400_000).toISOString(),
    });
  it('moyenne sur la fenêtre, date estimée', () => {
    const f = forecastDepletion(s, [mv(59, 50), mv(30, 100), mv(5, 150)], now)!;
    expect(f.avgPerDayG).toBe(5);
    expect(f.daysLeft).toBe(60);
    expect(f.date.toISOString().slice(0, 10)).toBe('2027-01-26');
  });
  it('fenêtre réduite pour une bobine récente (au moins 7 jours)', () => {
    expect(forecastDepletion(s, [mv(2, 70)], now)!.avgPerDayG).toBe(10);
  });
  it('rien sans consommation récente ou si la bobine est vide', () => {
    expect(forecastDepletion(s, [mv(120, 50)], now)).toBeNull();
    expect(forecastDepletion({ id: 'a', remainingG: 0 }, [mv(1, 5)], now)).toBeNull();
    expect(forecastDepletion(s, [], now)).toBeNull();
  });
  it('liste triée par urgence', () => {
    const list = forecasts(demo.spools, demo.movements, now);
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.daysLeft).toBeGreaterThanOrEqual(list[i - 1]!.daysLeft);
  });
});

describe('filtres globaux', () => {
  it('matériau et projet', () => {
    const d = { spools: demo.spools, movements: demo.movements, prints: demo.prints };
    const petg = applyFilters(d, { material: 'PETG', projectId: '' });
    expect(petg.spools.every((s) => s.material === 'PETG')).toBe(true);
    expect(petg.movements.every((m) => petg.spools.some((s) => s.id === m.spoolId))).toBe(true);
    const proj = applyFilters(d, { material: '', projectId: 'demo-project-2' });
    expect(proj.prints.every((p) => p.projectId === 'demo-project-2')).toBe(true);
    expect(activeConsumption(proj.movements).every((m) => proj.prints.some((p) => p.id === m.refId))).toBe(
      true,
    );
    expect(applyFilters(d, { material: '', projectId: '' })).toEqual(d);
  });
});
