import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useSettings } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { cloudClient, getGitHubToken, syncCloud } from '@/db/cloud';

export function lastSyncLabel(iso: string | null | undefined): string {
  return iso
    ? `synchro ${formatDistanceToNow(parseISO(iso), { locale: fr, addSuffix: true })}`
    : 'jamais synchronisé';
}

/** Lance une synchronisation et affiche le résultat. */
export async function runSync(silent = false): Promise<void> {
  const client = await cloudClient();
  if (!client) return;
  try {
    const r = await syncCloud(client);
    if (r.bambuNew)
      toast.info(
        `${r.bambuNew} impression(s) Bambu reçue(s)${r.bambuAuto ? `, ${r.bambuAuto} validée(s) automatiquement` : ''}.`,
        { action: { label: 'Voir', onClick: () => (location.hash = '#/inbox') } },
      );
    if (r.errors.length) toast.error(`Synchronisation partielle : ${r.errors[0]}`);
    else if (!silent || r.pulled || r.conflicts || r.records) {
      const parts = [
        r.pushed && `${r.pushed} envoyé(s)`,
        r.pulled && `${r.pulled} reçu(s)`,
        r.files && `${r.files} fichier(s)`,
        r.records && `${r.records} enregistrement(s) reçu(s)`,
        r.tables && `${r.tables} table(s) envoyée(s)`,
        r.conflicts && `${r.conflicts} conflit(s) fusionné(s)`,
      ].filter(Boolean);
      toast.success(parts.length ? `Données synchronisées : ${parts.join(', ')}.` : 'Tout est à jour.');
    }
  } catch (e) {
    toast.error(
      e instanceof Error ? `Synchronisation impossible : ${e.message}` : 'Synchronisation impossible.',
    );
  }
}

export function CloudSyncButton() {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  if (!getGitHubToken()) {
    return (
      <Button variant="ghost" asChild>
        <Link to="/settings#cloud">
          <CloudOff aria-hidden /> Synchro désactivée
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={busy}
      title={lastSyncLabel(settings.cloud.lastSyncAt)}
      onClick={async () => {
        setBusy(true);
        await runSync();
        setBusy(false);
      }}
    >
      <RefreshCw className={busy ? 'animate-spin' : undefined} aria-hidden /> Synchroniser
      <span className="text-muted-foreground hidden text-xs lg:inline">
        ({lastSyncLabel(settings.cloud.lastSyncAt)})
      </span>
    </Button>
  );
}
