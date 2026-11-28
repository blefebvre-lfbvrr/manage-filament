/**
 * Accès à l'API cloud NON OFFICIELLE de Bambu Lab (documentée par la communauté :
 * greghesp/ha-bambulab, coelacant1/Bambu-Lab-Cloud-API, doridian/OpenBambuAPI).
 * Elle peut changer ou être bloquée sans préavis.
 */
export type Region = 'global' | 'china';

export const API_HOST: Record<Region, string> = {
  global: 'https://api.bambulab.com',
  china: 'https://api.bambulab.cn',
};
export const WEB_HOST: Record<Region, string> = {
  global: 'https://bambulab.com',
  china: 'https://bambulab.cn',
};

/** En-têtes « navigateur » : sans eux, Cloudflare bloque souvent les appels. */
export const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
};

export class BambuApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type LoginResult =
  | { kind: 'token'; accessToken: string; expiresIn?: number }
  | { kind: 'verifyCode' }
  | { kind: 'tfa'; tfaKey: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (res.status === 403 && /cloudflare/i.test(text))
    throw new BambuApiError('Bloqué par Cloudflare (réessaie plus tard, depuis une autre connexion).', 403);
  if (!text.trim())
    throw new BambuApiError(
      `Réponse vide (HTTP ${res.status}), probablement un blocage Cloudflare.`,
      res.status,
    );
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new BambuApiError(`Réponse illisible (HTTP ${res.status}).`, res.status);
  }
}

export function interpretLogin(j: Record<string, unknown>): LoginResult {
  const token = typeof j.accessToken === 'string' ? j.accessToken : '';
  if (token)
    return {
      kind: 'token',
      accessToken: token,
      expiresIn: typeof j.expiresIn === 'number' ? j.expiresIn : undefined,
    };
  if (j.loginType === 'verifyCode') return { kind: 'verifyCode' };
  if (j.loginType === 'tfa' && typeof j.tfaKey === 'string') return { kind: 'tfa', tfaKey: j.tfaKey };
  const err =
    typeof j.error === 'string' ? j.error : typeof j.message === 'string' ? j.message : 'réponse inattendue';
  throw new BambuApiError(`Connexion refusée : ${err}`, 400);
}

export async function login(
  region: Region,
  account: string,
  password: string,
  f: typeof fetch = fetch,
): Promise<LoginResult> {
  const res = await f(`${API_HOST[region]}/v1/user-service/user/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ account, password, apiError: '' }),
  });
  return interpretLogin(await readJson(res));
}

/** Demande (ou redemande) l'envoi du code par email. */
export async function sendEmailCode(region: Region, email: string, f: typeof fetch = fetch): Promise<void> {
  const res = await f(`${API_HOST[region]}/v1/user-service/user/sendemail/code`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ email, type: 'codeLogin' }),
  });
  if (!res.ok) throw new BambuApiError(`Envoi du code impossible (HTTP ${res.status}).`, res.status);
}

export async function loginWithCode(
  region: Region,
  account: string,
  code: string,
  f: typeof fetch = fetch,
): Promise<LoginResult> {
  const res = await f(`${API_HOST[region]}/v1/user-service/user/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ account, code }),
  });
  return interpretLogin(await readJson(res));
}

/** Double authentification par application (TOTP) : passe par le site, avec un jeton CSRF. */
export async function loginWithTfa(
  region: Region,
  tfaKey: string,
  tfaCode: string,
  f: typeof fetch = fetch,
): Promise<LoginResult> {
  const csrf = await f(`${WEB_HOST[region]}/api/csrf`, { headers: HEADERS });
  const cookie = csrf.headers.get('set-cookie') ?? '';
  const token = /bbl_csrf_token=([^;]+)/.exec(cookie)?.[1];
  if (!token)
    throw new BambuApiError(
      'Jeton CSRF introuvable : utilise plutôt la connexion par code email.',
      csrf.status,
    );
  const res = await f(`${WEB_HOST[region]}/api/sign-in/tfa`, {
    method: 'POST',
    headers: { ...HEADERS, 'x-bbl-csrf-token': token, Cookie: `bbl_csrf_token=${token}` },
    body: JSON.stringify({ tfaKey, tfaCode }),
  });
  const set = res.headers.get('set-cookie') ?? '';
  const access = /(?:^|[;,]\s*)token=([^;]+)/.exec(set)?.[1];
  if (!access) throw new BambuApiError(`Code refusé (HTTP ${res.status}).`, res.status);
  return { kind: 'token', accessToken: access };
}

export async function getJson(
  region: Region,
  token: string,
  path: string,
  f: typeof fetch = fetch,
): Promise<unknown> {
  const res = await f(`${API_HOST[region]}${path}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401)
    throw new BambuApiError('Token Bambu expiré ou invalide : relance « npm run bambu-login ».', 401);
  if (!res.ok) {
    // readJson signale d'abord un blocage Cloudflare ou une réponse vide.
    const j = await readJson(res);
    throw new BambuApiError(`Erreur ${res.status} : ${JSON.stringify(j).slice(0, 200)}`, res.status);
  }
  return readJson(res);
}

/** Historique des impressions du compte (les plus récentes d'abord). */
export function getTasks(
  region: Region,
  token: string,
  limit = 5,
  f: typeof fetch = fetch,
): Promise<unknown> {
  return getJson(region, token, `/v1/user-service/my/tasks?limit=${limit}`, f);
}

/** Masque les identifiants et URL signées avant d'afficher ou partager une réponse. */
const SENSITIVE =
  /^(dev(ice)?_?id|deviceId|devId|serial|sn|uid|userId|user_id|email|account|token|accessToken|password|url|cover|thumbnail|.*Url|.*_url|ip|accessCode|access_code)$/i;

export function redact(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v, k)]),
    );
  }
  if (key && SENSITIVE.test(key) && value !== null && value !== '' && typeof value !== 'boolean')
    return `<masqué:${typeof value}>`;
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return '<masqué:url>';
  return value;
}
