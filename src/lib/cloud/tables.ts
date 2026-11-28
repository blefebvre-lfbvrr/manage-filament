/**
 * Synchronisation « toutes les données » : une table = un fichier `data/<table>.json` dans le dépôt privé.
 * Fusion enregistrement par enregistrement : le plus récent gagne (updatedAt), les suppressions
 * sont des marques `deletedAt` (jamais d'effacement physique), donc rien ne réapparaît ni ne se perd.
 */
export const SYNC_TABLES = [
  'brands',
  'products',
  'colors',
  'locations',
  'purchases',
  'spools',
  'movements',
  'weighings',
  'prints',
  'customFieldDefs',
  'savedViews',
  'alertRules',
  'shoppingItems',
  'bambuTasks',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const tablePath = (t: SyncTable) => `data/${t}.json`;

type Rec = { id: string } & Record<string, unknown>;

/** Date de dernière modification d'un enregistrement (les tâches Bambu n'ont pas d'updatedAt). */
export function stamp(r: Rec): string {
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  if (s('state') === 'validated') return `~${s('decidedAt')}`; // une validation l'emporte toujours
  return s('updatedAt') || s('decidedAt') || s('receivedAt') || s('createdAt');
}

export interface TableMerge<T extends Rec> {
  merged: T[];
  /** Enregistrements distants plus récents, à écrire localement. */
  toLocal: T[];
  /** Le fichier distant doit être réécrit. */
  pushNeeded: boolean;
}

export function mergeTable<T extends Rec>(local: T[], remote: T[] | null): TableMerge<T> {
  const byId = new Map<string, T>();
  const toLocal: T[] = [];
  for (const r of local) byId.set(r.id, r);
  let pushNeeded = remote === null;
  const remoteIds = new Set<string>();
  for (const r of remote ?? []) {
    remoteIds.add(r.id);
    const l = byId.get(r.id);
    if (!l) {
      byId.set(r.id, r);
      toLocal.push(r);
      continue;
    }
    const a = stamp(l);
    const b = stamp(r);
    if (b > a) {
      byId.set(r.id, r);
      toLocal.push(r);
    } else if (a > b) pushNeeded = true;
    // Même date : considérés identiques (ordre des clés et valeurs par défaut peuvent différer).
  }
  if (local.some((l) => !remoteIds.has(l.id))) pushNeeded = true;
  const merged = [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { merged, toLocal, pushNeeded };
}

export function serializeTable(table: SyncTable, records: Rec[], now: string): string {
  // Une ligne par enregistrement : fichier compact mais différences lisibles dans l'historique git.
  const rows = records.map((r) => JSON.stringify(r)).join(',\n');
  return `{"app":"filatrack","table":"${table}","updatedAt":"${now}","records":[\n${rows}\n]}\n`;
}

export function parseTable(text: string): Rec[] {
  const j = JSON.parse(text) as { app?: string; records?: unknown };
  if (j.app !== 'filatrack' || !Array.isArray(j.records)) throw new Error('fichier de table invalide');
  return j.records.filter((r): r is Rec => Boolean(r && typeof (r as Rec).id === 'string'));
}
