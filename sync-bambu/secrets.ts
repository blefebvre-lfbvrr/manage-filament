import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Region } from './api.ts';

/** Fichier local (ignoré par git) pour réutiliser le token en local. Jamais commité. */
export const SECRETS_FILE = fileURLToPath(new URL('./.secrets.json', import.meta.url));

export interface Secrets {
  token: string;
  region: Region;
  savedAt: string;
}

export function loadSecrets(): Secrets | null {
  const envToken = process.env.BAMBU_TOKEN;
  if (envToken)
    return {
      token: envToken,
      region: process.env.BAMBU_REGION === 'china' ? 'china' : 'global',
      savedAt: 'env',
    };
  if (!existsSync(SECRETS_FILE)) return null;
  return JSON.parse(readFileSync(SECRETS_FILE, 'utf8')) as Secrets;
}

export function saveSecrets(s: Secrets) {
  writeFileSync(SECRETS_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  try {
    chmodSync(SECRETS_FILE, 0o600);
  } catch {
    /* Windows */
  }
}
