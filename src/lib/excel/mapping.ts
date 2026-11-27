/** Correspondance des colonnes Excel → champs FilaTrack. */
import { looseKey, normalizeText } from '../text';
import type { SheetData } from './read';
import { isBlank } from './values';

export type ImportKind = 'spools' | 'prints';
export type FieldType = 'string' | 'number' | 'date' | 'bool';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  synonyms: string[];
  /** Colonne calculée dans l'Excel : utilisée seulement pour vérifier les valeurs recalculées. */
  computed?: boolean;
  /** Ce champ peut être saisi OU calculé selon le classeur (on regarde s'il contient des formules). */
  inputOrComputed?: boolean;
}

export const SPOOL_FIELDS: FieldDef[] = [
  {
    key: 'legacyId',
    label: 'ID d’origine',
    type: 'string',
    synonyms: ['id', 'n', 'no', 'numero', 'id bobine', 'ancien id'],
  },
  { key: 'code', label: 'Code court', type: 'string', synonyms: ['code', 'code court'] },
  { key: 'brand', label: 'Marque', type: 'string', synonyms: ['marque', 'brand', 'fabricant'] },
  {
    key: 'productLine',
    label: 'Gamme',
    type: 'string',
    synonyms: ['matiere', 'gamme', 'type', 'filament', 'produit'],
  },
  { key: 'material', label: 'Matériau', type: 'string', synonyms: ['materiau', 'material'] },
  { key: 'colorName', label: 'Couleur', type: 'string', synonyms: ['couleur', 'color', 'colour', 'coloris'] },
  {
    key: 'colorHex',
    label: 'Code couleur (hex)',
    type: 'string',
    synonyms: ['hex', 'code couleur', 'couleur hex', 'code hex'],
  },
  { key: 'finish', label: 'Finition', type: 'string', synonyms: ['finition', 'finish'] },
  {
    key: 'manufacturerRef',
    label: 'Référence fabricant',
    type: 'string',
    synonyms: ['reference', 'ref', 'ref fabricant', 'sku'],
  },
  {
    key: 'location',
    label: 'Emplacement',
    type: 'string',
    synonyms: ['emplacement', 'location', 'rangement', 'slot'],
  },
  {
    key: 'status',
    label: 'Statut',
    type: 'string',
    synonyms: ['statut', 'status', 'etat'],
    inputOrComputed: true,
  },
  {
    key: 'initialNetG',
    label: 'Poids net initial (g)',
    type: 'number',
    synonyms: [
      'poids net initial g',
      'poids net initial',
      'poids net g',
      'poids net',
      'poids initial',
      'net weight',
    ],
  },
  {
    key: 'priorConsumedG',
    label: 'Déjà consommé avant suivi (g)',
    type: 'number',
    synonyms: [
      'deja consomme avant suivi g',
      'deja consomme avant suivi',
      'deja consomme',
      'consomme avant suivi',
    ],
  },
  {
    key: 'remainingG',
    label: 'Restant (g)',
    type: 'number',
    synonyms: ['restant g', 'restant', 'poids restant', 'remaining'],
    inputOrComputed: true,
  },
  { key: 'tareG', label: 'Tare (g)', type: 'number', synonyms: ['tare g', 'tare', 'poids bobine vide'] },
  { key: 'diameterMm', label: 'Diamètre (mm)', type: 'number', synonyms: ['diametre mm', 'diametre'] },
  {
    key: 'price',
    label: 'Prix (€)',
    type: 'number',
    synonyms: ['prix bobine €', 'prix bobine', 'prix €', 'prix', 'prix d achat', 'price'],
  },
  {
    key: 'shippingShare',
    label: 'Frais de port (€)',
    type: 'number',
    synonyms: ['frais de port €', 'frais de port', 'port'],
  },
  { key: 'shop', label: 'Magasin', type: 'string', synonyms: ['magasin', 'boutique', 'shop', 'vendeur'] },
  {
    key: 'purchaseDate',
    label: 'Date d’achat',
    type: 'date',
    synonyms: ['date d achat', 'achete le', 'date achat'],
  },
  {
    key: 'orderNo',
    label: 'N° de commande',
    type: 'string',
    synonyms: ['n de commande', 'commande', 'numero de commande'],
  },
  { key: 'lot', label: 'Lot', type: 'string', synonyms: ['lot', 'batch'] },
  {
    key: 'openedAt',
    label: 'Ouverte le',
    type: 'date',
    synonyms: ['ouverte le', 'date d ouverture', 'ouverture'],
  },
  {
    key: 'lastDriedAt',
    label: 'Dernier séchage',
    type: 'date',
    synonyms: ['dernier sechage', 'seche le', 'sechage'],
  },
  { key: 'isRefill', label: 'Recharge', type: 'bool', synonyms: ['recharge', 'refill'] },
  { key: 'hasRfid', label: 'Puce RFID', type: 'bool', synonyms: ['rfid', 'puce rfid'] },
  { key: 'tags', label: 'Tags', type: 'string', synonyms: ['tags', 'etiquettes', 'mots cles'] },
  {
    key: 'notes',
    label: 'Notes',
    type: 'string',
    synonyms: ['notes', 'note', 'remarques', 'commentaire', 'commentaires'],
  },
  {
    key: 'percentRemaining',
    label: '% restant',
    type: 'number',
    synonyms: ['% restant', 'pourcentage restant'],
    computed: true,
  },
  {
    key: 'consumedSinceG',
    label: 'Consommé depuis suivi (g)',
    type: 'number',
    synonyms: ['consomme depuis suivi g', 'consomme depuis suivi'],
    computed: true,
  },
  {
    key: 'printCount',
    label: 'Nb impressions',
    type: 'number',
    synonyms: ['nb impressions', 'nombre d impressions'],
    computed: true,
  },
  {
    key: 'consumedCost',
    label: 'Coût consommé (€)',
    type: 'number',
    synonyms: ['cout consomme €', 'cout consomme'],
    computed: true,
  },
  {
    key: 'enoughForNext',
    label: 'Assez pour la prochaine ?',
    type: 'string',
    synonyms: ['assez pour la prochaine'],
    computed: true,
  },
  {
    key: 'costPerKg',
    label: 'Coût au kg',
    type: 'number',
    synonyms: ['cout au kg', 'cout kg', 'cout au gramme'],
    computed: true,
  },
];

export const PRINT_FIELDS: FieldDef[] = [
  { key: 'date', label: 'Date', type: 'date', synonyms: ['date', 'imprime le', 'date d impression'] },
  {
    key: 'name',
    label: 'Nom / pièce',
    type: 'string',
    synonyms: ['piece', 'nom', 'impression', 'objet', 'modele', 'name'],
  },
  { key: 'project', label: 'Projet', type: 'string', synonyms: ['projet', 'project'] },
  { key: 'plate', label: 'Plateau', type: 'string', synonyms: ['plateau', 'plate'] },
  {
    key: 'spool',
    label: 'Bobine',
    type: 'string',
    synonyms: ['bobine', 'spool', 'bobine principale', 'code bobine'],
  },
  {
    key: 'relaySpool',
    label: 'Bobine relais (auto-refill)',
    type: 'string',
    synonyms: ['relais auto refill', 'relais', 'bobine relais', 'auto refill'],
  },
  {
    key: 'totalG',
    label: 'Filament (g)',
    type: 'number',
    synonyms: ['filament g', 'filament', 'poids g', 'poids', 'grammes', 'consommation g'],
  },
  {
    key: 'durationH',
    label: 'Durée (h)',
    type: 'number',
    synonyms: ['duree h', 'duree', 'temps h', 'temps'],
  },
  { key: 'durationMin', label: 'Durée (min)', type: 'number', synonyms: ['duree min', 'minutes'] },
  { key: 'result', label: 'Résultat', type: 'string', synonyms: ['resultat', 'statut', 'status', 'result'] },
  {
    key: 'failedAtPercent',
    label: 'Ratée à (%)',
    type: 'number',
    synonyms: ['ratee a %', 'ratee a', 'echec a'],
  },
  { key: 'notes', label: 'Notes', type: 'string', synonyms: ['notes', 'note', 'remarques', 'commentaire'] },
  {
    key: 'onSpoolG',
    label: 'Sur bobine (g)',
    type: 'number',
    synonyms: ['sur bobine g', 'sur bobine'],
    inputOrComputed: true,
  },
  {
    key: 'onRelayG',
    label: 'Sur relais (g)',
    type: 'number',
    synonyms: ['sur relais g', 'sur relais'],
    inputOrComputed: true,
  },
  {
    key: 'cost',
    label: 'Coût (€)',
    type: 'number',
    synonyms: ['cout €', 'cout', 'cout matiere'],
    computed: true,
  },
  { key: 'state', label: 'État / bobine', type: 'string', synonyms: ['etat bobine', 'etat'], computed: true },
];

export const FIELDS: Record<ImportKind, FieldDef[]> = { spools: SPOOL_FIELDS, prints: PRINT_FIELDS };

/** Cible d'une colonne : `field:<clé>`, `check:<clé>` (valeur calculée à vérifier), `custom` ou `ignore`. */
export type ColumnTarget = `field:${string}` | `check:${string}` | 'custom' | 'ignore';

export function normalizeHeader(h: unknown): string {
  return looseKey(h);
}

const UNIT_SUFFIX = / (g|kg|h|min|€|eur|mm)$/;

export function matchField(header: unknown, kind: ImportKind): FieldDef | undefined {
  const key = normalizeHeader(header);
  if (!key) return undefined;
  const fields = FIELDS[kind];
  const exact = fields.find((f) => f.synonyms.includes(key));
  if (exact) return exact;
  const stripped = key.replace(UNIT_SUFFIX, '');
  return fields.find((f) => f.synonyms.includes(stripped));
}

export interface SheetTable {
  headerRowIndex: number;
  headers: string[];
  /** Lignes de données (après l'en-tête) avec leur numéro de ligne Excel (1-based). */
  records: { rowNumber: number; cells: unknown[] }[];
  /** Index de colonnes contenant au moins une formule. */
  formulaColumns: Set<number>;
}

/** Repère la ligne d'en-tête : celle qui contient le plus de libellés connus. */
export function detectHeaderRow(rows: unknown[][], maxScan = 30): number {
  let best = -1;
  let bestScore = 1;
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const row = rows[r] ?? [];
    let score = 0;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      if (matchField(cell, 'spools') || matchField(cell, 'prints')) score++;
    }
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

export function extractTable(
  sheet: SheetData,
  headerRowIndex = detectHeaderRow(sheet.rows),
): SheetTable | null {
  if (headerRowIndex < 0) return null;
  const headerRow = sheet.rows[headerRowIndex] ?? [];
  let lastCol = headerRow.length - 1;
  while (lastCol >= 0 && isBlank(headerRow[lastCol])) lastCol--;
  const headers = headerRow
    .slice(0, lastCol + 1)
    .map((h, i) => (isBlank(h) ? `Colonne ${i + 1}` : String(h).trim()));
  const records: SheetTable['records'] = [];
  for (let r = headerRowIndex + 1; r < sheet.rows.length; r++) {
    const cells = (sheet.rows[r] ?? []).slice(0, headers.length);
    while (cells.length < headers.length) cells.push(null);
    records.push({ rowNumber: r + 1, cells });
  }
  const formulaColumns = new Set<number>();
  for (const addr of sheet.formulaCells) {
    const [r, c] = addr.split(':').map(Number) as [number, number];
    if (r > headerRowIndex && c < headers.length) formulaColumns.add(c);
  }
  return { headerRowIndex, headers, records, formulaColumns };
}

export interface SheetClassification {
  kind: ImportKind | 'other';
  scores: Record<ImportKind, number>;
}

export function classifyHeaders(headers: string[]): SheetClassification {
  const score = (kind: ImportKind) =>
    headers.reduce((acc, h) => {
      const f = matchField(h, kind);
      return acc + (f ? (f.computed ? 0.5 : 1) : 0);
    }, 0);
  const scores = { spools: score('spools'), prints: score('prints') };
  // Indices forts : une colonne « Bobine » indique un journal d'impressions,
  // une colonne « Poids net » une liste de bobines.
  const keys = headers.map(normalizeHeader);
  if (keys.some((k) => k.startsWith('bobine'))) scores.prints += 2;
  if (keys.some((k) => k.startsWith('poids net'))) scores.spools += 2;
  let kind: SheetClassification['kind'] = 'other';
  if (Math.max(scores.spools, scores.prints) >= 3)
    kind = scores.spools >= scores.prints ? 'spools' : 'prints';
  return { kind, scores };
}

/** Correspondance automatique des colonnes. Les colonnes inconnues deviennent des champs personnalisés. */
export function autoMap(table: SheetTable, kind: ImportKind): ColumnTarget[] {
  const used = new Set<string>();
  return table.headers.map((h, i): ColumnTarget => {
    const f = matchField(h, kind);
    if (!f || used.has(f.key)) {
      const empty = table.records.every((r) => isBlank(r.cells[i]));
      return empty && !f ? 'ignore' : 'custom';
    }
    used.add(f.key);
    if (f.computed) return `check:${f.key}`;
    if (f.inputOrComputed && table.formulaColumns.has(i)) return `check:${f.key}`;
    return `field:${f.key}`;
  });
}

/** Signature d'un tableau, pour retrouver un mapping enregistré. */
export function tableSignature(kind: ImportKind, headers: string[]): string {
  return `${kind}|${headers.map(normalizeHeader).join('|')}`;
}

/** Applique un mapping enregistré (par en-tête) ; retombe sur la correspondance automatique sinon. */
export function applySavedMapping(
  table: SheetTable,
  kind: ImportKind,
  saved: Record<string, string> | undefined,
): ColumnTarget[] {
  const auto = autoMap(table, kind);
  if (!saved) return auto;
  return table.headers.map((h, i) => (saved[normalizeHeader(h)] as ColumnTarget | undefined) ?? auto[i]!);
}

export function mappingToRecord(headers: string[], targets: ColumnTarget[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    out[normalizeHeader(h)] = targets[i] ?? 'ignore';
  });
  return out;
}

export function customFieldKey(header: string): string {
  return `xl_${
    normalizeHeader(header)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'colonne'
  }`;
}

/** Bloc de paramètres au-dessus du tableau (ex. « Seuil « bientôt vide » (g) | 150 »). */
export function readSettingsBlock(
  rows: unknown[][],
  headerRowIndex: number,
): { lowThresholdG?: number; criticalThresholdG?: number; nextPrintG?: number } {
  const out: { lowThresholdG?: number; criticalThresholdG?: number; nextPrintG?: number } = {};
  for (let r = 0; r < Math.max(0, headerRowIndex); r++) {
    const row = rows[r] ?? [];
    const label = normalizeText(row[0]);
    const value = row[1];
    if (typeof value !== 'number') continue;
    if (/seuil.*bientot vide/.test(label)) out.lowThresholdG = value;
    else if (/seuil.*(a changer|critique)/.test(label)) out.criticalThresholdG = value;
    else if (/prochaine impression/.test(label)) out.nextPrintG = value;
  }
  return out;
}
