import {
  BellRing,
  Boxes,
  Database,
  Download,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  History,
  Library,
  Menu,
  Package,
  Printer,
  Scale,
  Settings,
  ShoppingCart,
  SquareStack,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { getGitHubToken } from '@/db/cloud';
import { runSync } from '@/features/projects/CloudSyncButton';

let syncedOnce = false;
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Toaster } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDataMode, getDb } from '@/db/db';
import { isBackupDue } from '@/lib/backup';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { useSettings } from './hooks';
import { useEffect } from 'react';
import { applyTheme } from './theme';

const NAV = [
  { to: '/', label: 'Inventaire', icon: Package, end: true, mobile: true },
  { to: '/ams', label: 'AMS', icon: SquareStack, mobile: true },
  { to: '/prints', label: 'Impressions', icon: Printer, mobile: true },
  { to: '/weigh', label: 'Pesée', icon: Scale, mobile: true },
  { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/projects', label: 'Projets', icon: FolderKanban },
  { to: '/alerts', label: 'Alertes', icon: BellRing },
  { to: '/shopping', label: 'Liste de courses', icon: ShoppingCart },
  { to: '/journal', label: 'Journal', icon: History },
  { to: '/catalog', label: 'Catalogue', icon: Library },
  { to: '/data', label: 'Import / Export', icon: Database },
  { to: '/settings', label: 'Paramètres', icon: Settings },
];

export function Layout() {
  const settings = useSettings();
  const navigate = useNavigate();
  const demo = getDataMode() === 'demo';
  const spoolCount = useLiveQuery(() => getDb().spools.count(), [], 0);
  const backupDue =
    isBackupDue(settings.lastBackupAt, settings.backupReminderDays, new Date(), spoolCount > 0) && !demo;

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  // Synchronisation des projets au chargement (si un token GitHub est configuré).
  const autoSync = settings.cloud.autoSync;
  useEffect(() => {
    if (!autoSync || demo || !getGitHubToken() || syncedOnce) return;
    syncedOnce = true;
    void runSync(true);
  }, [autoSync, demo]);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <aside className="bg-card hidden w-60 shrink-0 flex-col border-r md:flex print:hidden">
        <div className="flex items-center gap-2 py-4 pr-2 pl-5">
          <Boxes className="text-primary size-6" aria-hidden />
          <span className="text-lg font-bold">FilaTrack</span>
          <NotificationBell className="ml-auto" />
        </div>
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'hover:bg-accent flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-accent text-foreground' : 'text-muted-foreground',
                )
              }
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <p className="text-muted-foreground px-5 py-4 text-xs">
          Données stockées uniquement sur cet appareil.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="bg-background/95 sticky top-0 z-30 flex items-center gap-2 border-b px-4 py-1.5 backdrop-blur md:hidden print:hidden">
          <Boxes className="text-primary size-5" aria-hidden />
          <span className="font-bold">FilaTrack</span>
          <NotificationBell className="ml-auto" />
        </header>
        {demo && (
          <div
            role="status"
            className="bg-warn/15 text-warn-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm print:hidden"
          >
            <FlaskConical className="size-4" aria-hidden />
            <span>Mode démo : données fictives, tes vraies données ne sont pas touchées.</span>
            <Button
              variant="link"
              size="sm"
              className="text-warn-foreground h-auto p-0 underline"
              onClick={() => navigate('/settings')}
            >
              Quitter la démo
            </Button>
          </div>
        )}
        {backupDue && (
          <div
            role="status"
            className="bg-primary/10 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm print:hidden"
          >
            <Download className="size-4" aria-hidden />
            <span>
              {settings.lastBackupAt
                ? `Dernière sauvegarde il y a plus de ${settings.backupReminderDays} jours.`
                : 'Aucune sauvegarde pour l’instant.'}
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 underline"
              onClick={() => navigate('/data#backup')}
            >
              Sauvegarder maintenant
            </Button>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Navigation principale"
        className="bg-card fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <n.icon className="size-5" aria-hidden />
            <span className="truncate">{n.label}</span>
          </NavLink>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger className="text-muted-foreground flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium">
            <Menu className="size-5" aria-hidden />
            <span>Plus</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {NAV.filter((n) => !n.mobile).map((n) => (
              <DropdownMenuItem key={n.to} onSelect={() => navigate(n.to)}>
                <n.icon aria-hidden /> {n.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <Toaster richColors position="top-center" closeButton theme={settings.theme} />
    </div>
  );
}
