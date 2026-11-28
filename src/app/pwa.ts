import { toast } from 'sonner';

/** Enregistre le service worker (site publié uniquement) et propose les mises à jour. */
export async function registerPwa(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    onNeedRefresh() {
      toast.info('Nouvelle version de FilaTrack disponible.', {
        duration: Infinity,
        action: { label: 'Recharger', onClick: () => void update(true) },
      });
    },
    onOfflineReady() {
      toast.success('FilaTrack fonctionne maintenant hors ligne.');
    },
  });
}

/** Invite d'installation (Chrome / Edge / Android) mémorisée pour un bouton « Installer ». */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
export const canInstall = () => deferred !== null;
export function onInstallChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}
