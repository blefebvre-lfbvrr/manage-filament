/**
 * Construction du plan d'import : transforme les lignes Excel en bobines, impressions,
 * projets… sans rien écrire. Le plan est ensuite appliqué en une transaction.
 */
import { findBrand, findColor, findProduct, extractManufacturerRef } from '../catalog';
import { codePrefix, nextCode } from '../codes';
import { normalizeHex } from '../color';
import { newId } from '../ids';
import { makeProject } from '../project-factory';
import { roundG } from '../movements';
import type {
  AmsSlot,
  AppSettings,
  CatalogBrand,
  CatalogColor,
  CatalogProduct,
  CustomFieldDef,
  FilamentUsage,
  PrintJob,
  PrintStatus,
  Project,
  Spool,
  SpoolStatus,
} from '../schemas';
import { materialFromProductLine } from '../spool';
import { looseKey, normalizeText } from '../text';
import {
  customFieldKey,
  FIELDS,
  type ColumnTarget,
  type FieldDef,
  type ImportKind,
  type SheetTable,
} from './mapping';
import type { SheetData } from './read';
import { isBlank, parseBool, parseDate, parseNumber, parseString } from './values';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface ImportIssue {
  level: IssueLevel;
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export type DuplicateStrategy = 'skip' | 'update' | 'create';

export interface PlannedSpool {
  spool: Spool;
  priorConsumedG: number;
  sourceRow: number;
  /** Bobine existante identique (même ID d'origine ou même code). */
  duplicateOfId?: string;
  action: 'create' | 'update' | 'skip';
}

export interface PlannedPrint {
  print: PrintJob;
  sourceRow: number;
  duplicateOfId?: string;
  action: 'create' | 'update' | 'skip';
}

export interface Reconciliation {
  code: string;
  sourceRow: number;
  excelRemainingG: number;
  computedRemainingG: number;
  diffG: number;
}

export interface ImportPlan {
  spools: PlannedSpool[];
  prints: PlannedPrint[];
  projects: Project[];
  products: CatalogProduct[];
  locations: string[];
  customFieldDefs: CustomFieldDef[];
  settings: Partial<Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG' | 'nextPrintG'>>;
  issues: ImportIssue[];
  reconciliation: Reconciliation[];
  stats: {
    spoolRows: number;
    emptySpoolRows: number;
    printRows: number;
    plannedPrints: number;
    deductedG: number;
  };
}

export interface TableInput {
  sheetName: string;
  table: SheetTable;
  targets: ColumnTarget[];
}

export interface ExistingData {
  spools: Spool[];
  prints: PrintJob[];
  projects: Project[];
  brands: CatalogBrand[];
  products: CatalogProduct[];
  colors: CatalogColor[];
  customFieldDefs: CustomFieldDef[];
  locations: string[];
}

export interface PlanOptions {
  keepLegacyCodes: boolean;
  duplicateStrategy: DuplicateStrategy;
  now: string;
}

export interface PlanInput {
  spools?: TableInput;
  prints?: TableInput;
  listSheets?: SheetData[];
  ignoredSheets?: { name: string; reason: string }[];
  settings?: ImportPlan['settings'];
  existing: ExistingData;
  options: PlanOptions;
}

/* ------------------------------------------------------------------ */

class RowReader {
  private fieldIndex = new Map<string, number>();
  private checkIndex = new Map<string, number>();
  readonly customCols: number[] = [];
  private defs: Map<string, FieldDef>;

  constructor(
    private input: TableInput,
    kind: ImportKind,
  ) {
    this.defs = new Map(FIELDS[kind].map((f) => [f.key, f]));
    input.targets.forEach((t, i) => {
      if (t.startsWith('field:')) this.fieldIndex.set(t.slice(6), i);
      else if (t.startsWith('check:')) this.checkIndex.set(t.slice(6), i);
      else if (t === 'custom') this.customCols.push(i);
    });
  }

  has(key: string) {
    return this.fieldIndex.has(key);
  }
  hasCheck(key: string) {
    return this.checkIndex.has(key);
  }
  header(i: number) {
    return this.input.table.headers[i] ?? `Colonne ${i + 1}`;
  }
  raw(cells: unknown[], key: string, includeCheck = false): unknown {
    const i = this.fieldIndex.get(key) ?? (includeCheck ? this.checkIndex.get(key) : undefined);
    return i === undefined ? null : cells[i];
  }
  check(cells: unknown[], key: string): unknown {
    const i = this.checkIndex.get(key);
    return i === undefined ? null : cells[i];
  }
  columnLabel(key: string) {
    const i = this.fieldIndex.get(key) ?? this.checkIndex.get(key);
    return i === undefined ? this.defs.get(key)?.label : this.header(i);
  }
  /** Vrai si aucune colonne saisie (hors identifiants) n'a de valeur. */
  isEmpty(cells: unknown[], idKeys: string[]): boolean {
    for (const [key, i] of this.fieldIndex) {
      if (idKeys.includes(key)) continue;
      if (!isBlank(cells[i])) return false;
    }
    return this.customCols.every((i) => isBlank(cells[i]));
  }
}

function num(
  reader: RowReader,
  cells: unknown[],
  key: string,
  ctx: { issues: ImportIssue[]; sheet: string; row: number },
  includeCheck = false,
): number | null {
  const p = parseNumber(reader.raw(cells, key, includeCheck));
  if (!p.ok) {
    ctx.issues.push({
      level: 'error',
      sheet: ctx.sheet,
      row: ctx.row,
      column: reader.columnLabel(key),
      message: p.error,
    });
    return null;
  }
  return p.value;
}

function date(
  reader: RowReader,
  cells: unknown[],
  key: string,
  ctx: { issues: ImportIssue[]; sheet: string; row: number },
): string | null {
  const p = parseDate(reader.raw(cells, key));
  if (!p.ok) {
    ctx.issues.push({
      level: 'warning',
      sheet: ctx.sheet,
      row: ctx.row,
      column: reader.columnLabel(key),
      message: `${p.error} — ignorée`,
    });
    return null;
  }
  return p.value;
}

function customValue(v: unknown): unknown {
  if (v instanceof Date) {
    const p = parseDate(v);
    return p.ok ? p.value : String(v);
  }
  return v;
}

function inferCustomType(values: unknown[]): CustomFieldDef['type'] {
  const filled = values.filter((v) => !isBlank(v));
  if (!filled.length) return 'text';
  if (filled.every((v) => typeof v === 'number')) return 'number';
  if (filled.every((v) => v instanceof Date)) return 'date';
  if (filled.every((v) => typeof v === 'boolean')) return 'checkbox';
  return 'text';
}

interface LocationInfo {
  status: SpoolStatus | null;
  amsSlot: AmsSlot | null;
  location: string | null;
}

/** Interprète la colonne « Emplacement » de l'Excel, qui mélange slot AMS, rangement et statut. */
export function parseLocation(raw: unknown): LocationInfo {
  const s = parseString(raw);
  if (!s) return { status: null, amsSlot: null, location: null };
  const n = normalizeText(s);
  const ams = /^ams(?: lite)?\s*(?:slot\s*)?([1-4])$/.exec(n);
  if (ams) return { status: 'ams', amsSlot: Number(ams[1]) as AmsSlot, location: null };
  if (/support externe|bobine externe|external/.test(n))
    return { status: 'external', amsSlot: null, location: null };
  if (/^(terminee|vide|finie|epuisee)$/.test(n)) return { status: 'empty', amsSlot: null, location: null };
  if (/^archivee?$/.test(n)) return { status: 'archived', amsSlot: null, location: null };
  return { status: null, amsSlot: null, location: s };
}

export function parseSpoolStatus(raw: unknown): SpoolStatus | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (/scellee|neuve|sealed|new/.test(n)) return 'sealed';
  if (/ouverte|entamee|opened|open/.test(n)) return 'opened';
  if (/ams/.test(n)) return 'ams';
  if (/externe/.test(n)) return 'external';
  if (/archiv/.test(n)) return 'archived';
  if (/^(vide|terminee|empty)$/.test(n)) return 'empty';
  return null;
}

export function parsePrintResult(raw: unknown): PrintStatus | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (/reussi|ok|succes|success|termine/.test(n)) return 'success';
  if (/rate|echec|fail/.test(n)) return 'failed';
  if (/annul|cancel/.test(n)) return 'cancelled';
  if (/planifi|a imprimer|prevu|todo|attente/.test(n)) return 'planned';
  return null;
}

const NEEDS_WEIGHING_RE = /estimation|estime|a confirmer|a peser|pesee|environ/;
const REFILL_RE = /recharge|refill/;

/* ------------------------------------------------------------------ */

export function buildImportPlan(input: PlanInput): ImportPlan {
  const { existing, options } = input;
  const issues: ImportIssue[] = [];
  const plan: ImportPlan = {
    spools: [],
    prints: [],
    projects: [],
    products: [],
    locations: [],
    customFieldDefs: [],
    settings: input.settings ?? {},
    issues,
    reconciliation: [],
    stats: { spoolRows: 0, emptySpoolRows: 0, printRows: 0, plannedPrints: 0, deductedG: 0 },
  };
  const existingCustomKeys = new Set(existing.customFieldDefs.map((d) => `${d.entity}:${d.key}`));
  const now = options.now;
  const stamp = { createdAt: now, updatedAt: now, deletedAt: null };

  const addCustomDefs = (t: TableInput, entity: 'spool' | 'print', reader: RowReader) => {
    reader.customCols.forEach((col, order) => {
      const header = reader.header(col);
      const key = customFieldKey(header);
      if (existingCustomKeys.has(`${entity}:${key}`)) return;
      existingCustomKeys.add(`${entity}:${key}`);
      plan.customFieldDefs.push({
        ...stamp,
        id: newId(),
        entity,
        key,
        label: header,
        type: inferCustomType(t.table.records.map((r) => r.cells[col])),
        options: [],
        order: 100 + order,
      });
      issues.push({
        level: 'info',
        sheet: t.sheetName,
        column: header,
        message: `Colonne non prévue : importée comme champ personnalisé « ${header} ».`,
      });
    });
  };

  for (const s of input.ignoredSheets ?? []) issues.push({ level: 'info', sheet: s.name, message: s.reason });

  /* --------------------------- Bobines --------------------------- */
  const legacyToSpoolId = new Map<string, string>();
  // Les codes des bobines supprimées restent réservés (index unique en base).
  const codesInUse = new Set(existing.spools.map((s) => s.code));
  const pendingCodes: PlannedSpool[] = [];
  const excelRemaining = new Map<PlannedSpool, number>();
  const excelPrintCount = new Map<PlannedSpool, number>();

  if (input.spools) {
    const t = input.spools;
    const reader = new RowReader(t, 'spools');
    addCustomDefs(t, 'spool', reader);
    const seenLegacy = new Map<string, number>();

    for (const rec of t.table.records) {
      const cells = rec.cells;
      const ctx = { issues, sheet: t.sheetName, row: rec.rowNumber };
      if (cells.every(isBlank)) continue;
      if (reader.isEmpty(cells, ['legacyId', 'code'])) {
        plan.stats.emptySpoolRows++;
        continue;
      }
      plan.stats.spoolRows++;
      const errorsBefore = issues.filter((i) => i.level === 'error').length;

      const legacyId = parseString(reader.raw(cells, 'legacyId'));
      if (legacyId) {
        const prev = seenLegacy.get(legacyId);
        if (prev !== undefined) {
          issues.push({
            level: 'error',
            ...ctx,
            column: reader.columnLabel('legacyId'),
            message: `ID « ${legacyId} » déjà utilisé ligne ${prev} : ligne ignorée.`,
          });
          continue;
        }
        seenLegacy.set(legacyId, rec.rowNumber);
      }

      const productLine = parseString(reader.raw(cells, 'productLine')) ?? '';
      const brandName = parseString(reader.raw(cells, 'brand')) ?? '';
      const brand = brandName ? findBrand(brandName, existing.brands) : undefined;
      const product = productLine ? findProduct(productLine, existing.products, brand?.id) : undefined;
      let material =
        parseString(reader.raw(cells, 'material')) ??
        product?.material ??
        materialFromProductLine(productLine);
      if (material === 'ABS/ASA') {
        issues.push({
          level: 'warning',
          ...ctx,
          column: reader.columnLabel('productLine'),
          message: `« ${productLine} » est ambigu : matériau noté ABS/ASA, à préciser.`,
        });
      }
      if (!productLine && !material) {
        issues.push({ level: 'warning', ...ctx, message: 'Matière non renseignée.' });
        material = '';
      }
      if (!brandName) issues.push({ level: 'info', ...ctx, message: 'Marque non renseignée.' });

      const notes = parseString(reader.raw(cells, 'notes'));
      const manufacturerRef =
        parseString(reader.raw(cells, 'manufacturerRef')) ?? extractManufacturerRef(notes);
      const colorName = parseString(reader.raw(cells, 'colorName')) ?? '';
      const color = findColor(existing.colors, {
        productId: product?.id,
        name: colorName,
        ref: manufacturerRef,
      });
      const hexRaw = parseString(reader.raw(cells, 'colorHex'));
      const colorHex = normalizeHex(hexRaw) ?? color?.hex ?? null;
      if (hexRaw && !normalizeHex(hexRaw))
        issues.push({
          level: 'warning',
          ...ctx,
          column: reader.columnLabel('colorHex'),
          message: `Code couleur « ${hexRaw} » invalide.`,
        });
      if (colorName && !color && !hexRaw)
        issues.push({
          level: 'info',
          ...ctx,
          message: `Couleur « ${colorName} » absente du catalogue : pas d’aperçu couleur.`,
        });

      let initialNetG = num(reader, cells, 'initialNetG', ctx);
      if (initialNetG === null) {
        initialNetG = product?.netWeightG ?? 1000;
        issues.push({
          level: 'warning',
          ...ctx,
          column: reader.columnLabel('initialNetG'),
          message: `Poids net initial manquant : ${initialNetG} g supposés.`,
        });
      }
      let priorConsumedG = num(reader, cells, 'priorConsumedG', ctx) ?? 0;
      const remainingInput = reader.has('remainingG') ? num(reader, cells, 'remainingG', ctx) : null;
      if (remainingInput !== null && !reader.has('priorConsumedG'))
        priorConsumedG = roundG(initialNetG - remainingInput);
      const remainingCheck = parseNumber(reader.check(cells, 'remainingG'));
      const printCountCheck = parseNumber(reader.check(cells, 'printCount'));

      const loc = parseLocation(reader.raw(cells, 'location'));
      const statusInput = reader.has('status') ? parseSpoolStatus(reader.raw(cells, 'status')) : null;
      const refillRaw = parseBool(reader.raw(cells, 'isRefill'));
      const isRefill = (refillRaw.ok ? refillRaw.value : null) ?? REFILL_RE.test(normalizeText(notes));
      const rfidRaw = parseBool(reader.raw(cells, 'hasRfid'));
      const hasRfid = (rfidRaw.ok ? rfidRaw.value : null) ?? looseKey(brandName) === 'bambu lab';
      const tagsRaw = parseString(reader.raw(cells, 'tags'));

      if (issues.filter((i) => i.level === 'error').length > errorsBefore) {
        issues.push({ level: 'error', ...ctx, message: 'Ligne ignorée à cause des erreurs ci-dessus.' });
        continue;
      }

      const custom: Record<string, unknown> = {};
      for (const col of reader.customCols) {
        if (!isBlank(cells[col])) custom[customFieldKey(reader.header(col))] = customValue(cells[col]);
      }

      const spool: Spool = {
        ...stamp,
        id: newId(),
        code: parseString(reader.raw(cells, 'code')) ?? '',
        legacyId,
        brand: brand?.name ?? brandName,
        productLine: productLine || product?.name || '',
        material,
        catalogProductId: product?.id ?? null,
        catalogColorId: color?.id ?? null,
        colorName,
        colorHex,
        finish: parseString(reader.raw(cells, 'finish')) ?? product?.finish ?? null,
        manufacturerRef,
        diameterMm: num(reader, cells, 'diameterMm', ctx) ?? product?.diameterMm ?? 1.75,
        initialNetG,
        tareG: num(reader, cells, 'tareG', ctx) ?? product?.tareG ?? brand?.defaultTareG ?? null,
        remainingG: roundG(initialNetG - priorConsumedG),
        isRefill,
        hasRfid,
        price: num(reader, cells, 'price', ctx),
        shippingShare: num(reader, cells, 'shippingShare', ctx),
        shop: parseString(reader.raw(cells, 'shop')),
        purchaseDate: date(reader, cells, 'purchaseDate', ctx),
        orderNo: parseString(reader.raw(cells, 'orderNo')),
        lot: parseString(reader.raw(cells, 'lot')),
        purchaseId: null,
        status: loc.status ?? statusInput ?? 'sealed',
        amsSlot: loc.amsSlot,
        location: loc.location,
        openedAt: date(reader, cells, 'openedAt', ctx),
        lastDriedAt: date(reader, cells, 'lastDriedAt', ctx),
        humidityNote: null,
        settings: product
          ? {
              nozzleTempMin: product.nozzleTempMin,
              nozzleTempMax: product.nozzleTempMax,
              bedTemp: product.bedTemp,
              speed: null,
              notes: null,
            }
          : null,
        lowThresholdG: null,
        criticalThresholdG: null,
        needsWeighing: NEEDS_WEIGHING_RE.test(normalizeText(notes)),
        tags: tagsRaw
          ? tagsRaw
              .split(/[,;]/)
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
        notes,
        photoIds: [],
        custom,
      };
      const explicitStatus = Boolean(loc.status ?? statusInput);
      if (!explicitStatus && priorConsumedG > 0) spool.status = 'opened';
      (spool as Spool & { _explicitStatus?: boolean })._explicitStatus = explicitStatus;

      const dup = existing.spools.find(
        (s) =>
          !s.deletedAt && ((legacyId && s.legacyId === legacyId) || (spool.code && s.code === spool.code)),
      );
      const planned: PlannedSpool = {
        spool,
        priorConsumedG,
        sourceRow: rec.rowNumber,
        duplicateOfId: dup?.id,
        action: dup ? options.duplicateStrategy : 'create',
      };
      if (dup) {
        issues.push({
          level: 'warning',
          ...ctx,
          message: `Doublon de la bobine existante ${dup.code} : ${options.duplicateStrategy === 'skip' ? 'ignorée' : options.duplicateStrategy === 'update' ? 'fiche mise à jour (stock inchangé)' : 'créée en double'}.`,
        });
        if (planned.action !== 'create') {
          spool.id = dup.id;
          spool.code = dup.code;
          spool.createdAt = dup.createdAt;
        }
      }
      if (remainingCheck.ok && remainingCheck.value !== null)
        excelRemaining.set(planned, remainingCheck.value);
      if (printCountCheck.ok && printCountCheck.value !== null)
        excelPrintCount.set(planned, printCountCheck.value);
      if (legacyId) legacyToSpoolId.set(legacyId, spool.id);
      plan.spools.push(planned);
      if (planned.action === 'create') pendingCodes.push(planned);
    }

    // Codes courts : ID d'origine conservé si demandé et libre, sinon code généré par matériau.
    for (const p of pendingCodes) {
      const s = p.spool;
      let code = s.code || (options.keepLegacyCodes && s.legacyId ? s.legacyId : '');
      if (code && codesInUse.has(code)) {
        issues.push({
          level: 'warning',
          sheet: t.sheetName,
          row: p.sourceRow,
          message: `Code « ${code} » déjà pris : un nouveau code est généré.`,
        });
        code = '';
      }
      if (!code) code = nextCode(codePrefix(s.material), codesInUse);
      s.code = code;
      codesInUse.add(code);
      if (s.code) legacyToSpoolId.set(s.code, s.id);
    }
  }

  // Les impressions peuvent aussi référencer des bobines déjà en base.
  for (const s of existing.spools) {
    if (s.deletedAt) continue;
    if (s.legacyId && !legacyToSpoolId.has(s.legacyId)) legacyToSpoolId.set(s.legacyId, s.id);
    if (!legacyToSpoolId.has(s.code)) legacyToSpoolId.set(s.code, s.id);
  }

  /* --------------------------- Impressions --------------------------- */
  const projectByKey = new Map(
    existing.projects.filter((p) => !p.deletedAt).map((p) => [looseKey(p.name), p]),
  );
  const ensureProject = (name: string): Project => {
    const key = looseKey(name);
    let p = projectByKey.get(key);
    if (!p) {
      p = makeProject(name, { createdAt: stamp.createdAt, updatedAt: stamp.updatedAt });
      projectByKey.set(key, p);
      plan.projects.push(p);
    }
    return p;
  };
  const usageBySpool = new Map<string, { grams: number; count: number }>();

  if (input.prints) {
    const t = input.prints;
    const reader = new RowReader(t, 'prints');
    addCustomDefs(t, 'print', reader);
    if (!reader.has('name'))
      issues.push({
        level: 'error',
        sheet: t.sheetName,
        message: 'Aucune colonne « nom / pièce » : impossible d’importer les impressions.',
      });

    for (const rec of t.table.records) {
      if (!reader.has('name')) break;
      const cells = rec.cells;
      const ctx = { issues, sheet: t.sheetName, row: rec.rowNumber };
      if (cells.every(isBlank)) continue;
      const name = parseString(reader.raw(cells, 'name'));
      if (!name) {
        if (!reader.isEmpty(cells, []))
          issues.push({ level: 'warning', ...ctx, message: 'Ligne sans nom de pièce : ignorée.' });
        continue;
      }
      plan.stats.printRows++;
      const errorsBefore = issues.filter((i) => i.level === 'error').length;

      const resolveSpool = (key: 'spool' | 'relaySpool'): { id: string | null; ref: string | null } => {
        const ref = parseString(reader.raw(cells, key));
        if (!ref) return { id: null, ref: null };
        const id = legacyToSpoolId.get(ref) ?? null;
        if (!id)
          issues.push({
            level: 'warning',
            ...ctx,
            column: reader.columnLabel(key),
            message: `Bobine « ${ref} » introuvable : consommation non déduite.`,
          });
        return { id, ref };
      };
      const main = resolveSpool('spool');
      const relay = resolveSpool('relaySpool');
      const totalG = num(reader, cells, 'totalG', ctx);
      const onSpool = num(reader, cells, 'onSpoolG', ctx, true);
      const onRelay = num(reader, cells, 'onRelayG', ctx, true);
      const resultRaw = parseString(reader.raw(cells, 'result'));
      let status = parsePrintResult(resultRaw);
      if (resultRaw && !status)
        issues.push({
          level: 'warning',
          ...ctx,
          column: reader.columnLabel('result'),
          message: `Résultat « ${resultRaw} » inconnu.`,
        });
      const durH = num(reader, cells, 'durationH', ctx);
      const durMin = num(reader, cells, 'durationMin', ctx);
      const failedAt = num(reader, cells, 'failedAtPercent', ctx);
      if (issues.filter((i) => i.level === 'error').length > errorsBefore) {
        issues.push({ level: 'error', ...ctx, message: 'Ligne ignorée à cause des erreurs ci-dessus.' });
        continue;
      }

      const hasSpool = Boolean(main.ref || relay.ref);
      let needsReview = false;
      const reviewNotes: string[] = [];
      if (!status) {
        if (hasSpool) {
          status = 'success';
          needsReview = true;
          reviewNotes.push('Résultat vide mais bobine renseignée : considérée comme réussie, à vérifier.');
        } else status = 'planned';
      }

      const usages: FilamentUsage[] = [];
      if (status !== 'planned') {
        if (main.ref) {
          const mainG = onSpool ?? (relay.ref ? null : totalG);
          let relayG = onRelay;
          let mainGrams = mainG;
          if (relay.ref && mainGrams === null && relayG === null) {
            mainGrams = totalG;
            relayG = 0;
            issues.push({
              level: 'warning',
              ...ctx,
              message: 'Répartition bobine/relais inconnue : tout est compté sur la bobine principale.',
            });
          }
          if (relay.ref && relayG === null && totalG !== null && mainGrams !== null)
            relayG = roundG(totalG - mainGrams);
          usages.push({ spoolId: main.id, grams: Math.max(0, mainGrams ?? 0), role: 'main' });
          if (relay.ref) usages.push({ spoolId: relay.id, grams: Math.max(0, relayG ?? 0), role: 'relay' });
        } else if (totalG) {
          usages.push({ spoolId: null, grams: totalG, role: 'main' });
          needsReview = true;
          reviewNotes.push('Aucune bobine indiquée : consommation non déduite.');
        } else if (!hasSpool) {
          needsReview = true;
          reviewNotes.push('Ni bobine ni poids : rien n’a été déduit.');
        }
        if (totalG === null && hasSpool) {
          needsReview = true;
          reviewNotes.push('Poids manquant.');
        }
      } else plan.stats.plannedPrints++;

      if (needsReview)
        issues.push({ level: 'warning', ...ctx, message: `« ${name} » : ${reviewNotes.join(' ')}` });

      const projectName = parseString(reader.raw(cells, 'project'));
      const project = projectName ? ensureProject(projectName) : null;
      const custom: Record<string, unknown> = {};
      for (const col of reader.customCols) {
        if (!isBlank(cells[col])) custom[customFieldKey(reader.header(col))] = customValue(cells[col]);
      }

      const print: PrintJob = {
        ...stamp,
        id: newId(),
        name,
        date: date(reader, cells, 'date', ctx),
        durationMin: durMin ?? (durH !== null ? Math.round(durH * 60) : null),
        projectId: project?.id ?? null,
        plate: parseString(reader.raw(cells, 'plate')),
        status,
        failedAtPercent: failedAt,
        estimatedG: totalG,
        usages: usages.map((u) => ({ ...u, grams: roundG(u.grams) })),
        energyKwh: null,
        sourceFileId: null,
        photoIds: [],
        notes: parseString(reader.raw(cells, 'notes')),
        legacyRow: rec.rowNumber,
        needsReview,
        reviewNote: reviewNotes.join(' ') || null,
        custom,
      };

      const dup = existing.prints.find(
        (p) =>
          !p.deletedAt &&
          looseKey(p.name) === looseKey(name) &&
          (p.projectId ?? null) === (project?.id ?? null) &&
          (p.legacyRow === rec.rowNumber || (p.estimatedG ?? null) === totalG),
      );
      const planned: PlannedPrint = {
        print,
        sourceRow: rec.rowNumber,
        duplicateOfId: dup?.id,
        action: dup ? options.duplicateStrategy : 'create',
      };
      if (dup) {
        issues.push({
          level: 'warning',
          ...ctx,
          message: `Impression déjà présente (« ${dup.name} ») : ${options.duplicateStrategy === 'skip' ? 'ignorée' : options.duplicateStrategy === 'update' ? 'fiche mise à jour (déductions inchangées)' : 'créée en double'}.`,
        });
        if (planned.action !== 'create') {
          print.id = dup.id;
          print.createdAt = dup.createdAt;
          if (planned.action === 'update') print.usages = dup.usages;
        }
      }
      if (planned.action === 'create') {
        for (const u of print.usages) {
          if (!u.spoolId) continue;
          const acc = usageBySpool.get(u.spoolId) ?? { grams: 0, count: 0 };
          acc.grams = roundG(acc.grams + u.grams);
          acc.count++;
          usageBySpool.set(u.spoolId, acc);
          plan.stats.deductedG = roundG(plan.stats.deductedG + u.grams);
        }
      }
      plan.prints.push(planned);
    }
  }

  /* ---------------- Restants, statuts et rapprochement ---------------- */
  for (const p of plan.spools) {
    const s = p.spool as Spool & { _explicitStatus?: boolean };
    const explicit = s._explicitStatus;
    delete s._explicitStatus;
    if (p.action !== 'create') continue;
    const used = usageBySpool.get(s.id);
    s.remainingG = roundG(s.initialNetG - p.priorConsumedG - (used?.grams ?? 0));
    if (!explicit && (used?.count ?? 0) > 0 && s.status === 'sealed') s.status = 'opened';
    if (s.remainingG < 0) {
      s.needsWeighing = true;
      issues.push({
        level: 'warning',
        sheet: input.spools?.sheetName ?? '',
        row: p.sourceRow,
        message: `${s.code} : restant négatif (${s.remainingG} g) — plus consommé que le poids net. Une pesée est recommandée.`,
      });
    }
    const xl = excelRemaining.get(p);
    if (xl !== undefined) {
      const diff = roundG(s.remainingG - xl);
      plan.reconciliation.push({
        code: s.code,
        sourceRow: p.sourceRow,
        excelRemainingG: roundG(xl),
        computedRemainingG: s.remainingG,
        diffG: diff,
      });
      if (Math.abs(diff) > 0.1) {
        issues.push({
          level: 'warning',
          sheet: input.spools?.sheetName ?? '',
          row: p.sourceRow,
          message: `${s.code} : restant recalculé ${s.remainingG} g ≠ ${roundG(xl)} g dans l’Excel (écart ${diff} g).`,
        });
      }
    }
    const xlCount = excelPrintCount.get(p);
    if (xlCount !== undefined && xlCount !== (used?.count ?? 0)) {
      issues.push({
        level: 'info',
        sheet: input.spools?.sheetName ?? '',
        row: p.sourceRow,
        message: `${s.code} : ${used?.count ?? 0} utilisation(s) importée(s), ${xlCount} dans l’Excel.`,
      });
    }
  }

  // Deux bobines dans le même slot AMS.
  const slots = new Map<number, PlannedSpool>();
  for (const p of plan.spools) {
    if (p.action === 'skip' || p.spool.status !== 'ams' || !p.spool.amsSlot) continue;
    const other = slots.get(p.spool.amsSlot) ?? null;
    const taken =
      other ??
      existing.spools.find(
        (s) => !s.deletedAt && s.status === 'ams' && s.amsSlot === p.spool.amsSlot && s.id !== p.spool.id,
      );
    if (taken) {
      issues.push({
        level: 'warning',
        sheet: input.spools?.sheetName ?? '',
        row: p.sourceRow,
        message: `Slot AMS ${p.spool.amsSlot} déjà occupé : ${p.spool.code} passe en « Ouverte ».`,
      });
      p.spool.status = 'opened';
      p.spool.amsSlot = null;
    } else slots.set(p.spool.amsSlot, p);
  }

  /* --------------------------- Listes --------------------------- */
  harvestLists(input, plan, existing, stamp, ensureProject);

  return plan;
}

const RESULT_WORDS = ['reussie', 'ratee', 'annulee', 'planifiee'];

function harvestLists(
  input: PlanInput,
  plan: ImportPlan,
  existing: ExistingData,
  stamp: { createdAt: string; updatedAt: string; deletedAt: null },
  ensureProject: (name: string) => Project,
) {
  const spoolIds = new Set(
    plan.spools.flatMap((p) => [p.spool.legacyId, p.spool.code].filter(Boolean) as string[]),
  );
  const projectKeys = new Set([
    ...existing.projects.map((p) => looseKey(p.name)),
    ...plan.projects.map((p) => looseKey(p.name)),
  ]);
  const knownLocations = new Set(existing.locations.map(looseKey));
  const dominantBrand = mostCommon(plan.spools.map((p) => p.spool.brand).filter(Boolean)) ?? 'Bambu Lab';
  const brand = findBrand(dominantBrand, existing.brands);

  for (const p of plan.spools) {
    const l = p.spool.location;
    if (l && !knownLocations.has(looseKey(l))) {
      knownLocations.add(looseKey(l));
      plan.locations.push(l);
    }
  }

  for (const sheet of input.listSheets ?? []) {
    const width = Math.max(0, ...sheet.rows.map((r) => r.length));
    for (let c = 0; c < width; c++) {
      const values = sheet.rows.map((r) => parseString(r[c])).filter((v): v is string => Boolean(v));
      if (!values.length) continue;
      const keys = values.map(looseKey);
      const ratio = (pred: (k: string, v: string) => boolean) =>
        values.filter((v, i) => pred(keys[i]!, v)).length / values.length;

      if (ratio((k) => RESULT_WORDS.includes(k)) >= 0.6) continue;
      if (ratio((_k, v) => spoolIds.has(v) || /^[A-Z]{1,4}-?\d{1,3}$/.test(v)) >= 0.8) continue;
      if (ratio((_k, v) => parseLocation(v).status !== null || knownLocations.has(looseKey(v))) >= 0.5) {
        for (const v of values) {
          if (parseLocation(v).status === null && !knownLocations.has(looseKey(v))) {
            knownLocations.add(looseKey(v));
            plan.locations.push(v);
          }
        }
        continue;
      }
      if (ratio((k) => projectKeys.has(k)) > 0) {
        for (const v of values)
          if (!projectKeys.has(looseKey(v))) {
            projectKeys.add(looseKey(v));
            ensureProject(v);
          }
        continue;
      }
      const looksLikeMaterial = ratio((_k, v) => /pla|petg|abs|asa|tpu|pa|pc|support|nylon/i.test(v));
      if (looksLikeMaterial >= 0.6) {
        const created: string[] = [];
        for (const v of values) {
          if (findProduct(v, [...existing.products, ...plan.products])) continue;
          const material = materialFromProductLine(v);
          plan.products.push({
            ...stamp,
            id: newId(),
            brandId: brand?.id ?? existing.brands[0]?.id ?? 'brand-unknown',
            name: v,
            material,
            finish: null,
            diameterMm: 1.75,
            netWeightG: 1000,
            tareG: brand?.defaultTareG ?? null,
            defaultPrice: null,
            refillPrice: null,
            nozzleTempMin: null,
            nozzleTempMax: null,
            bedTemp: null,
            dryTempC: null,
            dryHours: null,
            hygroscopic: false,
            productUrl: null,
            notes: `Ajoutée depuis la liste « ${sheet.name} » de l’Excel.`,
          });
          created.push(v);
        }
        if (created.length)
          plan.issues.push({
            level: 'info',
            sheet: sheet.name,
            message: `Gammes ajoutées au catalogue : ${created.join(', ')}.`,
          });
        continue;
      }
      plan.issues.push({
        level: 'info',
        sheet: sheet.name,
        message: `Liste non reconnue (colonne ${c + 1}) : ${values.slice(0, 6).join(', ')}${values.length > 6 ? '…' : ''} — non importée.`,
      });
    }
  }
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
