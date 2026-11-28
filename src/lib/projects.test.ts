import { buildCatalogSeed } from './catalog-seed';
import { buildDemoData } from './demo';
import { analyzeFeasibility, spoolOptions, summarize, timeEstimate, withMargins } from './feasibility';
import { makeProject } from './project-factory';
import {
  actualConsumption,
  estimatedCost,
  filterProjects,
  EMPTY_PROJECT_FILTERS,
  matchProject,
  platesFromSliced,
  projectCost,
  projectPlan,
  projectProgress,
  realMargin,
  reservedBySpool,
  reservesStock,
  revenueByMonth,
  sortProjects,
  statusDef,
  suggestedPrice,
  withAvailable,
} from './projects';
import { DEFAULT_SETTINGS, type PrintJob, type ProjectPart } from './schemas';

const now = new Date('2026-11-27T12:00:00Z');
const demo = buildDemoData(now);
const catalog = buildCatalogSeed();
const byId = new Map(demo.spools.map((s) => [s.id, s]));
const settings = { ...DEFAULT_SETTINGS };

const part = (o: Partial<ProjectPart> = {}): ProjectPart => ({
  id: 'part1',
  name: 'Support',
  source: '3mf',
  fileName: 'support.gcode.3mf',
  quantity: 2,
  plates: [
    {
      index: 1,
      name: 'P1',
      predictionS: 3600,
      filaments: [
        { id: 1, type: 'PLA', color: '#000000', productHint: 'PLA Basic', grams: 100, lengthM: 33 },
      ],
    },
    {
      index: 2,
      name: 'P2',
      predictionS: 1800,
      filaments: [
        { id: 1, type: 'PLA', color: '#000000', productHint: 'PLA Basic', grams: 50, lengthM: 16 },
        { id: 2, type: 'PETG', color: '#FFFFFF', productHint: 'PETG HF', grams: 20, lengthM: 7 },
      ],
    },
  ],
  ...o,
});

const print = (o: Partial<PrintJob>): PrintJob => ({
  id: Math.random().toString(36),
  createdAt: '2026-11-01',
  updatedAt: '2026-11-01',
  deletedAt: null,
  name: 'x',
  status: 'success',
  usages: [],
  photoIds: [],
  custom: {},
  ...o,
});

describe('plan et avancement', () => {
  it('consommation prévue × quantités, plateaux et durée', () => {
    const plan = projectPlan([part()]);
    expect(plan.totalPlates).toBe(4);
    expect(plan.totalTimeS).toBe(10800);
    expect(plan.filaments.map((f) => [f.productHint, f.grams])).toEqual([
      ['PLA Basic', 300],
      ['PETG HF', 40],
    ]);
    expect(plan.totalG).toBe(340);
    expect(projectPlan([part({ plates: [], quantity: 3 })]).totalPlates).toBe(3);
  });

  it('conversion depuis un fichier découpé', () => {
    const plates = platesFromSliced([
      {
        index: 1,
        name: null,
        predictionS: 60,
        filaments: [{ id: 1, type: 'PLA', color: '#000000', productHint: 'PLA Basic', usedG: 12, usedM: 4 }],
      },
    ]);
    expect(plates[0]!.filaments[0]).toEqual({
      id: 1,
      type: 'PLA',
      color: '#000000',
      productHint: 'PLA Basic',
      grams: 12,
      lengthM: 4,
    });
  });

  it('avancement par pièce, ratées à part', () => {
    const project = makeProject('P', { id: 'p', parts: [part()] });
    const prints = [
      print({ projectId: 'p', projectPartId: 'part1' }),
      print({ projectId: 'p', projectPartId: 'part1' }),
      print({ projectId: 'p' }),
      print({ projectId: 'p', status: 'failed' }),
      print({ projectId: 'p', status: 'planned' }),
      print({ projectId: 'other' }),
    ];
    const pr = projectProgress(project, prints);
    expect(pr).toMatchObject({ printedPlates: 3, totalPlates: 4, ratio: 0.75 });
    expect(pr.failed).toHaveLength(1);
    expect(pr.planned).toHaveLength(1);
    expect(projectProgress(makeProject('Q', { id: 'q' }), [print({ projectId: 'q' })]).ratio).toBe(1);
  });
});

describe('coûts et prix', () => {
  const spool = demo.spools[0]!;
  const cpg = (spool.price! + (spool.shippingShare ?? 0)) / 1000;
  const prints = [
    print({
      projectId: 'p',
      usages: [{ spoolId: spool.id, grams: 100, role: 'main' }],
      durationMin: 120,
      stockApplied: true,
    }),
    print({
      projectId: 'p',
      status: 'failed',
      usages: [{ spoolId: spool.id, grams: 20, role: 'main' }],
      durationMin: 30,
      stockApplied: true,
    }),
  ];
  const s = {
    ...settings,
    electricity: { enabled: true, avgPowerW: 100, pricePerKwh: 0.2 },
    projects: { ...settings.projects, machineHourlyRate: 0.5, laborHourlyRate: 20 },
  };
  it('matière (y compris ratées), électricité, machine, main-d’œuvre', () => {
    const c = projectCost(
      makeProject('P', { id: 'p', pricing: { paymentStatus: 'unpaid', laborMinutes: 30 } }),
      prints,
      byId,
      s,
    );
    expect(c.material).toBeCloseTo(120 * cpg, 2);
    expect(c.failedMaterial).toBeCloseTo(20 * cpg, 2);
    expect(c.electricity).toBeCloseTo(0.05, 2);
    expect(c.machine).toBe(1.25);
    expect(c.labor).toBe(10);
    expect(c.printHours).toBe(2.5);
    expect(c.total).toBeCloseTo(c.material + c.electricity + c.machine + c.labor, 2);
    expect(actualConsumption('p', prints, byId, s)).toEqual([
      { spoolId: spool.id, grams: 120, failedG: 20, cost: Math.round(120 * cpg * 100) / 100 },
    ]);
  });
  it('estimation d’après le plan, prix suggéré arrondi, marge réelle', () => {
    const est = estimatedCost(projectPlan([part()]), 0.026, makeProject('P'), s);
    expect(est.material).toBeCloseTo(340 * 0.026 * 1.05, 2);
    expect(est.printHours).toBe(3);
    expect(suggestedPrice(10.12, 30, 0.5)).toBe(13.5);
    expect(suggestedPrice(10, 30, 0)).toBe(13);
    expect(suggestedPrice(10, 50, 1)).toBe(15);
    expect(realMargin(20, 12.5)).toEqual({ amount: 7.5, pct: 0.375 });
    expect(realMargin(null, 5)).toBeNull();
  });
  it('chiffre d’affaires par mois des projets pour des tiers', () => {
    const projects = [
      makeProject('A', {
        id: 'p',
        forSelf: false,
        pricing: { paymentStatus: 'paid', finalPrice: 30, paidAt: '2026-11-10' },
      }),
      makeProject('B', {
        forSelf: true,
        pricing: { paymentStatus: 'paid', finalPrice: 99, paidAt: '2026-11-10' },
      }),
      makeProject('C', {
        forSelf: false,
        pricing: { paymentStatus: 'unpaid', finalPrice: 10 },
        deliveredAt: '2026-10-02',
      }),
    ];
    const rev = revenueByMonth(projects, prints, byId, s);
    expect(rev.map((r) => [r.month, r.revenue, r.count])).toEqual([
      ['2026-10', 10, 1],
      ['2026-11', 30, 1],
    ]);
    expect(rev[1]!.margin).toBeCloseTo(30 - rev[1]!.cost, 2);
  });
});

describe('statuts, réservations, rattachement, filtres', () => {
  it('statuts qui réservent le stock', () => {
    expect(statusDef('validated', settings).label).toBe('Validé');
    expect(statusDef('inconnu', settings).label).toBe('inconnu');
    expect(reservesStock(makeProject('x', { status: 'printing' }), settings)).toBe(true);
    expect(reservesStock(makeProject('x', { status: 'done' }), settings)).toBe(false);
    expect(reservesStock(makeProject('x', { status: 'printing', archived: true }), settings)).toBe(false);
  });
  it('réservations diminuées par la consommation du projet', () => {
    const projects = [
      makeProject('A', { id: 'a', status: 'validated', reservations: [{ spoolId: 's1', grams: 200 }] }),
      makeProject('B', { id: 'b', status: 'idea', reservations: [{ spoolId: 's1', grams: 500 }] }),
      makeProject('C', {
        id: 'c',
        status: 'printing',
        reservations: [
          { spoolId: 's1', grams: 100 },
          { spoolId: 's2', grams: 50 },
        ],
      }),
    ];
    const prints = [print({ projectId: 'a', usages: [{ spoolId: 's1', grams: 80, role: 'main' }] })];
    const r = reservedBySpool(projects, prints, settings);
    expect(r.get('s1')).toBe(220);
    expect(r.get('s2')).toBe(50);
    expect(reservedBySpool(projects, prints, settings, 'c').get('s1')).toBe(120);
    expect(
      withAvailable(
        [
          { id: 's1', remainingG: 200 },
          { id: 's3', remainingG: 10 },
        ],
        r,
      ),
    ).toEqual([
      { id: 's1', remainingG: 200, reservedG: 220, availableG: 0 },
      { id: 's3', remainingG: 10, reservedG: 0, availableG: 10 },
    ]);
  });
  it('rattachement automatique par préfixe ou nom de fichier', () => {
    const projects = [
      makeProject('Dupont', { code: 'DUPONT' }),
      makeProject('Étagère', { parts: [part()] }),
      makeProject('Vieux', { code: 'OLD', archived: true }),
    ];
    expect(matchProject('[DUPONT] support.3mf', projects)?.reason).toBe('préfixe [DUPONT]');
    expect(matchProject('dupont - clip', projects)?.project.name).toBe('Dupont');
    expect(matchProject('Support.gcode.3mf', projects)).toMatchObject({ part: { id: 'part1' } });
    expect(matchProject('[OLD] x', projects)).toBeNull();
    expect(matchProject('autre chose', projects)).toBeNull();
  });
  it('filtres et tri', () => {
    const projects = [
      makeProject('Zèbre', {
        forSelf: false,
        contactId: 'c1',
        status: 'quote',
        updatedAt: '2026-11-20T00:00:00Z',
      }),
      makeProject('Abeille', { tags: ['déco'], updatedAt: '2025-01-01T00:00:00Z', dueDate: '2026-12-01' }),
      makeProject('Archivé', { archived: true }),
    ];
    const name = (id?: string | null) => (id === 'c1' ? 'Mme Dupont' : '');
    const f = (o: object) =>
      filterProjects(projects, { ...EMPTY_PROJECT_FILTERS, ...o }, name, now).map((p) => p.name);
    expect(f({})).toEqual(['Zèbre', 'Abeille']);
    expect(f({ showArchived: true })).toHaveLength(3);
    expect(f({ query: 'dupont' })).toEqual(['Zèbre']);
    expect(f({ query: 'déco' })).toEqual(['Abeille']);
    expect(f({ forWhom: 'self' })).toEqual(['Abeille']);
    expect(f({ forWhom: 'others', status: 'quote', contactId: 'c1' })).toEqual(['Zèbre']);
    expect(f({ period: '30d' })).toEqual(['Zèbre']);
    expect(sortProjects(projects, 'name', settings).map((p) => p.name)).toEqual([
      'Abeille',
      'Archivé',
      'Zèbre',
    ]);
    expect(sortProjects(projects, 'due', settings)[0]!.name).toBe('Abeille');
    expect(sortProjects(projects, 'status', settings)[2]!.name).toBe('Zèbre');
    expect(sortProjects(projects, 'updated', settings)[0]!.name).not.toBe('Abeille');
  });
});

describe('faisabilité', () => {
  const avail = withAvailable(demo.spools, new Map());
  const need = (o: object = {}) => ({
    key: 'k',
    type: 'PLA',
    color: '#000000',
    productHint: 'PLA Basic',
    grams: 300,
    lengthM: 100,
    ...o,
  });

  it('marges de sécurité et de ratés', () => {
    expect(withMargins(100, settings)).toBe(115);
  });

  it('bobines exactes, alternatives triées par écart de couleur', () => {
    const { exact, alternatives } = spoolOptions(need(), avail);
    expect(exact.map((o) => o.spool.code).sort()).toEqual(['PLA-001', 'PLA-004']);
    expect(alternatives[0]!.spool.code).toBe('PLA-006'); // PLA Matte Charbon (noir)
    expect(alternatives[0]!.colorGap).toBe(0);
    expect(alternatives.every((a) => a.spool.material === 'PLA')).toBe(true);
  });

  it('suffisant / juste / à commander, avec liste de commande', () => {
    const rows = analyzeFeasibility({
      needs: [
        need(),
        need({ key: 'g', color: '#8E9089', grams: 95 }),
        need({ key: 't', type: 'TPU', color: '#FF0000', productHint: 'TPU 95A HF', grams: 900 }),
      ],
      spools: avail,
      settings,
      catalog,
    });
    const [black, gray, tpu] = rows;
    expect(black).toMatchObject({ status: 'ok', missingG: 0, order: null });
    // Gris : 100 g dispo pour 95 g (109,3 g avec marges) → juste.
    expect(gray).toMatchObject({ status: 'tight' });
    expect(gray!.order!.label).toContain('Gris');
    // TPU rouge : aucune bobine identique, 900 g × 1,15 = 1035 g manquants → 2 bobines.
    expect(tpu).toMatchObject({ status: 'order', missingG: 1035, availableG: 0 });
    expect(tpu!.alternatives[0]!.spool.code).toBe('TPU-001');
    expect(tpu!.order).toMatchObject({ quantity: 2, colorName: 'Rouge', unitPrice: 34.99 });
    // Le total de commande ne compte que les filaments « à commander ».
    expect(summarize(rows)).toMatchObject({
      status: 'order',
      missingG: 1035 + gray!.missingG,
      orderTotal: 69.98,
      unknownPrices: 0,
    });
  });

  it('alternative acceptée, et plusieurs bobines entamées qui suffisent ensemble', () => {
    const tpu = need({ key: 't', type: 'TPU', color: '#FF0000', productHint: 'TPU 95A HF', grams: 500 });
    const tpuSpool = demo.spools.find((s) => s.code === 'TPU-001')!;
    const [r] = analyzeFeasibility({ needs: [tpu], spools: avail, settings, accepted: { t: [tpuSpool.id] } });
    expect(r).toMatchObject({ status: 'ok', availableG: 850 });
    // 1150 g de PLA Basic noir : 180 + 1000 disponibles, aucune bobine seule ne suffit.
    const [big] = analyzeFeasibility({ needs: [need({ grams: 1150 })], spools: avail, settings });
    expect(big).toMatchObject({ status: 'tight', needsSwap: true });
  });

  it('une bobine n’est pas comptée deux fois', () => {
    const rows = analyzeFeasibility({
      needs: [need({ key: 'a', grams: 900 }), need({ key: 'b', grams: 900 })],
      spools: avail,
      settings,
    });
    expect(rows[0]!.status).toBe('ok');
    expect(rows[1]!.availableG).toBeLessThan(400);
  });

  it('durée et date de fin', () => {
    const t = timeEstimate(25 * 3600, settings, now);
    expect(t).toMatchObject({ hours: 25, days: 3 });
    expect(t.endDate.toISOString().slice(0, 10)).toBe('2026-11-30');
  });
});
