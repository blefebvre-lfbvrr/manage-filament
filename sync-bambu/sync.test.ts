import { describe, expect, it } from 'vitest';
import { fromBase64 } from '../src/lib/cloud/github';
import { syncOnce } from './sync';

function fakes() {
  const files = new Map<string, { sha: string; content: string }>();
  let n = 0;
  let bambuStatus = 200;
  const f = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === 'api.bambulab.com') {
      if (bambuStatus === 401) return new Response('', { status: 401 });
      return new Response(
        JSON.stringify({
          total: 1,
          hits: [
            {
              id: 1,
              title: 'Benchy',
              status: 2,
              weight: 12,
              amsDetailMapping: [{ ams: 0, filamentType: 'PLA', sourceColor: 'FFFFFFFF', weight: 12 }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      files.set(path, { sha: `s${++n}`, content: body.content });
      return new Response(JSON.stringify({ content: { sha: `s${n}` } }), { status: 201 });
    }
    const cur = files.get(path);
    return cur
      ? new Response(JSON.stringify({ sha: cur.sha, content: cur.content, encoding: 'base64' }), {
          status: 200,
        })
      : new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { files, f, setBambu: (s: number) => (bambuStatus = s) };
}

const opts = {
  bambuToken: 'b',
  region: 'global' as const,
  repo: 'me/data',
  repoToken: 'g',
  branch: 'main',
  limit: 10,
};

describe('synchro Bambu → dépôt de données', () => {
  it('écrit prints.json, puis ne réécrit pas sans nouveauté', async () => {
    const { files, f } = fakes();
    expect(await syncOnce({ ...opts, fetchImpl: f })).toMatchObject({ fetched: 1, added: 1, total: 1 });
    const file = JSON.parse(new TextDecoder().decode(fromBase64(files.get('bambu/prints.json')!.content)));
    expect(file).toMatchObject({ version: 1, tasks: [{ id: '1', title: 'Benchy', status: 'success' }] });
    const sha = files.get('bambu/prints.json')!.sha;
    expect(await syncOnce({ ...opts, fetchImpl: f })).toMatchObject({ added: 0, updated: 0 });
    expect(files.get('bambu/prints.json')!.sha).toBe(sha);
  });
  it('battement de cœur : sans nouveauté, réécrit checkedAt au plus toutes les 6 h', async () => {
    const { files, f } = fakes();
    const t0 = new Date('2026-11-28T00:00:00Z');
    await syncOnce({ ...opts, fetchImpl: f, now: t0 });
    const sha = files.get('bambu/prints.json')!.sha;
    await syncOnce({ ...opts, fetchImpl: f, now: new Date('2026-11-28T05:00:00Z') });
    expect(files.get('bambu/prints.json')!.sha).toBe(sha);
    await syncOnce({ ...opts, fetchImpl: f, now: new Date('2026-11-28T07:00:00Z') });
    const file = JSON.parse(new TextDecoder().decode(fromBase64(files.get('bambu/prints.json')!.content)));
    expect(file).toMatchObject({ updatedAt: t0.toISOString(), checkedAt: '2026-11-28T07:00:00.000Z' });
  });
  it('token expiré : erreur 401 remontée', async () => {
    const { f, setBambu } = fakes();
    setBambu(401);
    await expect(syncOnce({ ...opts, fetchImpl: f })).rejects.toMatchObject({ status: 401 });
  });
  it('dépôt mal renseigné', async () => {
    await expect(syncOnce({ ...opts, repo: 'invalide' })).rejects.toThrow('propriétaire/dépôt');
  });
});
