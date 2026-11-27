import { Bell, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { markAlertsNotified, markAlertsRead } from '@/db/repo';
import type { Severity } from '@/lib/alerts';
import { useSettings } from './hooks';
import { useAlerts } from './useAlerts';

export const SEVERITY_ICON: Record<Severity, typeof Info> = {
  critical: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};
export const SEVERITY_CLASS: Record<Severity, string> = {
  critical: 'text-danger-foreground',
  warning: 'text-warn-foreground',
  info: 'text-muted-foreground',
};
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critique', warning: 'Attention', info: 'Info' };

/** Centre de notifications : badge + liste ; notifications navigateur optionnelles. */
export function NotificationBell({ className }: { className?: string }) {
  const { alerts, unread, notifiedKeys } = useAlerts();
  const settings = useSettings();
  const navigate = useNavigate();
  const sending = useRef(false);

  useEffect(() => {
    if (
      !settings.browserNotifications ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      sending.current
    )
      return;
    const fresh = alerts.filter((a) => a.severity !== 'info' && !notifiedKeys.has(a.key));
    if (!fresh.length) return;
    sending.current = true;
    for (const a of fresh.slice(0, 3)) {
      try {
        new Notification(`FilaTrack — ${a.title}`, { body: a.body, tag: a.key });
      } catch {
        /* navigateur sans notifications hors service worker (mobile) : ignoré */
      }
    }
    void markAlertsNotified(fresh).finally(() => {
      sending.current = false;
    });
  }, [alerts, notifiedKeys, settings.browserNotifications]);

  const count = unread.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label={count ? `Notifications : ${count} non lue(s)` : 'Notifications'}
        >
          <Bell aria-hidden />
          {count > 0 && (
            <span
              className="bg-destructive text-destructive-foreground absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-semibold"
              aria-hidden
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {alerts.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">Rien à signaler.</p>}
        {alerts.slice(0, 8).map((a) => {
          const Icon = SEVERITY_ICON[a.severity];
          const isUnread = unread.includes(a);
          return (
            <DropdownMenuItem
              key={a.key}
              className="items-start"
              onSelect={() => {
                void markAlertsRead([a]);
                navigate(a.link);
              }}
            >
              <Icon
                className={cn('mt-0.5', SEVERITY_CLASS[a.severity])}
                aria-label={SEVERITY_LABEL[a.severity]}
              />
              <span className="min-w-0 flex-1">
                <span className={cn('block', isUnread && 'font-semibold')}>{a.title}</span>
                <span className="text-muted-foreground block text-xs">{a.body}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {count > 0 && (
          <DropdownMenuItem onSelect={() => void markAlertsRead(unread)}>
            Tout marquer comme lu
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/alerts')}>
          Voir toutes les alertes{alerts.length > 8 ? ` (${alerts.length})` : ''}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
