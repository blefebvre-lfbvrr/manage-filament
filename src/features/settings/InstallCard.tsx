import { Download } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canInstall, onInstallChange, promptInstall } from '@/app/pwa';

/** Installation de l'application (PWA) : bouton natif si le navigateur le propose, sinon la marche à suivre. */
export function InstallCard() {
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false);
  const standalone =
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application</CardTitle>
        <CardDescription>
          FilaTrack s’installe comme une application (écran d’accueil, fenêtre dédiée) et fonctionne hors
          ligne une fois ouvert une première fois. Version {__APP_VERSION__}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {standalone ? (
          <p>Application installée.</p>
        ) : installable ? (
          <Button
            className="self-start"
            onClick={async () => {
              if (await promptInstall()) toast.success('FilaTrack est installé.');
            }}
          >
            <Download aria-hidden /> Installer FilaTrack
          </Button>
        ) : (
          <ul className="text-muted-foreground list-disc pl-5">
            <li>Android / Chrome : menu ⋮ → « Installer l’application ».</li>
            <li>iPhone / iPad (Safari) : bouton Partager → « Sur l’écran d’accueil ».</li>
            <li>Ordinateur (Chrome, Edge) : icône d’installation dans la barre d’adresse.</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
