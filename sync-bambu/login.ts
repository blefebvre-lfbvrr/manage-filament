/**
 * npm run bambu-login — connexion interactive au compte Bambu Lab.
 * Affiche le token à coller dans les secrets GitHub (BAMBU_TOKEN, BAMBU_REGION).
 * Le mot de passe n'est ni affiché, ni enregistré.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { login, loginWithCode, loginWithTfa, sendEmailCode, type LoginResult, type Region } from './api.ts';
import { saveSecrets, SECRETS_FILE } from './secrets.ts';

const rl = createInterface({ input: stdin, output: stdout });

async function askHidden(question: string): Promise<string> {
  // Masque la saisie du mot de passe dans le terminal.
  const out = stdout as unknown as { write: (s: string) => boolean };
  const write = out.write.bind(out);
  stdout.write(question);
  out.write = (s: string) => (s.includes(question) ? write(s) : true);
  const answer = await rl.question('');
  out.write = write;
  stdout.write('\n');
  return answer;
}

async function main() {
  console.log('Connexion au cloud Bambu Lab (API non officielle).\n');
  const regionAnswer = (await rl.question('Région [global/china] (global) : ')).trim().toLowerCase();
  const region: Region = regionAnswer === 'china' ? 'china' : 'global';
  const email = (await rl.question('Email du compte Bambu Lab : ')).trim();
  const password = await askHidden('Mot de passe : ');

  let result: LoginResult = await login(region, email, password);
  if (result.kind === 'verifyCode') {
    console.log('\nUn code de vérification est envoyé par email.');
    let code = (await rl.question('Code reçu (laisser vide pour le redemander) : ')).trim();
    if (!code) {
      await sendEmailCode(region, email);
      code = (await rl.question('Nouveau code envoyé. Code : ')).trim();
    }
    result = await loginWithCode(region, email, code);
  } else if (result.kind === 'tfa') {
    const code = (await rl.question('Code de ton application d’authentification : ')).trim();
    result = await loginWithTfa(region, result.tfaKey, code);
  }
  if (result.kind !== 'token') throw new Error('Connexion non aboutie.');

  const days = result.expiresIn ? Math.round(result.expiresIn / 86400) : null;
  console.log('\n✅ Connecté.' + (days ? ` Le token expire dans environ ${days} jours.` : ''));
  console.log(
    '\nÀ coller dans GitHub → dépôt manage-filament-data (ou manage-filament) → Settings → Secrets and variables → Actions :',
  );
  console.log(`  BAMBU_REGION = ${region}`);
  console.log(`  BAMBU_TOKEN  = ${result.accessToken}`);
  console.log(
    '\n⚠️  Ce token donne accès à ton compte Bambu Lab : ne le partage pas, ne le colle dans aucun fichier du dépôt.',
  );

  const save = (
    await rl.question(
      `\nL’enregistrer aussi en local (${SECRETS_FILE}, ignoré par git) pour « npm run bambu-peek » ? [o/N] `,
    )
  )
    .trim()
    .toLowerCase();
  if (save === 'o' || save === 'oui') {
    saveSecrets({ token: result.accessToken, region, savedAt: new Date().toISOString() });
    console.log('Enregistré.');
  }
}

main()
  .catch((e: unknown) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
