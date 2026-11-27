import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocalState, usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { getDb } from '@/db/db';
import { saveSettings } from '@/db/repo';
import { distinctValues } from '@/lib/filters';
import { formatCostPerGram, formatDate, formatGrams, formatMoney, formatPercent } from '@/lib/format';
import { spoolLevel } from '@/lib/spool';
import {
  applyFilters,
  averageCostPerGram,
  consumptionSeries,
  costByProject,
  defaultBucket,
  forecasts,
  inStock,
  PERIOD_LABELS,
  periodRange,
  spendingSeries,
  stockByColor,
  stockByMaterial,
  successRate,
  topFilaments,
  type Bucket,
  type Period,
} from '@/lib/stats';
import { ColorSwatch, LevelBadge, StockBar } from '../inventory/SpoolBits';
import { ChartCard, ColumnChart, RowChart } from './charts';

type WidgetId =
  | 'kpis'
  | 'consumption'
  | 'stockMaterial'
  | 'stockColor'
  | 'forecast'
  | 'lowStock'
  | 'spending'
  | 'projects'
  | 'topFilaments';

export const WIDGETS: { id: WidgetId; label: string; wide?: boolean }[] = [
  { id: 'kpis', label: 'Indicateurs clés', wide: true },
  { id: 'consumption', label: 'Consommation dans le temps', wide: true },
  { id: 'stockMaterial', label: 'Stock par matériau' },
  { id: 'stockColor', label: 'Stock par couleur' },
  { id: 'forecast', label: 'Prévision de rupture' },
  { id: 'lowStock', label: 'Bobines à surveiller' },
  { id: 'spending', label: 'Dépenses par mois' },
  { id: 'projects', label: 'Coût par projet' },
  { id: 'topFilaments', label: 'Filaments les plus utilisés' },
];

export function widgetOrder(saved: string[]): WidgetId[] {
  const ids = WIDGETS.map((w) => w.id);
  return [
    ...(saved.filter((id) => ids.includes(id as WidgetId)) as WidgetId[]),
    ...ids.filter((id) => !saved.includes(id)),
  ];
}

export function DashboardPage() {
  const spoolsAll = useSpools();
  const printsAll = usePrints();
  const projects = useProjects() ?? [];
  const movementsAll = useLiveQuery(() => getDb().movements.toArray(), [], []);
  const settings = useSettings();
  const [period, setPeriod] = useLocalState<Period>('dashboard.period', '90d');
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [material, setMaterial] = useLocalState('dashboard.material', '');
  const [projectId, setProjectId] = useLocalState('dashboard.project', '');
  const [customize, setCustomize] = useState(false);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => periodRange(period, now), [period, now]);
  const b = bucket ?? defaultBucket(period);
  const data = useMemo(
    () =>
      applyFilters(
        { spools: spoolsAll ?? [], movements: movementsAll, prints: printsAll ?? [] },
        { material, projectId },
      ),
    [spoolsAll, movementsAll, printsAll, material, projectId],
  );
  const byId = useMemo(() => new Map((spoolsAll ?? []).map((s) => [s.id, s])), [spoolsAll]);

  const cur = settings.currency;
  const consumption = useMemo(
    () => consumptionSeries(data.movements, byId, range, b),
    [data.movements, byId, range, b],
  );
  const spending = useMemo(() => spendingSeries(data.spools, range), [data.spools, range]);
  const materials = useMemo(() => stockByMaterial(data.spools), [data.spools]);
  const colors = useMemo(() => stockByColor(data.spools), [data.spools]);
  const top = useMemo(() => topFilaments(data.movements, byId, range), [data.movements, byId, range]);
  const projectCosts = useMemo(
    () => costByProject(data.prints, projects, byId, settings, range),
    [data.prints, projects, byId, settings, range],
  );
  const rate = useMemo(() => successRate(data.prints, range), [data.prints, range]);
  const fc = useMemo(
    () => forecasts(data.spools, data.movements, now, settings.forecastWindowDays),
    [data.spools, data.movements, now, settings.forecastWindowDays],
  );
  const stock = inStock(data.spools);
  const stockG = stock.reduce((a, s) => a + s.remainingG, 0);
  const stockValue = materials.reduce((a, m) => a + m.value, 0);
  const consumed = consumption.reduce((a, p) => a + p.value, 0);
  const consumedCost = consumption.reduce((a, p) => a + p.extra, 0);
  const spent = spending.reduce((a, p) => a + p.value, 0);
  const watch = data.spools
    .filter((s) => !s.deletedAt && s.status !== 'archived' && spoolLevel(s, settings) !== 'ok')
    .sort((a, b2) => a.remainingG - b2.remainingG);

  const order = widgetOrder(settings.dashboard.order);
  const hidden = new Set(settings.dashboard.hidden);

  if (!spoolsAll || !printsAll) return <p className="text-muted-foreground">Chargement…</p>;

  const render: Record<WidgetId, () => ReactNode> = {
    kpis: () => (
      <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Bobines en stock"
          value={String(stock.length)}
          hint={`${data.spools.filter((s) => s.status === 'sealed').length} neuves scellées`}
        />
        <Kpi label="Filament en stock" value={formatGrams(stockG, 'kg')} />
        <Kpi label="Valeur du stock" value={formatMoney(stockValue, cur)} />
        <Kpi
          label="Consommé"
          value={formatGrams(consumed)}
          hint={`${PERIOD_LABELS[period].toLowerCase()} · ${formatMoney(consumedCost, cur)}`}
        />
        <Kpi label="Coût moyen" value={formatCostPerGram(averageCostPerGram(data.spools), cur)} />
        <Kpi
          label="Taux de réussite"
          value={rate.rate === null ? '—' : formatPercent(rate.rate)}
          hint={`${rate.success} réussie(s), ${rate.failed} ratée(s), ${rate.cancelled} annulée(s)`}
        />
        <Kpi label="Dépenses" value={formatMoney(spent, cur)} hint={PERIOD_LABELS[period].toLowerCase()} />
        <Kpi
          label="À surveiller"
          value={String(watch.length)}
          hint="bientôt vides, à changer ou vides"
          tone={watch.length ? 'warn' : undefined}
        />
      </section>
    ),
    consumption: () => (
      <ChartCard
        title="Consommation"
        description={`${formatGrams(consumed)} sur la période · ${formatMoney(consumedCost, cur)} de matière`}
        empty={consumed === 0}
        actions={
          <NativeSelect
            aria-label="Regrouper par"
            className="h-8 w-auto text-xs"
            value={b}
            onChange={(e) => setBucket(e.target.value as Bucket)}
          >
            <option value="day">Par jour</option>
            <option value="week">Par semaine</option>
            <option value="month">Par mois</option>
          </NativeSelect>
        }
        table={{
          headers: ['Période', 'Consommé', 'Coût'],
          rows: consumption.map((p) => [p.label, formatGrams(p.value), formatMoney(p.extra, cur)]),
        }}
      >
        <ColumnChart
          data={consumption}
          format={(v) => `${Math.round(v)} g`}
          tooltipLines={(d) => [formatGrams(d.value), formatMoney(d.extra, cur)]}
        />
      </ChartCard>
    ),
    stockMaterial: () => (
      <ChartCard
        title="Stock par matériau"
        empty={!materials.length}
        table={{
          headers: ['Matériau', 'Stock', 'Bobines', 'Valeur'],
          rows: materials.map((m) => [m.label, formatGrams(m.grams), m.count, formatMoney(m.value, cur)]),
        }}
      >
        <RowChart
          data={materials.map((m) => ({ ...m, value: m.grams }))}
          labelWidth={80}
          format={(v) => formatGrams(v, 'kg')}
          tooltipLines={(d) => [formatGrams(d.grams), `${d.count} bobine(s)`, formatMoney(d.value, cur)]}
        />
      </ChartCard>
    ),
    stockColor: () => (
      <ChartCard
        title="Stock par couleur"
        description="Avec la couleur réelle des bobines."
        empty={!colors.length}
        table={{
          headers: ['Couleur', 'Stock', 'Bobines'],
          rows: colors.map((c) => [c.label, formatGrams(c.grams), c.count]),
        }}
      >
        <RowChart
          data={colors.map((c) => ({ ...c, value: c.grams }))}
          realColors
          labelWidth={130}
          format={(v) => formatGrams(v, 'kg')}
          tooltipLines={(d) => [formatGrams(d.grams), `${d.count} bobine(s)`]}
        />
      </ChartCard>
    ),
    spending: () => (
      <ChartCard
        title="Dépenses par mois"
        description="Prix des bobines + frais de port, selon la date d’achat."
        empty={spent === 0}
        table={{
          headers: ['Mois', 'Dépenses', 'Bobines'],
          rows: spending.map((p) => [p.label, formatMoney(p.value, cur), p.extra]),
        }}
      >
        <ColumnChart
          data={spending}
          format={(v) => `${Math.round(v)} €`}
          tooltipLines={(d) => [formatMoney(d.value, cur), `${d.extra} bobine(s)`]}
        />
      </ChartCard>
    ),
    projects: () => (
      <ChartCard
        title="Coût par projet"
        description={
          settings.electricity.enabled
            ? 'Matière + électricité.'
            : 'Coût matière (électricité désactivée dans les paramètres).'
        }
        empty={!projectCosts.some((p) => p.cost > 0)}
        actions={
          <Button variant="link" size="sm" asChild>
            <Link to="/projects">Projets</Link>
          </Button>
        }
        table={{
          headers: ['Projet', 'Coût', 'Budget', 'Filament', 'Impressions', 'Reste à imprimer'],
          rows: projectCosts.map((p) => [
            p.name,
            formatMoney(p.cost, cur),
            p.budget == null ? '—' : formatMoney(p.budget, cur),
            formatGrams(p.grams),
            p.prints,
            formatGrams(p.plannedG),
          ]),
        }}
      >
        <RowChart
          data={projectCosts.filter((p) => p.cost > 0).map((p) => ({ ...p, label: p.name, value: p.cost }))}
          labelWidth={130}
          format={(v) => `${Math.round(v)} €`}
          tooltipLines={(d) => [
            formatMoney(d.cost, cur) + (d.budget != null ? ` / budget ${formatMoney(d.budget, cur)}` : ''),
            formatGrams(d.grams),
            `${d.prints} impression(s)`,
          ]}
        />
      </ChartCard>
    ),
    topFilaments: () => (
      <ChartCard
        title="Filaments les plus utilisés"
        empty={!top.length}
        table={{
          headers: ['Filament', 'Consommé', 'Coût'],
          rows: top.map((t) => [t.label, formatGrams(t.grams), formatMoney(t.value, cur)]),
        }}
      >
        <RowChart
          data={top.map((t) => ({ ...t, value: t.grams }))}
          realColors
          labelWidth={150}
          format={(v) => `${Math.round(v)} g`}
          tooltipLines={(d) => [formatGrams(d.grams), formatMoney(d.value, cur)]}
        />
      </ChartCard>
    ),
    forecast: () => (
      <Card>
        <CardHeader>
          <CardTitle>Prévision de rupture</CardTitle>
          <p className="text-muted-foreground text-sm">
            D’après la consommation moyenne des {settings.forecastWindowDays} derniers jours.
          </p>
        </CardHeader>
        <CardContent>
          {fc.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Pas de consommation récente : impossible d’estimer.
            </p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {fc.slice(0, 8).map((f) => {
                const s = byId.get(f.spoolId)!;
                return (
                  <li key={f.spoolId} className="flex items-center gap-3 py-2">
                    <ColorSwatch decorative hex={s.colorHex} name={s.colorName} />
                    <Link
                      to={`/spools/${s.id}`}
                      className="text-primary min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {s.code}{' '}
                      <span className="text-muted-foreground font-normal">
                        {s.productLine} {s.colorName}
                      </span>
                    </Link>
                    <span className="text-right tabular-nums">
                      <span
                        className={cn('block font-semibold', f.daysLeft <= 14 && 'text-danger-foreground')}
                      >
                        {f.daysLeft === 0 ? 'aujourd’hui' : `≈ ${f.daysLeft} j`}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {formatDate(f.date.toISOString(), settings.dateFormat)} · {formatGrams(f.avgPerDayG)}
                        /j
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    lowStock: () => (
      <Card>
        <CardHeader>
          <CardTitle>Bobines à surveiller ({watch.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {watch.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Tout est au-dessus des seuils.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {watch.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <ColorSwatch decorative hex={s.colorHex} name={s.colorName} />
                  <Link
                    to={`/spools/${s.id}`}
                    className="text-primary min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {s.code}{' '}
                    <span className="text-muted-foreground font-normal">
                      {s.productLine} {s.colorName}
                    </span>
                  </Link>
                  <StockBar spool={s} settings={settings} className="w-24" />
                  <LevelBadge level={spoolLevel(s, settings)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Stock, consommation, coûts et prévisions."
        actions={
          <Button variant="outline" onClick={() => setCustomize(true)}>
            <Settings2 aria-hidden /> Personnaliser
          </Button>
        }
      />
      <div role="group" aria-label="Filtres" className="mb-4 flex flex-wrap gap-2">
        <NativeSelect
          aria-label="Période"
          className="w-auto"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            setBucket(null);
          }}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Matériau"
          className="w-auto"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
        >
          <option value="">Tous les matériaux</option>
          {distinctValues(spoolsAll, (s) => s.material).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Projet"
          className="w-auto"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Tous les projets</option>
          <option value="__none__">Sans projet</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {order
          .filter((id) => !hidden.has(id))
          .map((id) => (
            <div
              key={id}
              className={cn('min-w-0', WIDGETS.find((w) => w.id === id)?.wide && 'lg:col-span-2')}
            >
              {render[id]()}
            </div>
          ))}
      </div>
      <CustomizeDialog open={customize} onOpenChange={setCustomize} order={order} hidden={hidden} />
    </>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', tone === 'warn' && 'text-warn-foreground')}>
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </Card>
  );
}

function CustomizeDialog({
  open,
  onOpenChange,
  order,
  hidden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: WidgetId[];
  hidden: Set<string>;
}) {
  const [list, setList] = useState(order);
  const [off, setOff] = useState(hidden);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setList(order);
      setOff(new Set(hidden));
    }
  }
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personnaliser le tableau de bord</DialogTitle>
          <DialogDescription>
            Affiche, masque et réordonne les widgets. La disposition est enregistrée (et incluse dans les
            sauvegardes).
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col divide-y rounded-md border">
          {list.map((id, i) => {
            const w = WIDGETS.find((x) => x.id === id)!;
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2">
                <Checkbox
                  id={`w-${id}`}
                  checked={!off.has(id)}
                  onCheckedChange={(v) =>
                    setOff((s) => {
                      const n = new Set(s);
                      if (v === true) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                  }
                />
                <label htmlFor={`w-${id}`} className="flex-1 text-sm">
                  {w.label}
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Monter ${w.label}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descendre ${w.label}`}
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={async () => {
              await saveSettings({ dashboard: { order: [], hidden: [] } });
              onOpenChange(false);
            }}
          >
            Disposition par défaut
          </Button>
          <Button
            onClick={async () => {
              await saveSettings({ dashboard: { order: list, hidden: [...off] } });
              onOpenChange(false);
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
