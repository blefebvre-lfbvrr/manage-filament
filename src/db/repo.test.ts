import { legacyWorkbook } from '@/test/fixtures';
import { analyzeWorkbook, planInputFromAnalysis } from '@/lib/excel/analyze';
import { buildImportPlan } from '@/lib/excel/plan';
import { readWorkbook } from '@/lib/excel/read';
import { validateBackup } from '@/lib/backup';
import { FilaTrackDB } from './db';
import {
  applyImportPlan,
  clearAllData,
  createSpools,
  duplicateSpool,
  ensureSeed,
  exportBackup,
  getSettings,
  restoreBackup,
  saveSettings,
  setRemaining,
  softDeleteSpools,
  restoreSpools,
  undoMovement,
  updateSpool,
  bulkUpdateSpools,
  type SpoolInput,
} from './repo';

let db: FilaTrackDB;
let n = 0;
beforeEach(async () => {
  db = new FilaTrackDB(`test-${++n}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

const input = (o: Partial<SpoolInput> = {}): SpoolInput => ({
  brand: 'Bambu Lab',
  productLine: 'PLA Basic',
  material: 'PLA',
  colorName: 'Noir',
  colorHex: '#000000',
  diameterMm: 1.75,
  initialNetG: 1000,
  isRefill: false,
  hasRfid: true,
  status: 'sealed',
  tags: [],
  photoIds: [],
  custom: {},
  ...o,
});

describe('dépôt de données', () => {
  it('catalogue initialisé une seule fois', async () => {
    const count = await db.products.count();
    await ensureSeed(db);
    expect(await db.products.count()).toBe(count);
    expect(count).toBeGreaterThan(0);
  });

  it('paramètres par défaut et sauvegarde', async () => {
    expect((await getSettings(db)).lowThresholdG).toBe(150);
    await saveSettings({ lowThresholdG: 200 }, db);
    expect((await getSettings(db)).lowThresholdG).toBe(200);
  });

  it('ajout multiple avec codes successifs et journal', async () => {
    const created = await createSpools(input({ priorConsumedG: 100 }), 3, db);
    expect(created.map((s) => s.code)).toEqual(['PLA-001', 'PLA-002', 'PLA-003']);
    expect(created[0]!.remainingG).toBe(900);
    expect(await db.movements.where('spoolId').equals(created[0]!.id).count()).toBe(2);
    await expect(createSpools(input({ code: 'PLA-001' }), 1, db)).rejects.toThrow('déjà utilisé');
  });

  it('un seul occupant par slot AMS', async () => {
    const [a] = await createSpools(input({ status: 'ams', amsSlot: 1 }), 1, db);
    const [b] = await createSpools(input(), 1, db);
    await updateSpool(b!.id, { status: 'ams', amsSlot: 1 }, db);
    expect((await db.spools.get(a!.id))!.status).toBe('opened');
    expect((await db.spools.get(b!.id))!.amsSlot).toBe(1);
    await expect(updateSpool(a!.id, { status: 'ams', amsSlot: null }, db)).rejects.toThrow('slot');
    await expect(bulkUpdateSpools([a!.id], { status: 'ams' }, db)).rejects.toThrow();
    await bulkUpdateSpools([a!.id, b!.id], { location: 'Étagère' }, db);
    expect((await db.spools.get(b!.id))!.location).toBe('Étagère');
  });

  it('correction du restant puis annulation', async () => {
    const [s] = await createSpools(input(), 1, db);
    const m = await setRemaining(s!.id, 400, null, db);
    expect((await db.spools.get(s!.id))!.remainingG).toBe(400);
    await undoMovement(m!.id, db);
    expect((await db.spools.get(s!.id))!.remainingG).toBe(1000);
    await expect(undoMovement(m!.id, db)).rejects.toThrow('déjà été annulé');
    expect(await setRemaining(s!.id, 1000, null, db)).toBeNull();
    await setRemaining(s!.id, 0, null, db);
    expect((await db.spools.get(s!.id))!.status).toBe('empty');
  });

  it('modifier le poids initial ajuste le restant', async () => {
    const [s] = await createSpools(input(), 1, db);
    await updateSpool(s!.id, { initialNetG: 750, remainingG: 5 }, db);
    expect((await db.spools.get(s!.id))!.remainingG).toBe(750);
  });

  it('duplication, suppression logique et restauration', async () => {
    const [s] = await createSpools(input({ status: 'ams', amsSlot: 2, priorConsumedG: 500 }), 1, db);
    const dups = await duplicateSpool(s!.id, 2, db);
    expect(dups.map((d) => [d.code, d.status, d.remainingG])).toEqual([
      ['PLA-002', 'sealed', 1000],
      ['PLA-003', 'sealed', 1000],
    ]);
    await softDeleteSpools([s!.id], db);
    expect((await db.spools.get(s!.id))!.deletedAt).toBeTruthy();
    await restoreSpools([s!.id], db);
    expect((await db.spools.get(s!.id))!.deletedAt).toBeNull();
  });

  it('import complet de l’Excel puis réimport sans doublon', async () => {
    const analysis = analyzeWorkbook(readWorkbook(legacyWorkbook()));
    const existing = async () => ({
      spools: await db.spools.toArray(),
      prints: await db.prints.toArray(),
      projects: await db.projects.toArray(),
      brands: await db.brands.toArray(),
      products: await db.products.toArray(),
      colors: await db.colors.toArray(),
      customFieldDefs: await db.customFieldDefs.toArray(),
      locations: (await db.locations.toArray()).map((l) => l.name),
    });
    const options = {
      keepLegacyCodes: true,
      duplicateStrategy: 'skip' as const,
      now: new Date().toISOString(),
    };
    const plan = buildImportPlan(planInputFromAnalysis(analysis, { existing: await existing(), options }));
    const res = await applyImportPlan(
      plan,
      {
        applySettings: true,
        mappings: [{ name: 'Bobines', kind: 'spools', signature: 'sig', columns: { id: 'field:legacyId' } }],
      },
      db,
    );
    expect(res).toMatchObject({ spoolsCreated: 4, printsCreated: 5, projectsCreated: 3 });
    const b01 = await db.spools.where('code').equals('B01').first();
    expect(b01!.remainingG).toBe(700);
    const b03 = await db.spools.where('code').equals('B03').first();
    expect(b03!.remainingG).toBe(950);
    expect(await db.importMappings.count()).toBe(1);
    expect(await db.locations.count()).toBe(1);

    const again = buildImportPlan(planInputFromAnalysis(analysis, { existing: await existing(), options }));
    const res2 = await applyImportPlan(again, { applySettings: false, mappings: [] }, db);
    expect(res2).toMatchObject({ spoolsCreated: 0, printsCreated: 0 });
    expect((await db.spools.where('code').equals('B01').first())!.remainingG).toBe(700);

    const upd = buildImportPlan(
      planInputFromAnalysis(analysis, {
        existing: await existing(),
        options: { ...options, duplicateStrategy: 'update' },
      }),
    );
    const res3 = await applyImportPlan(upd, { applySettings: false, mappings: [] }, db);
    expect(res3.spoolsUpdated).toBe(4);
    expect((await db.spools.where('code').equals('B01').first())!.remainingG).toBe(700);
  });

  it('sauvegarde, effacement et restauration', async () => {
    await createSpools(input(), 2, db);
    const backup = await exportBackup(db);
    const v = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(v.ok).toBe(true);
    await clearAllData(db);
    expect(await db.spools.count()).toBe(0);
    expect(await db.products.count()).toBeGreaterThan(0);
    await restoreBackup(backup, 'replace', db);
    expect(await db.spools.count()).toBe(2);
    await restoreBackup(backup, 'merge', db);
    expect(await db.spools.count()).toBe(2);
  });
});
