import { ConflictError, GitHubClient, fromBase64, toBase64 } from '@/lib/cloud/github';
import { decide, resolveConflict, safeFileName, serialize } from '@/lib/cloud/sync';
import { makeProject } from '@/lib/project-factory';
import { FilaTrackDB } from './db';
import { ensureSeed } from './repo';
import { syncCloud } from './cloud';

/** Faux dépôt GitHub (API Contents) en mémoire, avec contrôle des sha comme le vrai. */
function fakeGitHub() {
  const files = new Map<string, { sha: string; content: string }>();
  let n = 0;
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\/?/, ''));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (method === 'PUT') {
      const body = JSON.parse(String(init!.body)) as { content: string; sha?: string };
      const cur = files.get(path);
      if (cur && cur.sha !== body.sha) return json(409, { message: 'sha mismatch' });
      if (!cur && body.sha) return json(422, { message: 'sha for new file' });
      const sha = `sha${++n}`;
      files.set(path, { sha, content: body.content });
      return json(cur ? 200 : 201, { content: { sha } });
    }
    const f = files.get(path);
    if (f) return json(200, { sha: f.sha, content: f.content, encoding: 'base64' });
    const children = [...files.entries()].filter(
      ([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'),
    );
    if (children.length)
      return json(
        200,
        children.map(([p, v]) => ({ path: p, sha: v.sha, size: v.content.length, type: 'file' })),
      );
    return json(404, { message: 'Not Found' });
  }) as typeof fetch;
  const read = (p: string) => JSON.parse(new TextDecoder().decode(fromBase64(files.get(p)!.content)));
  const edit = (p: string, mut: (o: Record<string, unknown>) => void) => {
    const o = read(p);
    mut(o);
    files.set(p, { sha: `sha${++n}`, content: toBase64(new TextEncoder().encode(JSON.stringify(o))) });
  };
  return { files, fetchImpl, read, edit, calls };
}

const cfg = { owner: 'me', repo: 'data', branch: 'main', token: 't' };

describe('règles de synchronisation', () => {
  it('décisions', () => {
    const doc = (sync: object | undefined) => ({ id: 'a', updatedAt: '1', sync });
    expect(decide(undefined, 'x')).toBe('pull');
    expect(decide(undefined, undefined)).toBe('none');
    expect(decide(doc({ dirty: true }), undefined)).toBe('push');
    expect(decide(doc({ sha: 'x', dirty: false }), 'x')).toBe('none');
    expect(decide(doc({ sha: 'x', dirty: true }), 'x')).toBe('push');
    expect(decide(doc({ sha: 'x', dirty: false }), 'y')).toBe('pull');
    expect(decide(doc({ sha: 'x', dirty: true }), 'y')).toBe('conflict');
    expect(decide(doc(undefined), 'y')).toBe('conflict');
  });
  it('conflit : la plus récente gagne, l’autre est gardée dans l’historique', () => {
    const local = { id: 'a', updatedAt: '2026-11-02', name: 'local', history: [] };
    const remote = { id: 'a', updatedAt: '2026-11-01', name: 'distant', history: [] };
    const r = resolveConflict(local, remote, '2026-11-03');
    expect(r.from).toBe('local');
    expect(r.winner.name).toBe('local');
    expect(r.winner.history[0]).toMatchObject({ snapshot: { name: 'distant' } });
    expect(resolveConflict({ ...local, updatedAt: '2026-10-01' }, remote, 'x').winner.name).toBe('distant');
  });
  it('sérialisation et noms de fichiers', () => {
    expect(serialize({ id: 'a', updatedAt: '1', sync: { dirty: true } })).not.toContain('sync');
    expect(safeFileName('Pièce n°1 (v2).gcode.3mf')).toBe('Piece_n_1_v2_.gcode.3mf');
    expect(Array.from(fromBase64(toBase64(new Uint8Array([0, 255, 128]))))).toEqual([0, 255, 128]);
  });
});

describe('synchronisation avec le dépôt', () => {
  let a: FilaTrackDB;
  let b: FilaTrackDB;
  let n = 0;
  beforeEach(async () => {
    a = new FilaTrackDB(`cloud-a-${++n}`);
    b = new FilaTrackDB(`cloud-b-${n}`);
    await ensureSeed(a);
    await ensureSeed(b);
  });
  afterEach(async () => {
    await a.delete();
    await b.delete();
  });

  it('envoi, réception sur un autre appareil, puis plus rien à faire', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(cfg, gh.fetchImpl);
    const p = makeProject('Étagère', { id: 'p1' });
    await a.projects.add(p);
    await a.contacts.add({
      id: 'c1',
      name: 'Mme Dupont',
      createdAt: 'x',
      updatedAt: 'x',
      deletedAt: null,
      sync: { dirty: true },
    });
    expect(await syncCloud(client, a, '2026-11-28T01:00:00Z')).toMatchObject({
      pushed: 2,
      pulled: 0,
      errors: [],
    });
    expect(gh.read('projects/p1.json')).toMatchObject({ name: 'Étagère' });
    expect(gh.read('projects/p1.json')).not.toHaveProperty('sync');
    expect((await a.projects.get('p1'))!.sync).toMatchObject({ dirty: false });

    expect(await syncCloud(client, b)).toMatchObject({ pulled: 2, pushed: 0 });
    expect((await b.projects.get('p1'))!.name).toBe('Étagère');
    expect(await syncCloud(client, b)).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 });
    expect((await b.settings.get('app'))!.value).toMatchObject({ cloud: { lastSyncAt: expect.any(String) } });
  });

  it('modifié des deux côtés : fusion sans perte', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(cfg, gh.fetchImpl);
    await a.projects.add(makeProject('V1', { id: 'p1', updatedAt: '2026-11-01T00:00:00Z' }));
    await syncCloud(client, a);
    await syncCloud(client, b);
    // Autre appareil : modification plus ancienne ; cet appareil : modification plus récente.
    await b.projects.update('p1', {
      name: 'Depuis B',
      updatedAt: '2026-11-02T00:00:00Z',
      sync: { ...(await b.projects.get('p1'))!.sync, dirty: true },
    });
    await syncCloud(client, b);
    await a.projects.update('p1', {
      name: 'Depuis A',
      updatedAt: '2026-11-03T00:00:00Z',
      sync: { ...(await a.projects.get('p1'))!.sync, dirty: true },
    });
    const r = await syncCloud(client, a);
    expect(r.conflicts).toBe(1);
    const merged = gh.read('projects/p1.json');
    expect(merged.name).toBe('Depuis A');
    expect(merged.history[0].snapshot.name).toBe('Depuis B');
    await syncCloud(client, b);
    expect((await b.projects.get('p1'))!.name).toBe('Depuis A');
  });

  it('fichier .3mf envoyé avec le projet', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(cfg, gh.fetchImpl);
    await a.attachments.add({
      id: 'f1',
      name: 'boite.3mf',
      mime: 'model/3mf',
      size: 3,
      data: new Uint8Array([1, 2, 3]),
      createdAt: 'x',
      updatedAt: 'x',
      deletedAt: null,
    });
    await a.projects.add(
      makeProject('P', {
        id: 'p1',
        parts: [
          {
            id: 'part1',
            name: 'Boîte',
            source: '3mf',
            fileName: 'boîte.3mf',
            fileId: 'f1',
            quantity: 1,
            plates: [],
          },
        ],
      }),
    );
    const r = await syncCloud(client, a);
    expect(r.files).toBe(1);
    expect(gh.files.has('files/p1/part1-boite.3mf')).toBe(true);
    expect(gh.read('projects/p1.json').parts[0].remotePath).toBe('files/p1/part1-boite.3mf');
  });

  it('erreurs : token refusé, contenu invalide', async () => {
    const unauthorized = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await a.projects.add(makeProject('P', { id: 'p1' }));
    await expect(syncCloud(new GitHubClient(cfg, unauthorized), a)).rejects.toThrow('Token GitHub refusé');
    const gh = fakeGitHub();
    gh.files.set('projects/bad.json', {
      sha: 's',
      content: toBase64(new TextEncoder().encode('{"id":"bad"}')),
    });
    const r = await syncCloud(new GitHubClient(cfg, gh.fetchImpl), b);
    expect(r.errors[0]).toContain('contenu invalide');
  });

  it('client : conflit de sha signalé', async () => {
    const gh = fakeGitHub();
    const client = new GitHubClient(cfg, gh.fetchImpl);
    await client.put('x.json', '{}', 'm');
    await expect(client.put('x.json', '{}', 'm', 'wrong')).rejects.toBeInstanceOf(ConflictError);
  });
});
