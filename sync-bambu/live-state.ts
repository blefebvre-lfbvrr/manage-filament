/**
 * État temps réel d'une imprimante à partir des messages MQTT `device/<serial>/report`.
 * Les rapports sont partiels (seuls les champs modifiés sont envoyés) : on les fusionne.
 * Noms de champs d'après ha-bambulab / OpenBambuAPI — À CONFIRMER sur ton imprimante.
 */
export interface LiveState {
  gcodeState: string | null;
  percent: number | null;
  remainingMin: number | null;
  layer: number | null;
  totalLayers: number | null;
  taskName: string | null;
  nozzleTemp: number | null;
  bedTemp: number | null;
  /** Slot AMS en cours (0–3), 254/255 = bobine externe, null = inconnu. */
  trayNow: number | null;
  ams: { slot: number; type: string | null; color: string | null; remainPct: number | null }[];
  lastMessageAt: string | null;
}

export const EMPTY_LIVE: LiveState = {
  gcodeState: null,
  percent: null,
  remainingMin: null,
  layer: null,
  totalLayers: null,
  taskName: null,
  nozzleTemp: null,
  bedTemp: null,
  trayNow: null,
  ams: [],
  lastMessageAt: null,
};

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);

/** Couleur Bambu « RRGGBBAA » → « #RRGGBB ». */
function hex(v: unknown): string | null {
  const s = str(v);
  return s && /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? `#${s.slice(0, 6).toUpperCase()}` : null;
}

export function mergeReport(state: LiveState, message: unknown, at = new Date()): LiveState {
  const p = obj(obj(message)?.print);
  if (!p) return { ...state, lastMessageAt: at.toISOString() };
  const next: LiveState = { ...state, lastMessageAt: at.toISOString() };
  const set = <K extends keyof LiveState>(k: K, v: LiveState[K] | null) => {
    if (v !== null && v !== undefined) next[k] = v as LiveState[K];
  };
  set('gcodeState', str(p.gcode_state));
  set('percent', num(p.mc_percent));
  set('remainingMin', num(p.mc_remaining_time));
  set('layer', num(p.layer_num));
  set('totalLayers', num(p.total_layer_num));
  set('taskName', str(p.subtask_name));
  set('nozzleTemp', num(p.nozzle_temper));
  set('bedTemp', num(p.bed_temper));
  const ams = obj(p.ams);
  if (ams) {
    set('trayNow', num(ams.tray_now));
    const units = Array.isArray(ams.ams) ? ams.ams : [];
    const trays = units.flatMap((u, ui) =>
      (Array.isArray(obj(u)?.tray) ? (obj(u)!.tray as unknown[]) : []).map((t) => {
        const tr = obj(t) ?? {};
        return {
          slot: ui * 4 + (num(tr.id) ?? 0),
          type: str(tr.tray_type),
          color: hex(tr.tray_color),
          remainPct: num(tr.remain) !== null && num(tr.remain)! >= 0 ? num(tr.remain) : null,
        };
      }),
    );
    if (trays.length) next.ams = trays;
  }
  return next;
}

/** Fin d'impression détectée (passage de RUNNING/PAUSE à FINISH/FAILED). */
export function finished(prev: LiveState, next: LiveState): 'success' | 'failed' | null {
  const was = prev.gcodeState;
  if (!was || !['RUNNING', 'PAUSE', 'PREPARE'].includes(was)) return null;
  if (next.gcodeState === 'FINISH') return 'success';
  if (next.gcodeState === 'FAILED') return 'failed';
  return null;
}

export function describe(s: LiveState): string {
  if (!s.gcodeState) return 'en attente du premier rapport…';
  const parts = [s.gcodeState];
  if (s.taskName) parts.push(`« ${s.taskName} »`);
  if (s.percent !== null) parts.push(`${s.percent} %`);
  if (s.remainingMin !== null && s.gcodeState === 'RUNNING') parts.push(`reste ${s.remainingMin} min`);
  if (s.layer !== null && s.totalLayers) parts.push(`couche ${s.layer}/${s.totalLayers}`);
  if (s.trayNow !== null) parts.push(s.trayNow >= 254 ? 'bobine externe' : `slot ${s.trayNow + 1}`);
  return parts.join(' · ');
}

/**
 * Chien de garde : la connexion MQTT du cloud peut rester ouverte sans plus rien recevoir.
 * Au-delà de `pokeMs` sans message on redemande l'état complet, au-delà de `deadMs` on reconnecte.
 */
export function watchdog(lastMessageAt: number, now: number, pokeMs = 60_000, deadMs = 180_000) {
  const idle = now - lastMessageAt;
  return idle > deadMs ? 'reconnect' : idle > pokeMs ? 'pushall' : 'ok';
}

export const PUSHALL = { pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } };
