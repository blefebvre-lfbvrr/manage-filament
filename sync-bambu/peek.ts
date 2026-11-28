/**
 * npm run bambu-peek — affiche tes 5 dernières impressions, BRUTES, telles que le cloud les renvoie,
 * pour valider l'accès et découvrir la structure réelle avant d'écrire la normalisation.
 * Par défaut, les identifiants (numéro de série, uid, URL signées…) sont masqués : tu peux coller la sortie.
 * Options : --raw (sans masquage, à ne pas partager), --limit=N.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTasks, redact } from './api.ts';
import { loadSecrets } from './secrets.ts';

async function main() {
  const secrets = loadSecrets();
  if (!secrets)
    throw new Error('Aucun token : lance d’abord « npm run bambu-login » (ou définis BAMBU_TOKEN).');
  const raw = process.argv.includes('--raw');
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 5);
  const data = await getTasks(secrets.region, secrets.token, limit);
  const shown = raw ? data : redact(data);
  const dir = fileURLToPath(new URL('./out/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}tasks-sample${raw ? '-RAW' : ''}.json`;
  writeFileSync(file, JSON.stringify(shown, null, 2));
  console.log(JSON.stringify(shown, null, 2));
  console.log(`\nÉcrit dans ${file}${raw ? ' (NON masqué : ne pas partager)' : ' (identifiants masqués)'}.`);
}

main().catch((e: unknown) => {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
