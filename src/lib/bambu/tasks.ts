/**
 * Historique des impressions du cloud Bambu Lab : schéma normalisé partagé entre
 * le script de synchro (/sync-bambu) et l'application.
 *
 * La réponse de /v1/user-service/my/tasks n'est pas documentée officiellement.
 * Les noms de champs viennent des projets de la communauté (ha-bambulab, OpenBambuAPI)
 * et sont lus de façon tolérante : un champ absent ne casse rien.
 */
import { z } from 'zod';
import { normalizeHex } from '../color';

export const BAMBU_TASK_STATUSES = ['success', 'failed', 'cancelled', 'running', 'unknown'] as const;

export const bambuFilamentSchema = z.object({
  /** Slot AMS 0 à 3 (null : bobine externe ou inconnu). */
  slot: z.number().int().nullable(),
  type: z.string().default(''),
  color: z.string().nullable(),
  filamentId: z.string().nullable(),
  grams: z.number().nonnegative(),
});
export type BambuFilament = z.infer<typeof bambuFilamentSchema>;

export const bambuTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(''),
  plateName: z.string().nullable().optional(),
  /** Nom du fichier .3mf, extrait du titre « <fichier>_<NN> - <plateau> ». */
  fileName: z.string().nullable().optional(),
  plateIndex: z.number().nullable().optional(),
  deviceName: z.string().nullable().optional(),
  deviceModel: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  durationS: z.number().nullable().optional(),
  status: z.enum(BAMBU_TASK_STATUSES),
  statusRaw: z.union([z.number(), z.string()]).nullable().optional(),
  weightG: z.number().nullable().optional(),
  lengthMm: z.number().nullable().optional(),
  filaments: z.array(bambuFilamentSchema).default([]),
});
export type BambuTask = z.infer<typeof bambuTaskSchema>;

export const bambuPrintsFileSchema = z.object({
  version: z.literal(1),
  /** Dernière écriture (nouvelle impression ou mise à jour). */
  updatedAt: z.string(),
  /** Dernière vérification par la synchro (rafraîchi au plus toutes les 6 h sans nouveauté). */
  checkedAt: z.string().optional(),
  tasks: z.array(bambuTaskSchema),
});
export type BambuPrintsFile = z.infer<typeof bambuPrintsFileSchema>;

type Raw = Record<string, unknown>;
const str = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Statut numérique du cloud : 2 = réussie (vérifié sur une vraie réponse) ; d'après la communauté,
 * À CONFIRMER : 1 en cours, 3 ratée, 4 annulée. Un statut texte est aussi accepté.
 */
export function mapStatus(raw: unknown): BambuTask['status'] {
  if (typeof raw === 'string') {
    const s = raw.toLowerCase();
    if (/success|finish|done|complete/.test(s)) return 'success';
    if (/fail|error/.test(s)) return 'failed';
    if (/cancel|stop|abort/.test(s)) return 'cancelled';
    if (/run|print|progress|pause/.test(s)) return 'running';
    return 'unknown';
  }
  switch (raw) {
    case 1:
      return 'running';
    case 2:
      return 'success';
    case 3:
      return 'failed';
    case 4:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function toIso(v: unknown): string | null {
  if (typeof v === 'number' && v > 0) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeFilament(raw: Raw): BambuFilament {
  // « ams » = index global du plateau AMS (0–3 pour l'AMS lite), cohérent avec amsMapping.
  // Les champs amsId / slotId du même bloc ne sont pas fiables (0/0 même quand le slot est 1).
  const slotRaw = num(raw.ams ?? raw.slot ?? raw.trayId);
  // 254/255 : bobine externe dans les rapports Bambu.
  const slot = slotRaw === null || slotRaw < 0 || slotRaw > 15 ? null : slotRaw;
  return {
    slot,
    type: str(raw.filamentType ?? raw.targetFilamentType ?? raw.type) ?? '',
    color: normalizeHex(str(raw.sourceColor ?? raw.targetColor ?? raw.color)),
    filamentId: str(raw.filamentId ?? raw.trayInfoIdx),
    grams: Math.max(0, num(raw.weight ?? raw.usedG ?? raw.grams) ?? 0),
  };
}

/**
 * Titre d'une tâche envoyée depuis Bambu Studio : « <fichier>_<NN> - <nom du plateau> »
 * (vérifié sur une vraie réponse ; `plateName` y était vide). Le numéro doit correspondre à plateIndex.
 */
export function splitTitle(
  title: string,
  plateIndex: number | null,
): { fileName: string | null; plateName: string | null } {
  const m = /^(.+?)_(\d{1,3})(?: - (.+))?$/.exec(title.trim());
  if (!m || (plateIndex !== null && Number(m[2]) !== plateIndex)) return { fileName: null, plateName: null };
  return { fileName: m[1]!.trim(), plateName: m[3]?.trim() || null };
}

/** Transforme un élément de « hits » en tâche normalisée (null si inutilisable). */
export function normalizeTask(raw: unknown): BambuTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const id = str(r.id ?? r.taskId ?? r.task_id);
  if (!id) return null;
  const mapping = Array.isArray(r.amsDetailMapping)
    ? r.amsDetailMapping
    : Array.isArray(r.filaments)
      ? r.filaments
      : [];
  const filaments = (mapping as Raw[])
    .filter((m) => m && typeof m === 'object')
    .map(normalizeFilament)
    .filter((f) => f.grams > 0 || f.type);
  const start = toIso(r.startTime ?? r.start_time);
  const end = toIso(r.endTime ?? r.end_time);
  // costTime est l'estimation du trancheur (vérifié : 7907 s pour une impression réelle de 11608 s) :
  // la durée réelle est fin − début, l'estimation ne sert qu'à défaut.
  const costTime = num(r.costTime ?? r.cost_time);
  const durationS = start && end && end > start ? (Date.parse(end) - Date.parse(start)) / 1000 : costTime;
  const weightG = num(r.weight);
  // Pas de détail AMS : un seul filament « inconnu » portant le poids total.
  if (!filaments.length && weightG)
    filaments.push({ slot: null, type: '', color: null, filamentId: null, grams: weightG });
  const title = str(r.title ?? r.designTitle ?? r.modelName) ?? `Impression ${id}`;
  const plateIndex = num(r.plateIndex);
  const parsed = splitTitle(title, plateIndex);
  const length = num(r.length);
  return {
    id,
    title,
    plateName: str(r.plateName) ?? parsed.plateName,
    fileName: parsed.fileName,
    plateIndex,
    deviceName: str(r.deviceName),
    deviceModel: str(r.deviceModel),
    startTime: start,
    endTime: end,
    durationS: durationS === null ? null : Math.round(durationS),
    status: mapStatus(r.status),
    statusRaw: typeof r.status === 'number' || typeof r.status === 'string' ? r.status : null,
    weightG,
    // « length » est en centimètres (vérifié : 5908 pour 179 g de PLA, soit ≈ 59 m).
    lengthMm: length === null ? null : length * 10,
    filaments,
  };
}

export function normalizeTasksResponse(json: unknown): BambuTask[] {
  const hits =
    json && typeof json === 'object'
      ? ((json as Raw).hits ?? (json as Raw).tasks ?? (json as Raw).data)
      : null;
  return (Array.isArray(hits) ? hits : []).map(normalizeTask).filter((t): t is BambuTask => t !== null);
}

/** Fusionne les nouvelles tâches dans le fichier existant (dédoublonnage par id, plus récentes d'abord). */
export function mergeTasks(
  existing: BambuTask[],
  incoming: BambuTask[],
  max = 2000,
): { tasks: BambuTask[]; added: number; updated: number } {
  const map = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;
  for (const t of incoming) {
    const cur = map.get(t.id);
    if (!cur) added++;
    else if (JSON.stringify(cur) !== JSON.stringify(t)) updated++;
    map.set(t.id, t);
  }
  const tasks = [...map.values()]
    .sort((a, b) => (b.endTime ?? b.startTime ?? '').localeCompare(a.endTime ?? a.startTime ?? ''))
    .slice(0, max);
  return { tasks, added, updated };
}

/** Intervalle de « battement de cœur » : sans nouveauté, le fichier n'est réécrit que toutes les 6 h. */
export const HEARTBEAT_MS = 6 * 3600_000;
