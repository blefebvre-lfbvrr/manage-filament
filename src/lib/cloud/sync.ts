/** Règles de synchronisation hors ligne d'abord (fonctions pures). */

export interface SyncMeta {
  sha?: string | null;
  syncedAt?: string | null;
  dirty?: boolean;
}

export interface SyncDoc {
  id: string;
  updatedAt: string;
  sync?: SyncMeta | null;
  history?: { at: string; reason: string; snapshot: unknown }[];
}

export type SyncAction = 'none' | 'push' | 'pull' | 'conflict';

/**
 * - rien en local → on récupère ;
 * - rien à distance → on envoie ;
 * - distant inchangé depuis le dernier échange → on envoie si modifié localement ;
 * - distant modifié et local intact → on récupère ;
 * - modifié des deux côtés → conflit (fusion).
 */
export function decide(local: SyncDoc | undefined, remoteSha: string | undefined): SyncAction {
  if (!local) return remoteSha ? 'pull' : 'none';
  if (!remoteSha) return 'push';
  const dirty = local.sync?.dirty ?? true;
  if (local.sync?.sha === remoteSha) return dirty ? 'push' : 'none';
  return dirty ? 'conflict' : 'pull';
}

const MAX_HISTORY = 10;

/**
 * Conflit : la version la plus récemment modifiée gagne ; l'autre est conservée dans l'historique
 * du gagnant (rien n'est perdu).
 */
export function resolveConflict<T extends SyncDoc>(
  local: T,
  remote: T,
  now: string,
): { winner: T; from: 'local' | 'remote' } {
  const localWins = local.updatedAt >= remote.updatedAt;
  const winner = localWins ? local : remote;
  const loser = localWins ? remote : local;
  const { sync: _s, history: _h, ...snapshot } = loser;
  const history = [
    ...(winner.history ?? []),
    ...(loser.history ?? []).filter((h) => !(winner.history ?? []).some((w) => w.at === h.at)),
    {
      at: now,
      reason: `Conflit de synchronisation : version ${localWins ? 'distante' : 'locale'} remplacée`,
      snapshot,
    },
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_HISTORY);
  return { winner: { ...winner, history }, from: localWins ? 'local' : 'remote' };
}

/** Contenu envoyé au dépôt : le document sans ses métadonnées de synchronisation. */
export function serialize<T extends SyncDoc>(doc: T): string {
  const { sync: _s, ...rest } = doc;
  return `${JSON.stringify(rest, null, 2)}\n`;
}

export const PATHS = {
  projects: 'projects',
  contacts: 'contacts',
  files: 'files',
  prints: 'bambu/prints.json',
};

export function docPath(dir: string, id: string): string {
  return `${dir}/${id}.json`;
}

export function idFromPath(path: string): string | null {
  const m = /\/([^/]+)\.json$/.exec(path);
  return m?.[1] ?? null;
}

/** Nom de fichier sûr pour le dépôt. */
export function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 120);
}

/** Taille max d'un .3mf envoyé au dépôt (au-delà, seules les métadonnées sont synchronisées). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
