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
  updatedAt: z.string(),
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
 * Statut numérique du cloud. Correspondance d'après la communauté, À CONFIRMER sur une vraie réponse :
 * 1 en cours, 2 réussie, 3 ratée, 4 annulée. Un statut texte est aussi accepté.
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
  const slotRaw = num(raw.ams ?? raw.amsId ?? raw.slot ?? raw.trayId);
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
  const costTime = num(r.costTime ?? r.cost_time);
  const durationS =
    costTime ?? (start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000) : null);
  const weightG = num(r.weight);
  // Pas de détail AMS : un seul filament « inconnu » portant le poids total.
  if (!filaments.length && weightG)
    filaments.push({ slot: null, type: '', color: null, filamentId: null, grams: weightG });
  return {
    id,
    title: str(r.title ?? r.designTitle ?? r.modelName) ?? `Impression ${id}`,
    plateName: str(r.plateName),
    plateIndex: num(r.plateIndex),
    deviceName: str(r.deviceName),
    deviceModel: str(r.deviceModel),
    startTime: start,
    endTime: end,
    durationS: durationS === null ? null : Math.round(durationS),
    status: mapStatus(r.status),
    statusRaw: typeof r.status === 'number' || typeof r.status === 'string' ? r.status : null,
    weightG,
    lengthMm: num(r.length),
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
