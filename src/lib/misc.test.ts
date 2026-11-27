import { isBackupDue, makeBackup, validateBackup, backupFileName } from './backup';
import { extractManufacturerRef, findColor, findProduct, usualPrice } from './catalog';
import { buildCatalogSeed } from './catalog-seed';
import { buildDemoData } from './demo';
import { movementRows, printCost, printRows, projectRows, spoolRows, toCsv } from './export';
import { distinctValues, EMPTY_FILTERS, filterSpools, locationOf } from './filters';
import { sumMovements } from './movements';
import { spoolSchema } from './schemas';

const settings = { lowThresholdG: 150, criticalThresholdG: 50 };
const demo = buildDemoData();
const seed = buildCatalogSeed();

describe('catalogue', () => {
  it('trouve gammes et couleurs', () => {
    expect(findProduct('pla basic', seed.products)?.id).toBe('prod-bambu-pla-basic');
    expect(findProduct('PLA Silk', seed.products)?.name).toBe('PLA Silk+');
    expect(findProduct('inconnu', seed.products)).toBeUndefined();
    expect(findColor(seed.colors, { productId: 'prod-bambu-pla-basic', ref: '10502' })?.name).toBe(
      'Vert gui',
    );
    expect(findColor(seed.colors, { productId: 'prod-bambu-pla-basic', name: 'noir' })?.hex).toBe('#000000');
  });
  it('extrait les références', () => {
    expect(extractManufacturerRef('Réf. 10502 · entamée')).toBe('10502');
    expect(extractManufacturerRef('référence: ABC-123')).toBe('ABC-123');
    expect(extractManufacturerRef('rien')).toBeNull();
  });
  it('prix habituel = dernier prix payé, sinon catalogue', () => {
    const p = seed.products[0]!;
    expect(usualPrice(p, [], false)).toBe(25.99);
    expect(usualPrice(p, [], true)).toBe(22.99);
    const spools = [
      {
        catalogProductId: p.id,
        productLine: 'PLA Basic',
        price: 19.99,
        isRefill: false,
        createdAt: '2026-05-01',
        deletedAt: null,
      },
    ];
    expect(usualPrice(p, spools, false)).toBe(19.99);
    expect(usualPrice(undefined, [], false)).toBeNull();
  });
  it('le catalogue de départ est valide', () => {
    expect(seed.products.length).toBeGreaterThan(5);
    expect(new Set(seed.colors.map((c) => c.id)).size).toBe(seed.colors.length);
  });
});

describe('données de démo', () => {
  it('sont cohérentes (restant = somme du journal)', () => {
    for (const s of demo.spools) {
      expect(spoolSchema.safeParse(s).success).toBe(true);
      expect(s.remainingG).toBe(sumMovements(demo.movements.filter((m) => m.spoolId === s.id)));
    }
    expect(demo.prints.some((p) => p.status === 'planned')).toBe(true);
    expect(new Set(demo.spools.filter((s) => s.status === 'ams').map((s) => s.amsSlot)).size).toBe(4);
  });
});

describe('filtres', () => {
  it('combine recherche et filtres', () => {
    const all = filterSpools(demo.spools, EMPTY_FILTERS, settings);
    expect(all.length).toBe(demo.spools.length);
    expect(
      filterSpools(demo.spools, { ...EMPTY_FILTERS, query: 'noir petg' }, settings).map((s) => s.productLine),
    ).toEqual(['PETG HF']);
    expect(filterSpools(demo.spools, { ...EMPTY_FILTERS, materials: ['TPU'] }, settings)).toHaveLength(1);
    expect(filterSpools(demo.spools, { ...EMPTY_FILTERS, statuses: ['ams'] }, settings)).toHaveLength(4);
    expect(
      filterSpools(demo.spools, { ...EMPTY_FILTERS, levels: ['empty'] }, settings).length,
    ).toBeGreaterThan(0);
    expect(filterSpools(demo.spools, { ...EMPTY_FILTERS, locations: ['AMS 1'] }, settings)).toHaveLength(1);
    expect(filterSpools(demo.spools, { ...EMPTY_FILTERS, brands: ['Autre'] }, settings)).toHaveLength(0);
  });
  it('masque archivées et supprimées par défaut', () => {
    const s = [
      { ...demo.spools[0]!, status: 'archived' as const },
      { ...demo.spools[1]!, deletedAt: 'x' },
    ];
    expect(filterSpools(s, EMPTY_FILTERS, settings)).toHaveLength(0);
    expect(filterSpools(s, { ...EMPTY_FILTERS, statuses: ['archived'] }, settings)).toHaveLength(1);
    expect(filterSpools(s, { ...EMPTY_FILTERS, includeArchived: true }, settings)).toHaveLength(1);
  });
  it('emplacement et valeurs distinctes', () => {
    expect(locationOf({ status: 'ams', amsSlot: 2, location: null })).toBe('AMS 2');
    expect(locationOf({ status: 'external', amsSlot: null, location: null })).toBe('Support externe');
    expect(locationOf({ status: 'opened', amsSlot: null, location: 'Étagère' })).toBe('Étagère');
    expect(distinctValues(demo.spools, (s) => s.material)).toEqual(['PETG', 'PLA', 'Support', 'TPU']);
  });
});

describe('export', () => {
  it('feuilles bobines, impressions, mouvements, projets', () => {
    const s = spoolRows(demo.spools, settings);
    expect(s[0]).toMatchObject({
      Code: 'PLA-001',
      Gamme: 'PLA Basic',
      Statut: 'Dans l’AMS',
      Emplacement: 'AMS 1',
    });
    const p = printRows(demo.prints, demo.spools, demo.projects);
    expect(p[0]).toHaveProperty('Coût (€)');
    expect(p.find((x) => x.Résultat === 'Planifiée')).toBeTruthy();
    const m = movementRows(demo.movements, demo.spools);
    expect(m[0]).toHaveProperty('Variation (g)');
    expect(projectRows(demo.projects)).toHaveLength(4);
  });
  it('coût d’une impression', () => {
    const byId = new Map(demo.spools.map((s) => [s.id, s]));
    const print = demo.prints.find((x) => x.usages.length)!;
    const spool = byId.get(print.usages[0]!.spoolId!)!;
    expect(printCost(print, byId)).toBeCloseTo(
      (print.usages[0]!.grams * (spool.price! + (spool.shippingShare ?? 0))) / 1000,
    );
  });
  it('champs personnalisés exportés avec leur libellé', () => {
    const rows = spoolRows([{ ...demo.spools[0]!, custom: { xl_f: 'Bambu', obj: { a: 1 } } }], settings, {
      xl_f: 'Fournisseur',
    });
    expect(rows[0]).toMatchObject({ Fournisseur: 'Bambu', obj: '{"a":1}' });
  });
  it('CSV pour Excel français', () => {
    const csv = toCsv([
      { a: 1.5, b: 'x;y', c: null },
      { a: 2, b: 'dit "ok"', c: true },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('a;b;c\r\n1,5;"x;y";\r\n2;"dit ""ok""";true');
    expect(toCsv([])).toBe('\uFEFF');
  });
});

describe('sauvegarde', () => {
  it('aller-retour valide', () => {
    const b = makeBackup(
      { spools: demo.spools, prints: demo.prints, movements: demo.movements, projects: demo.projects },
      1,
      '2026-11-27T00:00:00Z',
    );
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.counts.spools).toBe(demo.spools.length);
  });
  it('refuse les fichiers invalides', () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(
      validateBackup({ app: 'filatrack', format: 99, schemaVersion: 1, exportedAt: 'x', tables: {} }).ok,
    ).toBe(false);
    const bad = makeBackup(
      { spools: [{ ...demo.spools[0]!, remainingG: 'beaucoup' as unknown as number }] },
      1,
    );
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toContain('spools[0]');
  });
  it('rappel de sauvegarde', () => {
    const now = new Date('2026-11-27T00:00:00Z');
    expect(isBackupDue(null, 14, now, true)).toBe(true);
    expect(isBackupDue(null, 14, now, false)).toBe(false);
    expect(isBackupDue('2026-11-20T00:00:00Z', 14, now, true)).toBe(false);
    expect(isBackupDue('2026-11-01T00:00:00Z', 14, now, true)).toBe(true);
    expect(isBackupDue('2026-11-01T00:00:00Z', 0, now, true)).toBe(false);
    expect(isBackupDue('invalide', 14, now, true)).toBe(true);
    expect(backupFileName(new Date(2026, 10, 27, 9, 5))).toBe('filatrack-backup-2026-11-27_0905.json');
  });
});

describe('tri des cartes', () => {
  it('par code, restant, gamme', async () => {
    const { sortSpools } = await import('./filters');
    expect(sortSpools(demo.spools, undefined)[0]!.code).toBe('PETG-001');
    const byRemaining = sortSpools(demo.spools, { id: 'remainingG', desc: false });
    expect(byRemaining[0]!.remainingG).toBeLessThanOrEqual(byRemaining.at(-1)!.remainingG);
    expect(sortSpools(demo.spools, { id: 'code', desc: true })[0]!.code).toBe('TPU-001');
    for (const id of ['productLine', 'colorName', 'brand', 'status', 'price', 'level'])
      expect(sortSpools(demo.spools, { id, desc: false })).toHaveLength(demo.spools.length);
  });
});
