import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCheck, Droplets, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useCatalog, useSettings, useSpools } from '@/app/hooks';
import { SEVERITY_CLASS, SEVERITY_ICON } from '@/app/NotificationBell';
import { PageHeader } from '@/app/PageHeader';
import { useAlerts } from '@/app/useAlerts';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getDb } from '@/db/db';
import { deleteAlertRule, markAlertsRead, markDried, saveAlertRule } from '@/db/repo';
import { dryingDue, evaluateRules, PRODUCT_COLOR_SEP, ruleLabel, SCOPE_LABELS } from '@/lib/alerts';
import { distinctValues } from '@/lib/filters';
import { formatDate, formatGrams } from '@/lib/format';
import type { AlertRule } from '@/lib/schemas';
import { ColorSwatch } from '../inventory/SpoolBits';

export function AlertsPage() {
  const { alerts, unread } = useAlerts();
  const spools = useSpools() ?? [];
  const catalog = useCatalog();
  const settings = useSettings();
  const rules = useLiveQuery(
    async () => (await getDb().alertRules.toArray()).filter((r) => !r.deletedAt),
    [],
    [],
  );
  const [ruleDialog, setRuleDialog] = useState<AlertRule | 'new' | null>(null);
  const statuses = useMemo(() => evaluateRules(rules, spools, settings), [rules, spools, settings]);
  const drying = useMemo(
    () => dryingDue(spools, catalog?.products ?? [], settings, new Date()),
    [spools, catalog, settings],
  );

  return (
    <>
      <PageHeader
        title="Alertes"
        description="Bobines presque vides, stocks minimum, séchage et rappels. Les alertes disparaissent d’elles-mêmes quand la situation est réglée."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Alertes actives ({alerts.length})</CardTitle>
            {unread.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void markAlertsRead(unread)}>
                <CheckCheck aria-hidden /> Tout marquer comme lu
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">Rien à signaler 🎉</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {alerts.map((a) => {
                  const Icon = SEVERITY_ICON[a.severity];
                  const isUnread = unread.includes(a);
                  return (
                    <li key={a.key} className="flex items-start gap-3 py-2">
                      <Icon
                        className={cn('mt-0.5 size-5 shrink-0', SEVERITY_CLASS[a.severity])}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={a.link}
                          className={cn('hover:underline', isUnread && 'font-semibold')}
                          onClick={() => void markAlertsRead([a])}
                        >
                          {a.title}
                        </Link>
                        <p className="text-muted-foreground text-sm">{a.body}</p>
                      </div>
                      {isUnread && <Badge tone="info">Nouveau</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Stocks minimum</CardTitle>
              <CardDescription>
                Ex. « garder au moins 2 PLA Basic Noir ». Les bobines « à changer » ne comptent pas.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setRuleDialog('new')}>
              <Plus aria-hidden /> Règle
            </Button>
          </CardHeader>
          <CardContent>
            {statuses.length === 0 && rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune règle.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {rules.map((r) => {
                  const st = statuses.find((x) => x.rule.id === r.id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left hover:underline"
                        onClick={() => setRuleDialog(r)}
                      >
                        <span className="font-medium">{ruleLabel(r)}</span>{' '}
                        <span className="text-muted-foreground">({SCOPE_LABELS[r.scope].toLowerCase()})</span>
                        <span className="text-muted-foreground block text-xs">
                          Minimum :{' '}
                          {[
                            r.minSpools ? `${r.minSpools} bobine(s)` : null,
                            r.minGrams ? formatGrams(r.minGrams) : null,
                          ]
                            .filter(Boolean)
                            .join(' et ')}
                          {st && ` · en stock : ${st.spoolCount} bobine(s), ${formatGrams(st.grams)}`}
                        </span>
                      </button>
                      {!r.enabled ? (
                        <Badge tone="muted">Désactivée</Badge>
                      ) : st?.ok ? (
                        <Badge tone="ok">OK</Badge>
                      ) : (
                        <Badge tone="danger">Sous le minimum</Badge>
                      )}
                      <Switch
                        aria-label={`Activer la règle ${ruleLabel(r)}`}
                        checked={r.enabled}
                        onCheckedChange={(v) => void saveAlertRule({ ...r, enabled: v })}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Supprimer la règle ${ruleLabel(r)}`}
                        onClick={() => void deleteAlertRule(r.id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Séchage</CardTitle>
            <CardDescription>
              {settings.dryingReminderDays
                ? `Matériaux hygroscopiques (PETG, TPU, ABS…) ouverts depuis plus de ${settings.dryingReminderDays} jours sans séchage.`
                : 'Rappel désactivé dans les paramètres.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {drying.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun séchage à prévoir.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {drying.map((d) => {
                  const product = catalog?.products.find((p) => p.id === d.spool.catalogProductId);
                  return (
                    <li key={d.spool.id} className="flex flex-wrap items-center gap-2 py-2">
                      <ColorSwatch decorative hex={d.spool.colorHex} name={d.spool.colorName} />
                      <Link to={`/spools/${d.spool.id}`} className="min-w-0 flex-1 hover:underline">
                        <span className="font-medium">{d.spool.code}</span> {d.spool.productLine}{' '}
                        {d.spool.colorName}
                        <span className="text-muted-foreground block text-xs">
                          {d.since === 'unknown'
                            ? 'jamais séchée'
                            : `${d.since === 'dried' ? 'séchée' : 'ouverte'} le ${formatDate(d.since === 'dried' ? d.spool.lastDriedAt : d.spool.openedAt, settings.dateFormat)} (${d.days} j)`}
                          {product?.dryTempC
                            ? ` · conseil : ${product.dryTempC} °C pendant ${product.dryHours ?? '?'} h`
                            : ''}
                        </span>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await markDried(d.spool.id);
                          toast.success(`${d.spool.code} : séchage enregistré.`);
                        }}
                      >
                        <Droplets aria-hidden /> Séchée aujourd’hui
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <RuleDialog
        rule={ruleDialog}
        onClose={() => setRuleDialog(null)}
        options={{
          material: distinctValues(spools, (s) => s.material),
          productLine: distinctValues(
            [...spools.map((s) => s.productLine), ...(catalog?.products ?? []).map((p) => p.name)],
            (x) => x,
          ),
          color: distinctValues(spools, (s) => s.colorName),
          productColor: distinctValues(spools, (s) =>
            s.productLine && s.colorName ? `${s.productLine}${PRODUCT_COLOR_SEP}${s.colorName}` : null,
          ),
          spool: spools.map((s) => s.code),
        }}
      />
    </>
  );
}

function RuleDialog({
  rule,
  onClose,
  options,
}: {
  rule: AlertRule | 'new' | null;
  onClose: () => void;
  options: Record<AlertRule['scope'], string[]>;
}) {
  const r = rule && rule !== 'new' ? rule : null;
  const [scope, setScope] = useState<AlertRule['scope']>('productColor');
  const [value, setValue] = useState('');
  const [minSpools, setMinSpools] = useState('1');
  const [minGrams, setMinGrams] = useState('');
  const [prev, setPrev] = useState<typeof rule>(null);
  if (rule !== prev) {
    setPrev(rule);
    setScope(r?.scope ?? 'productColor');
    setValue(r?.value ?? '');
    setMinSpools(r?.minSpools == null ? (r ? '' : '1') : String(r.minSpools));
    setMinGrams(r?.minGrams == null ? '' : String(r.minGrams));
  }
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{r ? 'Modifier la règle' : 'Nouvelle règle de stock minimum'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ms = n(minSpools);
            const mg = n(minGrams);
            if (!value.trim()) return toast.error('Choisis ce que la règle surveille.');
            if ((ms === null || ms <= 0) && (mg === null || mg <= 0))
              return toast.error('Indique un nombre de bobines ou un poids minimum.');
            if ((ms !== null && !Number.isInteger(ms)) || (mg !== null && Number.isNaN(mg)))
              return toast.error('Valeurs invalides.');
            await saveAlertRule({
              id: r?.id,
              scope,
              value: value.trim(),
              minSpools: ms,
              minGrams: mg,
              enabled: r?.enabled ?? true,
            });
            toast.success('Règle enregistrée.');
            onClose();
          }}
        >
          <Field label="Surveiller" htmlFor="rule-scope">
            <NativeSelect
              id="rule-scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as AlertRule['scope']);
                setValue('');
              }}
            >
              {(Object.keys(SCOPE_LABELS) as AlertRule['scope'][]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={SCOPE_LABELS[scope]}
            htmlFor="rule-value"
            hint={scope === 'productColor' ? 'Format : Gamme|Couleur (ex. PLA Basic|Noir)' : undefined}
          >
            <Input
              id="rule-value"
              list="rule-values"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <datalist id="rule-values">
              {options[scope].map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bobines minimum" htmlFor="rule-spools">
              <Input
                id="rule-spools"
                inputMode="numeric"
                value={minSpools}
                onChange={(e) => setMinSpools(e.target.value)}
              />
            </Field>
            <Field label="ou poids minimum (g)" htmlFor="rule-grams">
              <Input
                id="rule-grams"
                inputMode="decimal"
                value={minGrams}
                onChange={(e) => setMinGrams(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
