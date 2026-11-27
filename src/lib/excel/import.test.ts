import { legacyWorkbook } from '@/test/fixtures';
import { buildCatalogSeed } from '../catalog-seed';
import type { Spool } from '../schemas';
import { analyzeWorkbook, planInputFromAnalysis, withRole } from './analyze';
import {
  autoMap,
  detectHeaderRow,
  extractTable,
  mappingToRecord,
  matchField,
  tableSignature,
} from './mapping';
import {
  buildImportPlan,
  parseLocation,
  parsePrintResult,
  parseSpoolStatus,
  type ExistingData,
  type PlanOptions,
} from './plan';
import { readWorkbook } from './read';

const seed = buildCatalogSeed();
const emptyExisting = (): ExistingData => ({
  spools: [],
  prints: [],
  projects: [],
  brands: seed.brands,
  products: seed.products,
  colors: seed.colors,
  customFieldDefs: [],
  locations: [],
});
const opts = (o: Partial<PlanOptions> = {}): PlanOptions => ({
  keepLegacyCodes: true,
  duplicateStrategy: 'skip',
  now: '2026-11-27T10:00:00.000Z',
  ...o,
});

function plan(existing = emptyExisting(), o: Partial<PlanOptions> = {}) {
  const wb = readWorkbook(legacyWorkbook(), 'test.xlsx');
  const analysis = analyzeWorkbook(wb);
  return { analysis, plan: buildImportPlan(planInputFromAnalysis(analysis, { existing, options: opts(o) })) };
}

describe('analyse du classeur', () => {
  it('reconnaît les feuilles et le bloc de seuils', () => {
    const { analysis } = plan();
    expect(analysis.sheets.map((s) => [s.sheet.name, s.role])).toEqual([
      ['Bobines', 'spools'],
      ['Impressions', 'prints'],
      ['Mode d’emploi', 'ignore'],
      ['Dropdown options', 'lists'],
    ]);
    expect(analysis.settings).toEqual({ lowThresholdG: 150, criticalThresholdG: 50 });
    expect(analysis.sheets[3]!.sheet.hidden).toBe(true);
  });

  it('distingue colonnes saisies, calculées et inconnues', () => {
    const { analysis } = plan();
    const s = analysis.sheets[0]!;
    const byHeader = Object.fromEntries(s.table!.headers.map((h, i) => [h, s.targets[i]]));
    expect(byHeader['ID']).toBe('field:legacyId');
    expect(byHeader['Restant (g)']).toBe('check:remainingG');
    expect(byHeader['Statut']).toBe('check:status');
    expect(byHeader['Poids net initial (g)']).toBe('field:initialNetG');
    expect(byHeader['Fournisseur favori']).toBe('custom');
    const p = analysis.sheets[1]!;
    expect(p.targets[p.table!.headers.indexOf('Sur bobine (g)')]).toBe('check:onSpoolG');
  });

  it('détection d’en-tête et correspondances', () => {
    expect(detectHeaderRow([['titre'], ['Pièce', 'Bobine', 'Filament (g)']])).toBe(1);
    expect(detectHeaderRow([['rien'], ['du tout']])).toBe(-1);
    expect(matchField('Prix bobine (€)', 'spools')?.key).toBe('price');
    expect(matchField('Durée (h)', 'prints')?.key).toBe('durationH');
    expect(matchField('Poids (kg)', 'prints')?.key).toBe('totalG');
    expect(matchField('???', 'prints')).toBeUndefined();
  });

  it('mapping enregistré réappliqué', () => {
    const wb = readWorkbook(legacyWorkbook());
    const a = analyzeWorkbook(wb);
    const s = a.sheets[0]!;
    const saved = mappingToRecord(
      s.table!.headers,
      s.targets.map((t, i) => (i === 17 ? 'ignore' : t)),
    );
    const sig = tableSignature('spools', s.table!.headers);
    const again = analyzeWorkbook(wb, (x) => (x === sig ? saved : undefined));
    expect(again.sheets[0]!.fromSavedMapping).toBe(true);
    expect(again.sheets[0]!.targets[17]).toBe('ignore');
  });

  it('changer le rôle d’une feuille', () => {
    const { analysis } = plan();
    expect(withRole(analysis.sheets[0]!, 'lists').role).toBe('lists');
    const t = withRole(analysis.sheets[1]!, 'spools');
    expect(t.role).toBe('spools');
    expect(autoMap(extractTable(analysis.sheets[1]!.sheet)!, 'spools')).toHaveLength(13);
  });
});

describe('plan d’import', () => {
  it('bobines : champs, couleurs du catalogue, emplacements, consommation antérieure', () => {
    const { plan: p } = plan();
    expect(p.stats.spoolRows).toBe(4);
    expect(p.stats.emptySpoolRows).toBe(1);
    const [b1, b2, b3, b4] = p.spools.map((x) => x.spool);
    expect(b1).toMatchObject({
      code: 'B01',
      legacyId: 'B01',
      productLine: 'PLA Basic',
      material: 'PLA',
      colorHex: '#000000',
      manufacturerRef: '10101',
      status: 'ams',
      amsSlot: 1,
      openedAt: '2026-03-15',
      price: 25.99,
      hasRfid: true,
    });
    expect(b1!.custom).toEqual({ xl_fournisseur_favori: 'Bambu' });
    expect(b2).toMatchObject({
      status: 'opened',
      location: 'Rangée',
      remainingG: 250,
      needsWeighing: true,
      brand: '',
    });
    expect(p.spools[1]!.priorConsumedG).toBe(750);
    expect(b3).toMatchObject({ isRefill: true, status: 'ams', amsSlot: 2, material: 'PETG' });
    expect(b4).toMatchObject({ status: 'empty', material: 'ABS/ASA', remainingG: -5, needsWeighing: true });
  });

  it('impressions : relais, planifiées, revues, bobine inconnue', () => {
    const { plan: p } = plan();
    expect(p.stats.printRows).toBe(5);
    expect(p.stats.plannedPrints).toBe(1);
    const [a, b, c, d, e] = p.prints.map((x) => x.print);
    const id = (code: string) => p.spools.find((s) => s.spool.code === code)!.spool.id;
    expect(a).toMatchObject({ status: 'success', date: '2026-04-01', durationMin: 150, estimatedG: 200 });
    expect(a!.usages).toEqual([{ spoolId: id('B01'), grams: 200, role: 'main' }]);
    expect(b!.usages).toEqual([
      { spoolId: id('B01'), grams: 100, role: 'main' },
      { spoolId: id('B03'), grams: 50, role: 'relay' },
    ]);
    expect(b).toMatchObject({ status: 'success', needsReview: true });
    expect(c).toMatchObject({ status: 'success', usages: [], needsReview: true });
    expect(d).toMatchObject({ status: 'planned', usages: [], estimatedG: 80 });
    expect(e!.usages).toEqual([{ spoolId: null, grams: 12, role: 'main' }]);
    expect(p.stats.deductedG).toBe(350);
    expect(p.issues.some((i) => i.message.includes('« B99 » introuvable'))).toBe(true);
  });

  it('restants recalculés et rapprochés avec l’Excel', () => {
    const { plan: p } = plan();
    const r = Object.fromEntries(p.spools.map((s) => [s.spool.code, s.spool.remainingG]));
    expect(r).toEqual({ B01: 700, B02: 250, B03: 950, B04: -5 });
    expect(p.reconciliation.every((x) => x.diffG === 0)).toBe(true);
    expect(p.issues.some((i) => i.message.includes('B04 : restant négatif'))).toBe(true);
  });

  it('projets, emplacements, gammes et champs personnalisés', () => {
    const { plan: p } = plan();
    expect(p.projects.map((x) => x.name)).toEqual(['Atelier', 'Test / calibration', 'Cadeaux']);
    expect(p.locations).toEqual(['Rangée']);
    expect(p.products.map((x) => x.name)).toEqual(['ABS / ASA', 'Nylon maison']);
    expect(p.customFieldDefs.map((d) => [d.label, d.type])).toEqual([['Fournisseur favori', 'text']]);
    expect(p.issues.some((i) => i.sheet === 'Mode d’emploi')).toBe(true);
  });

  it('codes générés si on ne garde pas les ID de l’Excel', () => {
    const { plan: p } = plan(emptyExisting(), { keepLegacyCodes: false });
    expect(p.spools.map((s) => s.spool.code)).toEqual(['PLA-001', 'PLA-002', 'PETG-001', 'ABSA-001']);
  });

  it('doublons : ignorés, mis à jour ou recréés', () => {
    const first = plan().plan;
    const existing = emptyExisting();
    existing.spools = first.spools.map((s) => s.spool as Spool);
    existing.prints = first.prints.map((x) => x.print);
    existing.projects = first.projects;
    const skip = plan(existing).plan;
    expect(skip.spools.every((s) => s.action === 'skip')).toBe(true);
    expect(skip.prints.every((s) => s.action === 'skip')).toBe(true);
    expect(skip.projects).toHaveLength(0);
    expect(skip.stats.deductedG).toBe(0);
    const upd = plan(existing, { duplicateStrategy: 'update' }).plan;
    expect(upd.spools[0]!.spool.id).toBe(existing.spools[0]!.id);
    expect(upd.prints[0]!.print.usages).toEqual(existing.prints[0]!.usages);
    const create = plan(existing, { duplicateStrategy: 'create' }).plan;
    expect(create.spools[0]!.spool.code).toBe('PLA-001');
  });

  it('slot AMS déjà occupé', () => {
    const existing = emptyExisting();
    existing.spools = [{ ...plan().plan.spools[0]!.spool, id: 'other', code: 'X-1', legacyId: null }];
    const p = plan(existing).plan;
    expect(p.spools[0]!.spool).toMatchObject({ status: 'opened', amsSlot: null });
  });
});

describe('interprétation des valeurs', () => {
  it('emplacement', () => {
    expect(parseLocation('AMS 3')).toEqual({ status: 'ams', amsSlot: 3, location: null });
    expect(parseLocation('Support externe').status).toBe('external');
    expect(parseLocation('Terminée').status).toBe('empty');
    expect(parseLocation('Étagère')).toEqual({ status: null, amsSlot: null, location: 'Étagère' });
    expect(parseLocation(null).status).toBeNull();
  });
  it('statut bobine et résultat d’impression', () => {
    expect(parseSpoolStatus('Neuve')).toBe('sealed');
    expect(parseSpoolStatus('Ouverte')).toBe('opened');
    expect(parseSpoolStatus('???')).toBeNull();
    expect(parsePrintResult('Réussie')).toBe('success');
    expect(parsePrintResult('Ratée')).toBe('failed');
    expect(parsePrintResult('Annulée')).toBe('cancelled');
    expect(parsePrintResult('À imprimer')).toBe('planned');
    expect(parsePrintResult('')).toBeNull();
  });
});
