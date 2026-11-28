import { Cloud, ExternalLink, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cloudClient, getGitHubToken, setGitHubToken } from '@/db/cloud';
import { saveSettings } from '@/db/repo';
import { lastSyncLabel, runSync } from '../projects/CloudSyncButton';

/** Réglages du dépôt GitHub privé qui stocke les projets (et plus tard l'historique Bambu). */
export function CloudSettings() {
  const settings = useSettings();
  const c = settings.cloud;
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(Boolean(getGitHubToken()));
  const [busy, setBusy] = useState(false);
  const save = (patch: Partial<typeof c>) => saveSettings({ cloud: { ...c, ...patch } });

  return (
    <Card id="cloud" className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-4" aria-hidden /> Synchronisation des projets (dépôt GitHub privé)
        </CardTitle>
        <CardDescription>
          Les projets, contacts et fichiers .3mf sont enregistrés dans <strong>ton</strong> dépôt privé pour
          les retrouver sur tous tes appareils. Tout fonctionne hors ligne : les modifications partent à la
          prochaine synchronisation. Désactivé tant qu’aucun token n’est saisi.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Propriétaire" htmlFor="gh-owner">
            <Input
              id="gh-owner"
              defaultValue={c.owner}
              key={`o${c.owner}`}
              onBlur={(e) => e.target.value.trim() && void save({ owner: e.target.value.trim() })}
            />
          </Field>
          <Field label="Dépôt (privé)" htmlFor="gh-repo">
            <Input
              id="gh-repo"
              defaultValue={c.repo}
              key={`r${c.repo}`}
              onBlur={(e) => e.target.value.trim() && void save({ repo: e.target.value.trim() })}
            />
          </Field>
          <Field label="Branche" htmlFor="gh-branch">
            <Input
              id="gh-branch"
              defaultValue={c.branch}
              key={`b${c.branch}`}
              onBlur={(e) => e.target.value.trim() && void save({ branch: e.target.value.trim() })}
            />
          </Field>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!token.trim()) return;
            setGitHubToken(token);
            setToken('');
            setHasToken(true);
            setBusy(true);
            try {
              const client = await cloudClient();
              const r = await client!.check();
              if (!r.private)
                toast.warning('Attention : ce dépôt est public. Utilise un dépôt privé pour tes données.');
              if (!r.canWrite)
                toast.warning('Token en lecture seule : les projets ne pourront pas être envoyés.');
              else toast.success('Accès au dépôt vérifié.');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Accès impossible.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label={
              hasToken ? 'Token GitHub (enregistré — saisir pour le remplacer)' : 'Token GitHub à grain fin'
            }
            htmlFor="gh-token"
            className="flex-1"
          >
            <Input
              id="gh-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
            />
          </Field>
          <Button type="submit" disabled={busy || !token.trim()}>
            Enregistrer et tester
          </Button>
          {hasToken && (
            <Button
              variant="outline"
              onClick={() => {
                setGitHubToken(null);
                setHasToken(false);
                toast.success('Token supprimé de ce navigateur.');
              }}
            >
              Oublier le token
            </Button>
          )}
        </form>
        {hasToken && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await runSync();
                setBusy(false);
              }}
            >
              Synchroniser maintenant
            </Button>
            <span className="text-muted-foreground text-sm">{lastSyncLabel(c.lastSyncAt)}</span>
            <div className="ml-auto flex items-center gap-2">
              <Switch id="gh-auto" checked={c.autoSync} onCheckedChange={(v) => void save({ autoSync: v })} />
              <Label htmlFor="gh-auto">Synchroniser à l’ouverture</Label>
            </div>
            <div className="flex w-full items-start gap-2">
              <Switch id="gh-all" checked={c.syncAll} onCheckedChange={(v) => void save({ syncAll: v })} />
              <Label htmlFor="gh-all" className="leading-snug font-normal">
                Synchroniser <strong>toutes les données</strong> (bobines, mouvements, impressions, pesées,
                catalogue, alertes, courses, champs et vues), pour utiliser FilaTrack sur plusieurs appareils.
                Les photos restent sur chaque appareil.
              </Label>
            </div>
          </div>
        )}
        <details className="bg-muted rounded-md p-3 text-sm">
          <summary className="cursor-pointer font-medium">Créer le token et comprendre les risques</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>
              GitHub → Settings → Developer settings →{' '}
              <a
                className="underline"
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer noopener"
              >
                Fine-grained tokens <ExternalLink className="inline size-3" aria-hidden />
              </a>
              .
            </li>
            <li>
              <em>Repository access</em> : <strong>Only select repositories</strong> → uniquement {c.owner}/
              {c.repo}.
            </li>
            <li>
              <em>Permissions</em> → Repository → <strong>Contents : Read and write</strong> (rien d’autre).
              Choisis une date d’expiration.
            </li>
          </ol>
          <p className="mt-2 flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Le token est stocké en clair dans ce navigateur (localStorage), jamais dans la base, les
            sauvegardes ou le code. Toute personne ayant accès à ce navigateur pourrait le lire : n’utilise
            pas d’ordinateur partagé, et révoque-le sur GitHub en cas de doute. Les données sont envoyées
            uniquement à api.github.com.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}
