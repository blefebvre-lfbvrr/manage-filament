/** Lecture d'un classeur (xlsx, xls, ods, csv) en tableaux bruts via SheetJS. */
import * as XLSX from 'xlsx';

export interface SheetData {
  name: string;
  hidden: boolean;
  /** Lignes brutes (valeurs en cache pour les cellules à formule). */
  rows: unknown[][];
  /** Cellules contenant une formule, au format "ligne:colonne" (index 0). */
  formulaCells: Set<string>;
}

export interface WorkbookData {
  fileName: string;
  sheets: SheetData[];
}

export function readWorkbook(data: ArrayBuffer | Uint8Array, fileName = 'classeur.xlsx'): WorkbookData {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: true, dense: false });
  const meta = wb.Workbook?.Sheets ?? [];
  const sheets: SheetData[] = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    if (!ws) return { name, hidden: false, rows: [], formulaCells: new Set<string>() };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const formulaCells = new Set<string>();
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith('!')) continue;
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (cell?.f) {
        const { r, c } = XLSX.utils.decode_cell(addr);
        formulaCells.add(`${r}:${c}`);
      }
    }
    return { name, hidden: Boolean(meta[i]?.Hidden), rows, formulaCells };
  });
  return { fileName, sheets };
}

/** Utilisé par les tests et les données de démo : construit un classeur xlsx en mémoire. */
export function buildWorkbook(sheets: { name: string; rows: unknown[][]; hidden?: boolean }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  wb.Workbook = { Sheets: sheets.map((s) => ({ Hidden: s.hidden ? 1 : 0 })) };
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
