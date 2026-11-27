import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLocalState, usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Badge, Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRINT_STATUS_LABELS, printCost } from '@/lib/export';
import { formatDate, formatGrams, formatMoney } from '@/lib/format';
import type { PrintJob } from '@/lib/schemas';
import { matchesQuery } from '@/lib/text';
import { ColorSwatch } from '../inventory/SpoolBits';

const TONE = { success: 'ok', failed: 'danger', cancelled: 'muted', planned: 'info' } as const;

export function PrintsPage() {
  const prints = usePrints();
  const spools = useSpools(true);
  const projects = useProjects();
  const settings = useSettings();
  const [tab, setTab] = useLocalState<'done' | 'planned'>('prints.tab', 'done');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');

  const byId = useMemo(() => new Map((spools ?? []).map((s) => [s.id, s])), [spools]);
  const projectName = (id?: string | null) => projects?.find((p) => p.id === id)?.name ?? '';
  const list = useMemo(
    () =>
      (prints ?? [])
        .filter((p) => (tab === 'planned' ? p.status === 'planned' : p.status !== 'planned'))
        .filter((p) => !project || p.projectId === project)
        .filter((p) => matchesQuery(`${p.name} ${p.notes ?? ''} ${projectName(p.projectId)}`, query))
        .sort(
          (a, b) =>
            (b.date ?? '').localeCompare(a.date ?? '') ||
            (a.legacyRow ?? 0) - (b.legacyRow ?? 0) ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prints, tab, project, query, projects],
  );
  const done = (prints ?? []).filter((p) => p.status !== 'planned');
  const planned = (prints ?? []).filter((p) => p.status === 'planned');
  const consumed = done.reduce((a, p) => a + p.usages.reduce((b, u) => b + (u.spoolId ? u.grams : 0), 0), 0);
  const plannedG = planned.reduce((a, p) => a + (p.estimatedG ?? 0), 0);
  const cost = done.reduce((a, p) => a + printCost(p, byId), 0);

  return (
    <>
      <PageHeader
        title="Impressions"
        description="Historique importé et impressions planifiées. La saisie, l’import .3mf/.gcode et les déductions automatiques arrivent en phase 2."
      />
      <section aria-label="Résumé" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">Impressions</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{done.length}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">Filament consommé</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatGrams(consumed)}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">Coût matière</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(cost, settings.currency)}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">Reste à imprimer</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatGrams(plannedG)}</p>
          <p className="text-muted-foreground text-xs">{planned.length} planifiée(s)</p>
        </Card>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'done' | 'planned')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TabsList>
            <TabsTrigger value="done">Historique ({done.length})</TabsTrigger>
            <TabsTrigger value="planned">À imprimer ({planned.length})</TabsTrigger>
          </TabsList>
          <Input
            type="search"
            aria-label="Rechercher une impression"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-64"
          />
          <NativeSelect
            aria-label="Filtrer par projet"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="sm:max-w-56"
          >
            <option value="">Tous les projets</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {(['done', 'planned'] as const).map((t) => (
          <TabsContent key={t} value={t}>
            <PrintList
              prints={list}
              byId={byId}
              projectName={projectName}
              currency={settings.currency}
              dateFormat={settings.dateFormat}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function PrintList({
  prints,
  byId,
  projectName,
  currency,
  dateFormat,
}: {
  prints: PrintJob[];
  byId: Map<string, import('@/lib/schemas').Spool>;
  projectName: (id?: string | null) => string;
  currency: string;
  dateFormat: string;
}) {
  if (!prints.length)
    return <p className="text-muted-foreground p-6 text-center text-sm">Aucune impression.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {prints.map((p) => {
        const grams = p.usages.reduce((a, u) => a + u.grams, 0);
        return (
          <li key={p.id}>
            <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge tone={TONE[p.status]}>{PRINT_STATUS_LABELS[p.status]}</Badge>
                  {p.needsReview && (
                    <Badge tone="warn" title={p.reviewNote ?? undefined}>
                      <AlertTriangle className="size-3" aria-hidden /> À vérifier
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {[
                    formatDate(p.date, dateFormat) === '—' ? 'Date inconnue' : formatDate(p.date, dateFormat),
                    projectName(p.projectId),
                    p.durationMin
                      ? `${Math.floor(p.durationMin / 60)} h ${String(p.durationMin % 60).padStart(2, '0')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {p.reviewNote && <p className="text-warn-foreground text-xs">{p.reviewNote}</p>}
                {p.notes && <p className="text-muted-foreground text-xs">{p.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.usages.map((u, i) => {
                  const s = u.spoolId ? byId.get(u.spoolId) : undefined;
                  return s ? (
                    <Link
                      key={i}
                      to={`/spools/${s.id}`}
                      className="hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                    >
                      <ColorSwatch decorative hex={s.colorHex} name={s.colorName} size="sm" />
                      {s.code}
                      {u.role === 'relay' && ' (relais)'} · {formatGrams(u.grams)}
                    </Link>
                  ) : (
                    <span
                      key={i}
                      className="text-muted-foreground rounded-full border border-dashed px-2 py-0.5 text-xs"
                    >
                      Sans bobine · {formatGrams(u.grams)}
                    </span>
                  );
                })}
                <span className="text-sm font-semibold tabular-nums">
                  {p.status === 'planned' ? formatGrams(p.estimatedG) : formatGrams(grams)}
                </span>
                {p.status !== 'planned' && (
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatMoney(printCost(p, byId), currency)}
                  </span>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
