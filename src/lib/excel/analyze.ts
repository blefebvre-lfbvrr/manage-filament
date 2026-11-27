/** Analyse d'un classeur : repère les feuilles Bobines / Impressions / listes et propose un mapping. */
import {
  applySavedMapping,
  classifyHeaders,
  extractTable,
  readSettingsBlock,
  tableSignature,
  type ColumnTarget,
  type ImportKind,
  type SheetTable,
} from './mapping';
import type { PlanInput } from './plan';
import type { SheetData, WorkbookData } from './read';
import { isBlank } from './values';

export type SheetRole = ImportKind | 'lists' | 'ignore';

export interface SheetAnalysis {
  sheet: SheetData;
  role: SheetRole;
  table: SheetTable | null;
  targets: ColumnTarget[];
  signature: string | null;
  /** Le mapping vient d'un mapping enregistré. */
  fromSavedMapping: boolean;
  reason?: string;
}

export interface WorkbookAnalysis {
  fileName: string;
  sheets: SheetAnalysis[];
  settings: PlanInput['settings'];
}

export type SavedMappingLookup = (signature: string) => Record<string, string> | undefined;

function textOnly(sheet: SheetData): boolean {
  const cells = sheet.rows.flat().filter((c) => !isBlank(c));
  if (!cells.length) return true;
  const longText = cells.filter((c) => typeof c === 'string' && c.length > 60).length;
  return sheet.rows.every((r) => r.filter((c) => !isBlank(c)).length <= 1) || longText / cells.length > 0.3;
}

export function analyzeWorkbook(wb: WorkbookData, savedMapping?: SavedMappingLookup): WorkbookAnalysis {
  const settings: NonNullable<PlanInput['settings']> = {};
  const sheets: SheetAnalysis[] = wb.sheets.map((sheet) => {
    const table = extractTable(sheet);
    if (table) {
      const cls = classifyHeaders(table.headers);
      if (cls.kind !== 'other') {
        const signature = tableSignature(cls.kind, table.headers);
        const saved = savedMapping?.(signature);
        Object.assign(settings, readSettingsBlock(sheet.rows, table.headerRowIndex));
        return {
          sheet,
          role: cls.kind,
          table,
          targets: applySavedMapping(table, cls.kind, saved),
          signature,
          fromSavedMapping: Boolean(saved),
        };
      }
    }
    if (textOnly(sheet)) {
      return {
        sheet,
        role: 'ignore',
        table: null,
        targets: [],
        signature: null,
        fromSavedMapping: false,
        reason: 'Feuille de texte (mode d’emploi) : non importée.',
      };
    }
    return {
      sheet,
      role: 'lists',
      table: null,
      targets: [],
      signature: null,
      fromSavedMapping: false,
      reason: 'Listes de valeurs (projets, emplacements, gammes).',
    };
  });
  return { fileName: wb.fileName, sheets, settings };
}

/** Change le rôle d'une feuille (choix de l'utilisateur dans l'assistant). */
export function withRole(
  a: SheetAnalysis,
  role: SheetRole,
  savedMapping?: SavedMappingLookup,
): SheetAnalysis {
  if (role === 'spools' || role === 'prints') {
    const table = a.table ?? extractTable(a.sheet, 0);
    if (!table) return { ...a, role: 'ignore' };
    const signature = tableSignature(role, table.headers);
    const saved = savedMapping?.(signature);
    return {
      ...a,
      role,
      table,
      signature,
      targets: applySavedMapping(table, role, saved),
      fromSavedMapping: Boolean(saved),
    };
  }
  return { ...a, role };
}

export function planInputFromAnalysis(
  analysis: WorkbookAnalysis,
  base: Pick<PlanInput, 'existing' | 'options'>,
): PlanInput {
  const pick = (kind: ImportKind) => {
    const s = analysis.sheets.find((x) => x.role === kind && x.table);
    return s?.table ? { sheetName: s.sheet.name, table: s.table, targets: s.targets } : undefined;
  };
  return {
    ...base,
    spools: pick('spools'),
    prints: pick('prints'),
    listSheets: analysis.sheets.filter((s) => s.role === 'lists').map((s) => s.sheet),
    ignoredSheets: analysis.sheets
      .filter((s) => s.role === 'ignore')
      .map((s) => ({ name: s.sheet.name, reason: s.reason ?? 'Feuille ignorée.' })),
    settings: analysis.settings,
  };
}
