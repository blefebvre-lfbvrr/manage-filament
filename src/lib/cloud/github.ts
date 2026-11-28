/**
 * Client minimal de l'API GitHub « Contents » pour le dépôt privé des données.
 * Le token (grain fin, limité à ce dépôt) est fourni par l'utilisateur et ne quitte pas le navigateur.
 */
export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface RemoteFile {
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Le fichier a changé côté GitHub depuis la dernière lecture (sha périmé). */
export class ConflictError extends GitHubError {}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class GitHubClient {
  constructor(
    private cfg: GitHubConfig,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private url(path: string, query = '') {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}/contents/${p}${query}`;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.ok || res.status === 404) return res;
    if (res.status === 409 || res.status === 422)
      throw new ConflictError('Le fichier a été modifié ailleurs.', res.status);
    if (res.status === 401) throw new GitHubError('Token GitHub refusé (expiré ou révoqué).', 401);
    if (res.status === 403)
      throw new GitHubError(
        'Accès refusé : vérifie les permissions du token (Contents : lecture et écriture sur ce dépôt).',
        403,
      );
    throw new GitHubError(`Erreur GitHub ${res.status}`, res.status);
  }

  /** Vérifie l'accès au dépôt. */
  async check(): Promise<{ private: boolean; canWrite: boolean }> {
    const res = await this.call(
      `https://api.github.com/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`,
    );
    if (res.status === 404) throw new GitHubError('Dépôt introuvable (ou token sans accès à ce dépôt).', 404);
    const j = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
    return { private: Boolean(j.private), canWrite: Boolean(j.permissions?.push) };
  }

  async list(dir: string): Promise<RemoteFile[]> {
    const res = await this.call(this.url(dir, `?ref=${encodeURIComponent(this.cfg.branch)}`));
    if (res.status === 404) return [];
    const j = (await res.json()) as { path: string; sha: string; size: number; type: string }[];
    return Array.isArray(j)
      ? j.map((f) => ({ path: f.path, sha: f.sha, size: f.size, type: f.type === 'dir' ? 'dir' : 'file' }))
      : [];
  }

  async getBytes(path: string): Promise<{ sha: string; bytes: Uint8Array } | null> {
    const res = await this.call(this.url(path, `?ref=${encodeURIComponent(this.cfg.branch)}`));
    if (res.status === 404) return null;
    const j = (await res.json()) as {
      sha: string;
      content?: string;
      encoding?: string;
      download_url?: string;
    };
    if (j.content && j.encoding === 'base64') return { sha: j.sha, bytes: fromBase64(j.content) };
    // Fichiers > 1 Mo : contenu non inclus, on passe par le type « raw ».
    const raw = await this.fetchImpl(this.url(path, `?ref=${encodeURIComponent(this.cfg.branch)}`), {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    return { sha: j.sha, bytes: new Uint8Array(await raw.arrayBuffer()) };
  }

  async getText(path: string): Promise<{ sha: string; text: string } | null> {
    const f = await this.getBytes(path);
    return f ? { sha: f.sha, text: dec.decode(f.bytes) } : null;
  }

  async put(
    path: string,
    content: string | Uint8Array,
    message: string,
    sha?: string | null,
  ): Promise<string> {
    const bytes = typeof content === 'string' ? enc.encode(content) : content;
    const res = await this.call(this.url(path), {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: toBase64(bytes),
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.status === 404) throw new GitHubError('Dépôt ou branche introuvable.', 404);
    const j = (await res.json()) as { content: { sha: string } };
    return j.content.sha;
  }
}
