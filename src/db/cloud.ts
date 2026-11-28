/** Synchronisation des projets et contacts avec le dépôt GitHub privé (hors ligne d'abord). */
import type { z } from 'zod';
import { ConflictError, fromBase64, GitHubClient, GitHubError, type GitHubConfig } from '@/lib/cloud/github';
import {
  decide,
  docPath,
  idFromPath,
  MAX_FILE_BYTES,
  PATHS,
  resolveConflict,
  safeFileName,
  serialize,
  type SyncDoc,
} from '@/lib/cloud/sync';
import { nowIso } from '@/lib/ids';
import { contactSchema, projectSchema } from '@/lib/schemas';
import { getDb, type FilaTrackDB } from './db';
import { getSettings, saveSettings } from './repo';

const TOKEN_KEY = 'filatrack:githubToken';

/** Octets d'une pièce jointe : Blob (base), data URL (sauvegarde restaurée) ou octets bruts. */
export async function attachmentBytes(data: unknown): Promise<Uint8Array | null> {
  // ArrayBuffer.isView / toString plutôt qu'instanceof : les données peuvent venir d'un autre contexte JS.
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Object.prototype.toString.call(data) === '[object ArrayBuffer]')
    return new Uint8Array(data as ArrayBuffer);
  if (typeof data === 'string' && data.startsWith('data:'))
    return fromBase64(data.slice(data.indexOf(',') + 1));
  if (data && typeof (data as Blob).arrayBuffer === 'function')
    return new Uint8Array(await (data as Blob).arrayBuffer());
  return null;
}

/** Le token GitHub est stocké uniquement dans ce navigateur (jamais dans la base ni les sauvegardes). */
export function getGitHubToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGitHubToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible */
  }
}

export async function cloudClient(
  db: FilaTrackDB = getDb(),
  fetchImpl?: typeof fetch,
): Promise<GitHubClient | null> {
  const token = getGitHubToken();
  if (!token) return null;
  const { cloud } = await getSettings(db);
  const cfg: GitHubConfig = { owner: cloud.owner, repo: cloud.repo, branch: cloud.branch, token };
  return new GitHubClient(cfg, fetchImpl);
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  conflicts: number;
  files: number;
  errors: string[];
}

type Kind = 'projects' | 'contacts';
const SCHEMAS: Record<Kind, z.ZodType> = { projects: projectSchema, contacts: contactSchema };

async function uploadProjectFiles(client: GitHubClient, db: FilaTrackDB, report: SyncReport) {
  for (const p of await db.projects.toArray()) {
    let changed = false;
    const parts = [];
    for (const part of p.parts) {
      if (!part.fileId || part.remotePath) {
        parts.push(part);
        continue;
      }
      const att = await db.attachments.get(part.fileId);
      const bytes = att ? await attachmentBytes(att.data) : null;
      if (!att || !bytes || bytes.byteLength > MAX_FILE_BYTES) {
        parts.push(part);
        continue;
      }
      const path = `${PATHS.files}/${p.id}/${part.id}-${safeFileName(part.fileName ?? att.name)}`;
      try {
        const existing = (await client.list(`${PATHS.files}/${p.id}`)).find((f) => f.path === path);
        await client.put(path, bytes, `Fichier ${part.fileName ?? ''} (${p.name})`, existing?.sha);
        parts.push({ ...part, remotePath: path });
        changed = true;
        report.files++;
      } catch (e) {
        report.errors.push(`Fichier ${part.fileName} : ${e instanceof Error ? e.message : 'échec'}`);
        parts.push(part);
      }
    }
    if (changed)
      await db.projects.put({ ...p, parts, updatedAt: nowIso(), sync: { ...p.sync, dirty: true } });
  }
}

async function syncKind(kind: Kind, client: GitHubClient, db: FilaTrackDB, report: SyncReport, now: string) {
  const table = db.table(kind);
  const remote = new Map(
    (await client.list(PATHS[kind]))
      .filter((f) => f.type === 'file')
      .map((f) => [idFromPath(f.path), f.sha] as const)
      .filter((e): e is [string, string] => Boolean(e[0])),
  );
  const local = new Map(((await table.toArray()) as SyncDoc[]).map((d) => [d.id, d]));
  const ids = new Set([...remote.keys(), ...local.keys()]);
  const parse = (text: string) => {
    const r = SCHEMAS[kind].safeParse(JSON.parse(text));
    if (!r.success) throw new Error('contenu invalide');
    return r.data as SyncDoc;
  };
  const label = kind === 'projects' ? 'Projet' : 'Contact';

  for (const id of ids) {
    const doc = local.get(id);
    const remoteSha = remote.get(id);
    const path = docPath(PATHS[kind], id);
    try {
      let action = decide(doc, remoteSha);
      if (action === 'push') {
        try {
          const sha = await client.put(
            path,
            serialize(doc!),
            `${label} ${(doc as { name?: string }).name ?? id}`,
            doc!.sync?.sha ?? remoteSha,
          );
          await table.put({ ...doc, sync: { sha, syncedAt: now, dirty: false } });
          report.pushed++;
          continue;
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          action = 'conflict';
        }
      }
      if (action === 'pull') {
        const f = await client.getText(path);
        if (!f) continue;
        await table.put({ ...parse(f.text), sync: { sha: f.sha, syncedAt: now, dirty: false } });
        report.pulled++;
      } else if (action === 'conflict') {
        const f = await client.getText(path);
        if (!f) continue;
        const { winner } = resolveConflict(doc!, parse(f.text), now);
        const sha = await client.put(
          path,
          serialize(winner),
          `${label} ${(winner as { name?: string }).name ?? id} (fusion)`,
          f.sha,
        );
        await table.put({ ...winner, sync: { sha, syncedAt: now, dirty: false } });
        report.conflicts++;
      }
    } catch (e) {
      report.errors.push(`${label} ${id} : ${e instanceof Error ? e.message : 'échec'}`);
      if (e instanceof GitHubError && (e.status === 401 || e.status === 403)) throw e;
    }
  }
}

/** Envoie les modifications locales et récupère celles des autres appareils. */
export async function syncCloud(
  client: GitHubClient,
  db: FilaTrackDB = getDb(),
  now = nowIso(),
): Promise<SyncReport> {
  const report: SyncReport = { pulled: 0, pushed: 0, conflicts: 0, files: 0, errors: [] };
  await uploadProjectFiles(client, db, report);
  await syncKind('contacts', client, db, report, now);
  await syncKind('projects', client, db, report, now);
  const settings = await getSettings(db);
  await saveSettings({ cloud: { ...settings.cloud, lastSyncAt: now } }, db);
  return report;
}
