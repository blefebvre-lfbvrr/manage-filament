/** Opérations sur les données (toujours en transaction pour garder stock et journal cohérents). */
import { makeBackup, TABLE_NAMES, type Backup, type TableName } from '@/lib/backup';
import { buildCatalogSeed } from '@/lib/catalog-seed';
import { codePrefix, nextCodes } from '@/lib/codes';
import { buildDemoData } from '@/lib/demo';
import type { ImportPlan } from '@/lib/excel/plan';
import { newId, nowIso } from '@/lib/ids';
import { adjustmentTo, initialMovements, makeMovement, reverseMovement, sumMovements } from '@/lib/movements';
import {
  appSettingsSchema,
  DEFAULT_SETTINGS,
  type AmsSlot,
  type AppSettings,
  type ImportMapping,
  type Spool,
  type StockMovement,
} from '@/lib/schemas';
import { statusAfterRemainingChange } from '@/lib/spool';
import { DB_VERSION, getDataMode, getDb, type FilaTrackDB } from './db';

const SETTINGS_KEY = 'app';

/* ---------------------------- Initialisation ---------------------------- */

export async function ensureSeed(db: FilaTrackDB = getDb()): Promise<void> {
  await db.transaction(
    'rw',
    [db.brands, db.products, db.colors, db.spools, db.prints, db.movements, db.projects, db.settings],
    async () => {
      const seeded = await db.settings.get('catalogSeeded');
      if (!seeded) {
        const seed = buildCatalogSeed();
        await db.brands.bulkPut(seed.brands);
        await db.products.bulkPut(seed.products);
        await db.colors.bulkPut(seed.colors);
        await db.settings.put({ key: 'catalogSeeded', value: nowIso() });
      }
      if (getDataMode() === 'demo' && (await db.spools.count()) === 0) {
        const demo = buildDemoData();
        await db.spools.bulkPut(demo.spools);
        await db.prints.bulkPut(demo.prints);
        await db.movements.bulkPut(demo.movements);
        await db.projects.bulkPut(demo.projects);
      }
    },
  );
}

/* ------------------------------ Paramètres ------------------------------ */

export async function getSettings(db: FilaTrackDB = getDb()): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  const parsed = appSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(
  patch: Partial<AppSettings>,
  db: FilaTrackDB = getDb(),
): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const next = appSettingsSchema.parse({ ...(await getSettings(db)), ...patch });
    await db.settings.put({ key: SETTINGS_KEY, value: next });
    return next;
  });
}

/* -------------------------------- Stock -------------------------------- */

/** Recalcule le restant (cache) d'après le journal. */
export async function recomputeRemaining(
  spoolIds: Iterable<string>,
  db: FilaTrackDB = getDb(),
): Promise<void> {
  for (const id of new Set(spoolIds)) {
    const spool = await db.spools.get(id);
    if (!spool) continue;
    const movements = await db.movements.where('spoolId').equals(id).toArray();
    const remainingG = sumMovements(movements);
    if (remainingG !== spool.remainingG) await db.spools.update(id, { remainingG, updatedAt: nowIso() });
  }
}

export type SpoolInput = Omit<
  Spool,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'remainingG' | 'code'
> & {
  code?: string | null;
  /** Déjà consommé avant le suivi (g). */
  priorConsumedG?: number;
};

async function allCodes(db: FilaTrackDB): Promise<string[]> {
  return (await db.spools.toArray()).map((s) => s.code);
}

/** Libère un slot AMS : la bobine qui l'occupait repasse en « Ouverte ». */
async function freeAmsSlot(db: FilaTrackDB, slot: AmsSlot, exceptId?: string) {
  const occupants = await db.spools
    .where('status')
    .equals('ams')
    .filter((s) => s.amsSlot === slot && s.id !== exceptId && !s.deletedAt)
    .toArray();
  for (const o of occupants)
    await db.spools.update(o.id, { status: 'opened', amsSlot: null, updatedAt: nowIso() });
}

/** Crée une ou plusieurs bobines identiques (ajout multiple « 4 × PLA Basic Noir »). */
export async function createSpools(
  input: SpoolInput,
  quantity = 1,
  db: FilaTrackDB = getDb(),
): Promise<Spool[]> {
  const n = Math.max(1, Math.min(100, Math.floor(quantity)));
  return db.transaction('rw', db.spools, db.movements, async () => {
    const existing = await allCodes(db);
    if (input.code && n === 1 && existing.includes(input.code))
      throw new Error(`Le code « ${input.code} » est déjà utilisé.`);
    const codes = input.code && n === 1 ? [input.code] : nextCodes(codePrefix(input.material), existing, n);
    const now = nowIso();
    const created: Spool[] = [];
    if (input.status === 'ams' && input.amsSlot) {
      if (n > 1) throw new Error('Un seul slot AMS par bobine : crée-les hors AMS puis place-les.');
      await freeAmsSlot(db, input.amsSlot);
    }
    for (const code of codes) {
      const { priorConsumedG = 0, ...rest } = input;
      const spool: Spool = {
        ...rest,
        id: newId(),
        code,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        remainingG: input.initialNetG - priorConsumedG,
      };
      if (input.status !== 'ams') spool.amsSlot = null;
      await db.spools.add(spool);
      await db.movements.bulkAdd(
        initialMovements(spool.id, spool.initialNetG, priorConsumedG, { refKind: 'manual' }),
      );
      created.push(spool);
    }
    return created;
  });
}

const STOCK_FIELDS = ['remainingG', 'id', 'createdAt'] as const;

export async function updateSpool(
  id: string,
  patch: Partial<Spool>,
  db: FilaTrackDB = getDb(),
): Promise<void> {
  await db.transaction('rw', db.spools, db.movements, async () => {
    const current = await db.spools.get(id);
    if (!current) throw new Error('Bobine introuvable.');
    const clean = { ...patch };
    for (const f of STOCK_FIELDS) delete clean[f];
    if (
      clean.code &&
      clean.code !== current.code &&
      (await db.spools.where('code').equals(clean.code).count()) > 0
    ) {
      throw new Error(`Le code « ${clean.code} » est déjà utilisé.`);
    }
    const next = { ...current, ...clean };
    if (next.status === 'ams') {
      if (!next.amsSlot) throw new Error('Choisis un slot AMS (1 à 4).');
      if (current.status !== 'ams' || current.amsSlot !== next.amsSlot)
        await freeAmsSlot(db, next.amsSlot, id);
    } else next.amsSlot = null;
    if (next.status === 'opened' && !next.openedAt && current.status === 'sealed')
      next.openedAt = nowIso().slice(0, 10);
    // Changer le poids net initial ajuste le mouvement « stock initial » via une correction.
    if (clean.initialNetG !== undefined && clean.initialNetG !== current.initialNetG) {
      await db.movements.add(
        makeMovement({
          spoolId: id,
          type: 'correction',
          deltaG: clean.initialNetG - current.initialNetG,
          refKind: 'manual',
          note: 'Poids net initial modifié',
        }),
      );
    }
    await db.spools.put({ ...next, updatedAt: nowIso() });
    await recomputeRemaining([id], db);
  });
}

export async function bulkUpdateSpools(
  ids: string[],
  patch: Partial<Spool>,
  db: FilaTrackDB = getDb(),
): Promise<void> {
  if (patch.status === 'ams') throw new Error('Place les bobines dans l’AMS une par une.');
  await db.transaction('rw', db.spools, db.movements, async () => {
    for (const id of ids) await updateSpool(id, patch, db);
  });
}

/** Restant corrigé à la main : ajoute un mouvement « correction » (annulable). */
export async function setRemaining(
  id: string,
  targetG: number,
  note: string | null,
  db: FilaTrackDB = getDb(),
): Promise<StockMovement | null> {
  return db.transaction('rw', db.spools, db.movements, async () => {
    const spool = await db.spools.get(id);
    if (!spool) throw new Error('Bobine introuvable.');
    const m = adjustmentTo(id, spool.remainingG, targetG, 'correction', {
      refKind: 'manual',
      note: note || 'Correction manuelle du restant',
    });
    if (!m) return null;
    await db.movements.add(m);
    await recomputeRemaining([id], db);
    const updated = await db.spools.get(id);
    if (updated) {
      const status = statusAfterRemainingChange(updated.status, updated.remainingG);
      await db.spools.update(id, {
        status,
        amsSlot: status === 'ams' ? updated.amsSlot : null,
        needsWeighing: false,
      });
    }
    return m;
  });
}

export async function undoMovement(movementId: string, db: FilaTrackDB = getDb()): Promise<StockMovement> {
  return db.transaction('rw', db.spools, db.movements, async () => {
    const m = await db.movements.get(movementId);
    if (!m) throw new Error('Mouvement introuvable.');
    const rev = reverseMovement(m);
    await db.movements.add(rev);
    await db.movements.update(m.id, { reversedById: rev.id, updatedAt: nowIso() });
    await recomputeRemaining([m.spoolId], db);
    return rev;
  });
}

export async function duplicateSpool(id: string, quantity = 1, db: FilaTrackDB = getDb()): Promise<Spool[]> {
  const s = await db.spools.get(id);
  if (!s) throw new Error('Bobine introuvable.');
  const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, remainingG: _r, code: _code, ...rest } = s;
  return createSpools(
    {
      ...rest,
      legacyId: null,
      status:
        s.status === 'ams' || s.status === 'external' || s.status === 'empty' || s.status === 'archived'
          ? 'sealed'
          : s.status,
      amsSlot: null,
      openedAt: null,
      needsWeighing: false,
      photoIds: [],
    },
    quantity,
    db,
  );
}

export async function softDeleteSpools(ids: string[], db: FilaTrackDB = getDb()): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.spools, async () => {
    for (const id of ids)
      await db.spools.update(id, { deletedAt: now, updatedAt: now, status: 'archived', amsSlot: null });
  });
}

export async function restoreSpools(ids: string[], db: FilaTrackDB = getDb()): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.spools, async () => {
    for (const id of ids) await db.spools.update(id, { deletedAt: null, updatedAt: now, status: 'opened' });
  });
}

/* ------------------------------- Import -------------------------------- */

export interface ApplyImportOptions {
  applySettings: boolean;
  mappings: Omit<ImportMapping, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[];
}

export interface ImportResult {
  spoolsCreated: number;
  spoolsUpdated: number;
  printsCreated: number;
  printsUpdated: number;
  projectsCreated: number;
  movementsCreated: number;
}

export async function applyImportPlan(
  plan: ImportPlan,
  opts: ApplyImportOptions,
  db: FilaTrackDB = getDb(),
): Promise<ImportResult> {
  const res: ImportResult = {
    spoolsCreated: 0,
    spoolsUpdated: 0,
    printsCreated: 0,
    printsUpdated: 0,
    projectsCreated: 0,
    movementsCreated: 0,
  };
  await db.transaction(
    'rw',
    [
      db.spools,
      db.prints,
      db.movements,
      db.projects,
      db.products,
      db.locations,
      db.customFieldDefs,
      db.importMappings,
      db.settings,
    ],
    async () => {
      const touched = new Set<string>();
      const importId = newId();
      for (const p of plan.projects) {
        await db.projects.put(p);
        res.projectsCreated++;
      }
      for (const p of plan.products) await db.products.put(p);
      for (const name of plan.locations) {
        if ((await db.locations.where('name').equals(name).count()) === 0) {
          const now = nowIso();
          await db.locations.add({
            id: newId(),
            name,
            notes: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
        }
      }
      for (const d of plan.customFieldDefs) await db.customFieldDefs.put(d);

      for (const ps of plan.spools) {
        if (ps.action === 'skip') continue;
        if (ps.action === 'update') {
          const current = await db.spools.get(ps.spool.id);
          if (!current) continue;
          await db.spools.put({
            ...ps.spool,
            remainingG: current.remainingG,
            initialNetG: current.initialNetG,
            custom: { ...current.custom, ...ps.spool.custom },
            updatedAt: nowIso(),
          });
          res.spoolsUpdated++;
          continue;
        }
        await db.spools.add(ps.spool);
        const ms = initialMovements(ps.spool.id, ps.spool.initialNetG, ps.priorConsumedG, {
          refKind: 'import',
          refId: importId,
          note: `Import Excel (ligne ${ps.sourceRow})`,
        });
        await db.movements.bulkAdd(ms);
        res.movementsCreated += ms.length;
        res.spoolsCreated++;
        touched.add(ps.spool.id);
      }

      // Les impressions sont appliquées dans l'ordre des lignes (pas de dates dans l'Excel d'origine).
      const base = Date.now();
      for (const [i, pp] of plan.prints.entries()) {
        if (pp.action === 'skip') continue;
        if (pp.action === 'update') {
          await db.prints.put({ ...pp.print, updatedAt: nowIso() });
          res.printsUpdated++;
          continue;
        }
        await db.prints.add(pp.print);
        res.printsCreated++;
        const at = pp.print.date ? `${pp.print.date}T12:00:00.000Z` : new Date(base + i).toISOString();
        for (const u of pp.print.usages) {
          if (!u.spoolId || !u.grams) continue;
          await db.movements.add(
            makeMovement({
              spoolId: u.spoolId,
              type: 'print',
              deltaG: -u.grams,
              at,
              refKind: 'print',
              refId: pp.print.id,
              note: pp.print.name,
            }),
          );
          res.movementsCreated++;
          touched.add(u.spoolId);
        }
      }
      await recomputeRemaining(touched, db);

      for (const m of opts.mappings) {
        const existing = await db.importMappings.where('signature').equals(m.signature).first();
        const now = nowIso();
        await db.importMappings.put({
          ...m,
          id: existing?.id ?? newId(),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        });
      }
      if (opts.applySettings && Object.keys(plan.settings).length) {
        const current = await getSettings(db);
        await db.settings.put({
          key: SETTINGS_KEY,
          value: appSettingsSchema.parse({ ...current, ...plan.settings }),
        });
      }
    },
  );
  return res;
}

/* -------------------------- Sauvegarde / restauration -------------------------- */

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportBackup(db: FilaTrackDB = getDb()): Promise<Backup> {
  const tables: Partial<Record<TableName, unknown[]>> = {};
  for (const t of TABLE_NAMES) {
    const rows = await db.table(t).toArray();
    tables[t] =
      t === 'attachments'
        ? await Promise.all(
            rows.map(async (a) => ({
              ...a,
              data: a.data instanceof Blob ? await blobToDataUrl(a.data) : a.data,
            })),
          )
        : rows;
  }
  return makeBackup(tables as Partial<Backup['tables']>, DB_VERSION);
}

export async function restoreBackup(
  backup: Backup,
  mode: 'replace' | 'merge',
  db: FilaTrackDB = getDb(),
): Promise<void> {
  await db.transaction(
    'rw',
    TABLE_NAMES.map((t) => db.table(t)),
    async () => {
      for (const t of TABLE_NAMES) {
        const table = db.table(t);
        if (mode === 'replace') await table.clear();
        const rows = backup.tables[t] as unknown[];
        if (rows.length) await table.bulkPut(rows);
      }
    },
  );
  await ensureSeed(db);
}

export async function markBackupDone(db: FilaTrackDB = getDb()) {
  await saveSettings({ lastBackupAt: nowIso() }, db);
}

/** Efface toutes les données de la base courante (le catalogue est recréé). */
export async function clearAllData(db: FilaTrackDB = getDb()): Promise<void> {
  await db.transaction(
    'rw',
    TABLE_NAMES.map((t) => db.table(t)),
    async () => {
      for (const t of TABLE_NAMES) await db.table(t).clear();
    },
  );
  await ensureSeed(db);
}
