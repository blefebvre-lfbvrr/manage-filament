import { buildCatalogSeed } from './catalog-seed';
import { buildDemoData } from './demo';
import { DEFAULT_SETTINGS, type AlertRule, type ShoppingItem, type Spool } from './schemas';
import {
  buildAlerts,
  dryingDue,
  evaluateRule,
  evaluateRules,
  itemToLine,
  PRODUCT_COLOR_SEP,
  ruleLabel,
  ruleMatches,
  shoppingSuggestions,
  shoppingText,
  shoppingTotal,
} from './alerts';

const now = new Date('2026-11-27T12:00:00Z');
const demo = buildDemoData(now);
const catalog = buildCatalogSeed();
const settings = { ...DEFAULT_SETTINGS };
const stamp = { createdAt: '2026-01-01', updatedAt: '2026-01-01', deletedAt: null };
const rule = (o: Partial<AlertRule>): AlertRule => ({
  ...stamp,
  id: 'r1',
  scope: 'productColor',
  value: `PLA Basic${PRODUCT_COLOR_SEP}Noir`,
  minSpools: 2,
  minGrams: null,
  enabled: true,
  ...o,
});

describe('règles de stock minimum', () => {
  it('« garder au moins 2 PLA Basic Noir »', () => {
    const st = evaluateRule(rule({}), demo.spools, settings);
    // PLA-001 (180 g, OK) + PLA-004 recharge neuve (1000 g)
    expect(st.spoolCount).toBe(2);
    expect(st.ok).toBe(true);
    expect(evaluateRule(rule({ minSpools: 3 }), demo.spools, settings)).toMatchObject({
      ok: false,
      missingSpools: 1,
    });
  });
  it('par matériau, gamme, couleur, bobine, et en grammes', () => {
    expect(
      evaluateRule(rule({ scope: 'material', value: 'tpu', minSpools: 1 }), demo.spools, settings).ok,
    ).toBe(true);
    expect(
      evaluateRule(rule({ scope: 'material', value: 'ASA', minSpools: 1 }), demo.spools, settings),
    ).toMatchObject({ ok: false, spoolCount: 0, missingSpools: 1 });
    expect(
      evaluateRule(
        rule({ scope: 'productLine', value: 'PLA Matte', minSpools: null, minGrams: 2000 }),
        demo.spools,
        settings,
      ),
    ).toMatchObject({ ok: false, missingG: 450 });
    expect(
      evaluateRule(rule({ scope: 'color', value: 'noir', minSpools: 1 }), demo.spools, settings).spools
        .length,
    ).toBeGreaterThan(2);
    const s = demo.spools[0]!;
    expect(ruleMatches(rule({ scope: 'spool', value: s.code }), s)).toBe(true);
    expect(ruleLabel(rule({}))).toBe('PLA Basic Noir');
  });
  it('les bobines « à changer » ne comptent pas comme disponibles', () => {
    const spools: Spool[] = [{ ...demo.spools[0]!, remainingG: 30 }];
    const st = evaluateRule(rule({ minSpools: 1 }), spools, settings);
    expect(st.spoolCount).toBe(0);
    expect(st.grams).toBe(30);
  });
  it('règles désactivées ou supprimées ignorées', () => {
    expect(
      evaluateRules([rule({ enabled: false }), rule({ id: 'x', deletedAt: 'y' })], demo.spools, settings),
    ).toHaveLength(0);
  });
});

describe('séchage', () => {
  it('matériaux hygroscopiques ouverts, non séchés depuis N jours', () => {
    const due = dryingDue(demo.spools, catalog.products, { dryingReminderDays: 30 }, now);
    // PETG HF (AMS), PETG Translucent, TPU, Support : séchés il y a 40 jours ; PLA jamais concerné.
    expect(due.map((d) => d.spool.material).sort()).toEqual(['PETG', 'PETG', 'Support', 'TPU']);
    expect(due[0]!.since).toBe('dried');
    expect(dryingDue(demo.spools, catalog.products, { dryingReminderDays: 60 }, now)).toHaveLength(0);
    expect(dryingDue(demo.spools, catalog.products, { dryingReminderDays: 0 }, now)).toHaveLength(0);
    const never = dryingDue(
      [{ ...demo.spools[3]!, lastDriedAt: null, openedAt: null }],
      catalog.products,
      { dryingReminderDays: 30 },
      now,
    );
    expect(never[0]!.since).toBe('unknown');
  });
});

describe('alertes', () => {
  it('niveaux, règles, séchage, pesée, sauvegarde, triées par gravité', () => {
    const spools = demo.spools.map((s, i) => (i === 1 ? { ...s, needsWeighing: true } : s));
    const alerts = buildAlerts({
      spools,
      rules: [rule({ scope: 'material', value: 'ASA', minSpools: 1 })],
      products: catalog.products,
      settings,
      now,
      backupDue: true,
    });
    const kinds = new Set(alerts.map((a) => a.kind));
    expect([...kinds].sort()).toEqual(['backup', 'drying', 'level', 'rule', 'weighing']);
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts.find((a) => a.kind === 'level' && a.title.startsWith('PLA-010'))!.title).toBe(
      'PLA-010 à changer',
    );
    // Bobine marquée vide : pas d'alerte de niveau.
    expect(alerts.some((a) => a.title.startsWith('PLA-009'))).toBe(false);
    expect(new Set(alerts.map((a) => a.key)).size).toBe(alerts.length);
  });
});

describe('liste de courses', () => {
  it('suggère de racheter les bobines vides / à changer sans rechange', () => {
    const lines = shoppingSuggestions(demo.spools, [], catalog, settings);
    const labels = lines.map((l) => l.label);
    expect(labels).toContain('Bambu Lab PLA Basic Orange citrouille'); // PLA-009 vide
    expect(labels).toContain('Bambu Lab PLA Basic Vert gui'); // PLA-010 à changer
    const orange = lines.find((l) => l.label.includes('Orange'))!;
    expect(orange).toMatchObject({ quantity: 1, unitPrice: 25.99, colorHex: '#FF9016' });
    expect(orange.productUrl).toContain('bambulab');
    // Bientôt vides seulement si l'option est active.
    expect(lines.some((l) => l.label.includes('Gris'))).toBe(false);
    expect(
      shoppingSuggestions(demo.spools, [], catalog, { ...settings, shoppingIncludeLow: true }).some((l) =>
        l.label.includes('Gris'),
      ),
    ).toBe(true);
  });
  it('règles non respectées, sans doublon avec les bobines vides', () => {
    const lines = shoppingSuggestions(
      demo.spools,
      [rule({ value: `PLA Basic${PRODUCT_COLOR_SEP}Orange citrouille`, minSpools: 2 })],
      catalog,
      settings,
    );
    const orange = lines.filter((l) => l.label.includes('Orange'));
    expect(orange).toHaveLength(1);
    expect(orange[0]!.quantity).toBe(2);
    expect(orange[0]!.reason).toContain('minimum');
    const asa = shoppingSuggestions(
      [],
      [rule({ scope: 'material', value: 'ASA', minSpools: 1 })],
      catalog,
      settings,
    );
    expect(asa[0]).toMatchObject({ label: 'ASA', quantity: 1 });
  });
  it('lignes manuelles, total et export texte', () => {
    const item: ShoppingItem = {
      ...stamp,
      id: 'i1',
      label: 'PETG HF Noir',
      quantity: 2,
      unitPrice: 20,
      isRefill: false,
      source: 'manual',
      productUrl: 'https://x',
    };
    const l = itemToLine(item);
    expect(l).toMatchObject({ key: 'item:i1', reason: 'ajout manuel' });
    expect(shoppingTotal([l, { quantity: 1, unitPrice: null }])).toEqual({ total: 40, unknown: 1 });
    const txt = shoppingText([l]).replace(/[  ]/g, ' ');
    expect(txt).toContain('- 2 × PETG HF Noir (~20,00 €) — https://x');
    expect(txt).toContain('Total estimé : 40,00 €');
  });
});
