/**
 * Données de démonstration (déterministes). Elles vivent dans une base séparée :
 * activer la démo ne touche jamais aux vraies données.
 */
import { buildCatalogSeed, BAMBU_DEFAULT_TARE_G } from './catalog-seed';
import { initialMovements, makeMovement, roundG } from './movements';
import type { AmsSlot, PrintJob, Project, Spool, SpoolStatus, StockMovement } from './schemas';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface DemoData {
  spools: Spool[];
  prints: PrintJob[];
  movements: StockMovement[];
  projects: Project[];
}

const DEMO_SPOOLS: [
  product: string,
  color: string,
  refill: boolean,
  consumedPct: number,
  status: SpoolStatus,
  slot?: AmsSlot,
][] = [
  ['pla-basic', 'Noir', false, 0.82, 'ams', 1],
  ['pla-basic', 'Blanc de jade', false, 0.35, 'ams', 2],
  ['pla-basic', 'Rouge', false, 0.6, 'ams', 3],
  ['petg-hf', 'Noir', false, 0.2, 'ams', 4],
  ['pla-basic', 'Noir', true, 0, 'sealed'],
  ['pla-basic', 'Gris', false, 0.9, 'opened'],
  ['pla-matte', 'Charbon', false, 0.45, 'opened'],
  ['pla-matte', 'Blanc ivoire', false, 0, 'sealed'],
  ['petg-translucent', 'Sarcelle', false, 0.1, 'opened'],
  ['tpu-95a-hf', 'Noir', false, 0.15, 'opened'],
  ['pla-silk', 'Or', false, 0.5, 'external'],
  ['pla-basic', 'Orange citrouille', false, 1, 'empty'],
  ['pla-basic', 'Vert gui', false, 0.97, 'opened'],
  ['support-for-pla', 'Blanc', false, 0.3, 'opened'],
];

const PROJECTS = ['Rangement atelier', 'Cadeaux', 'Pièces de rechange', 'Test / calibration'];
const PIECES = [
  'Boîte à vis',
  'Support casque',
  'Clip câble',
  'Benchy',
  'Vase spirale',
  'Engrenage',
  'Pot à crayons',
  'Charnière',
  'Plaque nom',
  'Tour de calibration',
];

export function buildDemoData(now = new Date('2026-11-27T12:00:00Z')): DemoData {
  const rand = rng(42);
  const { products, colors } = buildCatalogSeed();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const stamp = (daysAgo: number) => ({ createdAt: iso(daysAgo), updatedAt: iso(daysAgo), deletedAt: null });

  const projects: Project[] = PROJECTS.map((name, i) => ({
    ...stamp(200),
    id: `demo-project-${i + 1}`,
    name,
    color: null,
    budget: i === 0 ? 60 : null,
    archived: false,
    notes: null,
  }));

  const spools: Spool[] = [];
  const movements: StockMovement[] = [];
  const counters: Record<string, number> = {};

  DEMO_SPOOLS.forEach(([slug, colorName, refill, consumedPct, status, slot], i) => {
    const product = products.find((p) => p.id === `prod-bambu-${slug}`)!;
    const color = colors.find((c) => c.productId === product.id && c.name === colorName);
    const prefix = product.material.slice(0, 4).toUpperCase();
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const id = `demo-spool-${i + 1}`;
    const bought = 180 - i * 9;
    spools.push({
      ...stamp(bought),
      id,
      code: `${prefix}-${String(counters[prefix]).padStart(3, '0')}`,
      legacyId: null,
      brand: 'Bambu Lab',
      productLine: product.name,
      material: product.material,
      catalogProductId: product.id,
      catalogColorId: color?.id ?? null,
      colorName,
      colorHex: color?.hex ?? null,
      finish: product.finish ?? null,
      manufacturerRef: color?.ref ?? null,
      diameterMm: 1.75,
      initialNetG: 1000,
      tareG: BAMBU_DEFAULT_TARE_G,
      remainingG: 1000,
      isRefill: refill,
      hasRfid: true,
      price: refill ? product.refillPrice : product.defaultPrice,
      shippingShare: i % 3 === 0 ? 1.5 : 0,
      shop: 'Bambu Lab Store',
      purchaseDate: iso(bought).slice(0, 10),
      orderNo: `DEMO-${1000 + Math.floor(i / 4)}`,
      lot: null,
      purchaseId: null,
      status,
      amsSlot: slot ?? null,
      location: status === 'sealed' || status === 'opened' ? 'Étagère atelier' : null,
      openedAt: status === 'sealed' ? null : iso(bought - 5).slice(0, 10),
      lastDriedAt: product.hygroscopic && status !== 'sealed' ? iso(40).slice(0, 10) : null,
      humidityNote: null,
      settings: {
        nozzleTempMin: product.nozzleTempMin,
        nozzleTempMax: product.nozzleTempMax,
        bedTemp: product.bedTemp,
        speed: null,
        notes: null,
      },
      lowThresholdG: null,
      criticalThresholdG: null,
      needsWeighing: false,
      tags: i % 4 === 0 ? ['démo'] : [],
      notes: i === 11 ? 'Bobine terminée, à recycler.' : null,
      photoIds: [],
      custom: {},
    });
    movements.push(...initialMovements(id, 1000, 0, { at: iso(bought), refKind: 'manual' }));
    // On garde la consommation à imputer pour générer les impressions.
    (spools[spools.length - 1] as Spool & { _toConsume?: number })._toConsume = roundG(1000 * consumedPct);
  });

  const prints: PrintJob[] = [];
  let n = 0;
  for (const s of spools as (Spool & { _toConsume?: number })[]) {
    let left = s._toConsume ?? 0;
    delete s._toConsume;
    while (left > 0) {
      const grams = roundG(Math.min(left, 15 + rand() * 140));
      left = roundG(left - grams);
      const daysAgo = Math.floor(rand() * 150);
      const roll = rand();
      const status: PrintJob['status'] = roll < 0.85 ? 'success' : roll < 0.95 ? 'failed' : 'cancelled';
      const id = `demo-print-${++n}`;
      prints.push({
        ...stamp(daysAgo),
        id,
        name: `${PIECES[Math.floor(rand() * PIECES.length)]} #${n}`,
        date: iso(daysAgo).slice(0, 10),
        durationMin: Math.round(grams * (2 + rand() * 2)),
        projectId: projects[Math.floor(rand() * projects.length)]!.id,
        plate: 'Plateau 1',
        status,
        failedAtPercent: status === 'failed' ? Math.round(20 + rand() * 60) : null,
        estimatedG: grams,
        usages: [{ spoolId: s.id, grams, role: 'main', amsSlot: s.amsSlot ?? null }],
        energyKwh: null,
        sourceFileId: null,
        photoIds: [],
        notes: status === 'failed' ? 'Décollement du plateau.' : null,
        legacyRow: null,
        needsReview: false,
        reviewNote: null,
        custom: {},
      });
      movements.push(
        makeMovement({
          spoolId: s.id,
          type: 'print',
          deltaG: -grams,
          at: iso(daysAgo),
          refKind: 'print',
          refId: id,
        }),
      );
    }
  }
  // Impressions planifiées.
  for (let i = 0; i < 3; i++) {
    prints.push({
      ...stamp(1),
      id: `demo-print-planned-${i + 1}`,
      name: `${PIECES[i]} (à imprimer)`,
      date: null,
      durationMin: null,
      projectId: projects[0]!.id,
      plate: null,
      status: 'planned',
      failedAtPercent: null,
      estimatedG: 80 + i * 40,
      usages: [],
      energyKwh: null,
      sourceFileId: null,
      photoIds: [],
      notes: null,
      legacyRow: null,
      needsReview: false,
      reviewNote: null,
      custom: {},
    });
  }

  for (const s of spools) {
    s.remainingG = roundG(movements.filter((m) => m.spoolId === s.id).reduce((a, m) => a + m.deltaG, 0));
  }
  return { spools, prints, movements, projects };
}
