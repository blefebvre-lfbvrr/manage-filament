/**
 * npm run sync-bambu — récupère l'historique des impressions du cloud Bambu Lab,
 * le normalise et l'écrit dans le dépôt privé de données (bambu/prints.json).
 * Tourne en local ou dans la GitHub Action planifiée. N'affiche que des compteurs
 * (les journaux d'un dépôt public sont publics).
 *
 * Variables : BAMBU_TOKEN, BAMBU_REGION (global|china), DATA_REPO (propriétaire/dépôt),
 * DATA_REPO_TOKEN (token GitHub à grain fin, Contents R/W sur le dépôt de données), DATA_BRANCH.
 * Code de sortie 2 : token Bambu expiré (le workflow ouvre alors une issue).
 */
import { BambuApiError, getTasks, type Region } from './api.ts';
import { loadSecrets } from './secrets.ts';
import { GitHubClient } from '../src/lib/cloud/github.ts';
import {
  bambuPrintsFileSchema,
  mergeTasks,
  normalizeTasksResponse,
  HEARTBEAT_MS,
  type BambuPrintsFile,
} from '../src/lib/bambu/tasks.ts';

export const PRINTS_PATH = 'bambu/prints.json';

export async function syncOnce(opts: {
  bambuToken: string;
  region: Region;
  repo: string;
  repoToken: string;
  branch: string;
  limit: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  const [owner, name] = opts.repo.split('/');
  if (!owner || !name) throw new Error('DATA_REPO doit être de la forme propriétaire/dépôt.');
  const raw = await getTasks(opts.region, opts.bambuToken, opts.limit, opts.fetchImpl);
  const incoming = normalizeTasksResponse(raw);
  const gh = new GitHubClient(
    { owner, repo: name, branch: opts.branch, token: opts.repoToken },
    opts.fetchImpl,
  );
  const current = await gh.getText(PRINTS_PATH);
  let existing: BambuPrintsFile['tasks'] = [];
  let prev: BambuPrintsFile | null = null;
  if (current) {
    const parsed = bambuPrintsFileSchema.safeParse(JSON.parse(current.text));
    if (parsed.success) {
      prev = parsed.data;
      existing = parsed.data.tasks;
    }
  }
  const { tasks, added, updated } = mergeTasks(existing, incoming);
  const now = opts.now ?? new Date();
  const lastCheck = prev ? Date.parse(prev.checkedAt ?? prev.updatedAt) : 0;
  const changed = added > 0 || updated > 0 || !prev;
  if (changed || now.getTime() - lastCheck > HEARTBEAT_MS) {
    const file: BambuPrintsFile = {
      version: 1,
      updatedAt: changed ? now.toISOString() : prev!.updatedAt,
      checkedAt: now.toISOString(),
      tasks,
    };
    await gh.put(
      PRINTS_PATH,
      `${JSON.stringify(file, null, 2)}\n`,
      changed
        ? `Synchro Bambu : ${added} nouvelle(s), ${updated} mise(s) à jour`
        : 'Synchro Bambu : vérification',
      current?.sha,
    );
  }
  return { fetched: incoming.length, added, updated, total: tasks.length };
}

async function main() {
  const local = loadSecrets();
  const bambuToken = process.env.BAMBU_TOKEN || local?.token;
  const repoToken = process.env.DATA_REPO_TOKEN || process.env.GITHUB_TOKEN;
  if (!bambuToken || !repoToken) {
    console.log('Synchro Bambu non configurée (BAMBU_TOKEN et DATA_REPO_TOKEN requis) : rien à faire.');
    return;
  }
  try {
    const r = await syncOnce({
      bambuToken,
      region: (process.env.BAMBU_REGION || local?.region) === 'china' ? 'china' : 'global',
      repo: process.env.DATA_REPO || 'blefebvre-lfbvrr/manage-filament-data',
      repoToken,
      branch: process.env.DATA_BRANCH || 'main',
      limit: Number(process.env.LIMIT || 100),
    });
    console.log(
      `Synchro Bambu : ${r.fetched} tâche(s) lue(s), ${r.added} nouvelle(s), ${r.updated} mise(s) à jour, ${r.total} au total.`,
    );
  } catch (e) {
    if (e instanceof BambuApiError && e.status === 401) {
      console.error('TOKEN_EXPIRED : le token Bambu est expiré ou révoqué.');
      process.exitCode = 2;
      return;
    }
    console.error(`Échec de la synchro : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && /sync\.ts$/.test(process.argv[1])) void main();
