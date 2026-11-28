import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDataMode, getDb } from '@/db/db';
import { buildAlerts, type Alert } from '@/lib/alerts';
import { isBackupDue } from '@/lib/backup';
import { useSettings } from './hooks';

export interface AlertsState {
  alerts: Alert[];
  unread: Alert[];
  readKeys: Set<string>;
  notifiedKeys: Set<string>;
}

/** Alertes calculées en direct à partir des données (rien n'est figé en base sauf l'état « lu »). */
export function useAlerts(): AlertsState {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [spools, rules, products, notes] = await Promise.all([
      db.spools.toArray(),
      db.alertRules.toArray(),
      db.products.toArray(),
      db.notifications.toArray(),
    ]);
    return { spools, rules, products, notes };
  }, []);
  return useMemo(() => {
    if (!data) return { alerts: [], unread: [], readKeys: new Set(), notifiedKeys: new Set() };
    const backupDue =
      getDataMode() !== 'demo' &&
      isBackupDue(settings.lastBackupAt, settings.backupReminderDays, new Date(), data.spools.length > 0);
    const alerts = buildAlerts({
      spools: data.spools,
      rules: data.rules,
      products: data.products,
      settings,
      now: new Date(),
      backupDue,
    });
    const readKeys = new Set(data.notes.filter((n) => n.readAt).map((n) => n.id));
    const notifiedKeys = new Set(data.notes.filter((n) => n.notifiedAt).map((n) => n.id));
    return { alerts, unread: alerts.filter((a) => !readKeys.has(a.key)), readKeys, notifiedKeys };
  }, [data, settings]);
}
