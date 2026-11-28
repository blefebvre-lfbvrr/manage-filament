import { describe, expect, it } from 'vitest';
import { getTasks, interpretLogin, login, loginWithCode, redact } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('API cloud Bambu (non officielle)', () => {
  it('interprète les réponses de connexion', () => {
    expect(interpretLogin({ accessToken: 'abc', expiresIn: 7776000 })).toEqual({
      kind: 'token',
      accessToken: 'abc',
      expiresIn: 7776000,
    });
    expect(interpretLogin({ accessToken: '', loginType: 'verifyCode' })).toEqual({ kind: 'verifyCode' });
    expect(interpretLogin({ loginType: 'tfa', tfaKey: 'k' })).toEqual({ kind: 'tfa', tfaKey: 'k' });
    expect(() => interpretLogin({ code: 2, error: 'Incorrect password' })).toThrow('Incorrect password');
  });

  it('enchaîne mot de passe puis code email', async () => {
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method ?? 'GET'} ${url} ${init.body ?? ''}`);
      const body = JSON.parse(String(init.body));
      return body.code
        ? json(200, { accessToken: 'tok' })
        : json(200, { accessToken: '', loginType: 'verifyCode' });
    }) as unknown as typeof fetch;
    expect(await login('global', 'a@b.c', 'pw', f)).toEqual({ kind: 'verifyCode' });
    expect(await loginWithCode('global', 'a@b.c', '123456', f)).toMatchObject({
      kind: 'token',
      accessToken: 'tok',
    });
    expect(calls[0]).toContain('https://api.bambulab.com/v1/user-service/user/login');
  });

  it('historique : token expiré, Cloudflare', async () => {
    await expect(
      getTasks('global', 't', 5, (async () => new Response('', { status: 401 })) as unknown as typeof fetch),
    ).rejects.toThrow('expiré');
    await expect(
      getTasks(
        'global',
        't',
        5,
        (async () => new Response('<html>cloudflare</html>', { status: 403 })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Cloudflare');
    const ok = await getTasks('global', 't', 5, (async (u: string) =>
      json(200, { total: 1, hits: [{ id: 1, url: u }] })) as unknown as typeof fetch);
    expect(ok).toMatchObject({ total: 1 });
  });

  it('masque les identifiants et les URL avant partage', () => {
    const r = redact({
      total: 2,
      hits: [
        {
          id: 42,
          deviceId: '01S00A123',
          title: 'Benchy',
          cover: 'https://x/y.png?sig=1',
          weight: 12.5,
          amsDetailMapping: [{ ams: 0, sourceColor: 'FF0000FF', weight: 12.5 }],
          userId: 99,
        },
      ],
    });
    expect(r).toEqual({
      total: 2,
      hits: [
        {
          id: 42,
          deviceId: '<masqué:string>',
          title: 'Benchy',
          cover: '<masqué:string>',
          weight: 12.5,
          amsDetailMapping: [{ ams: 0, sourceColor: 'FF0000FF', weight: 12.5 }],
          userId: '<masqué:number>',
        },
      ],
    });
  });
});
