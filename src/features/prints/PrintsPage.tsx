import {
  AlertTriangle,
  Copy,
  FileUp,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useLocalState, usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deletePrint, restorePrint, savePrint, unapplyPrintStock, type PrintInput } from '@/db/repo';
import { PRINT_STATUS_LABELS } from '@/lib/export';
import { printCosts } from '@/lib/stats';
import { formatDate, formatGrams, formatMoney } from '@/lib/format';
import { checkStock, formatDuration, totalGrams } from '@/lib/prints';
import type { PrintJob, Spool } from '@/lib/schemas';
import { matchesQuery } from '@/lib/text';
import { ColorSwatch } from '../inventory/SpoolBits';
import { PrintFormDialog, type PrintDraft } from './PrintFormDialog';
import { SlicerImportDialog } from './SlicerImportDialog';

const TONE = { success: 'ok', failed: 'danger', cancelled: 'muted', planned: 'info' } as const;

type FormState = { print?: PrintJob; draft?: PrintDraft; title?: string; apply?: boolean } | null;

export function PrintsPage() {
  const prints = usePrints();
  const spools = useSpools(true);
  const projects = useProjects();
  const settings = useSettings();
  const [tab, setTab] = useLocalState<'done' | 'planned'>('prints.tab', 'done');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [form, setForm] = useState<FormState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PrintJob | null>(null);
  // « ?new=<jeton> » (palette Ctrl+K) ouvre le formulaire, une fois par jeton.
  const [params] = useSearchParams();
  const [seenNew, setSeenNew] = useState<string | null>(null);
  const newToken = params.get('new');
  if (newToken && newToken !== seenNew) {
    setSeenNew(newToken);
    setForm({});
  }

  const byId = useMemo(() => new Map((spools ?? []).map((s) => [s.id, s])), [spools]);
  const projectName = (id?: string | null) => projects?.find((p) => p.id === id)?.name ?? '';
  const list = useMemo(
    () =>
      (prints ?? [])
        .filter((p) => (tab === 'planned' ? p.status === 'planned' : p.status !== 'planned'))
        .filter((p) => !project || p.projectId === project)
        .filter((p) =>
          matchesQuery(`${p.name} ${p.notes ?? ''} ${p.plate ?? ''} ${projectName(p.projectId)}`, query),
        )
        .sort((a, b) =>
          tab === 'planned'
            ? (a.legacyRow ?? 0) - (b.legacyRow ?? 0) || a.createdAt.localeCompare(b.createdAt)
            : (b.date ?? '').localeCompare(a.date ?? '') ||
              (b.legacyRow ?? 0) - (a.legacyRow ?? 0) ||
              b.createdAt.localeCompare(a.createdAt),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prints, tab, project, query, projects],
  );
  const done = (prints ?? []).filter((p) => p.status !== 'planned');
  const planned = (prints ?? []).filter((p) => p.status === 'planned');
  const consumed = done.reduce(
    (a, p) =>
      a + (p.stockApplied === false ? 0 : p.usages.reduce((b, u) => b + (u.spoolId ? u.grams : 0), 0)),
    0,
  );
  const plannedG = planned.reduce((a, p) => a + (p.estimatedG ?? totalGrams(p.usages)), 0);
  const costOf = (p: PrintJob) => printCosts(p, byId, settings);
  const cost = done.reduce((a, p) => a + (p.stockApplied === false ? 0 : costOf(p).total), 0);

  const strip = (p: PrintJob): PrintInput => {
    const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, stockApplied: _s, ...rest } = p;
    return rest;
  };

  const actions = {
    edit: (p: PrintJob) => setForm({ print: p }),
    launch: (p: PrintJob) =>
      setForm({
        print: { ...p, status: 'success', date: new Date().toISOString().slice(0, 10) },
        title: `Imprimer « ${p.name} »`,
        apply: true,
      }),
    duplicate: (p: PrintJob) =>
      setForm({
        draft: { ...strip(p), legacyRow: null, needsReview: false, reviewNote: null, photoIds: [] },
        title: 'Dupliquer l’impression',
      }),
    unapply: async (p: PrintJob) => {
      const n = await unapplyPrintStock(p.id);
      toast.success(n ? 'Déduction annulée : le filament est rendu aux bobines.' : 'Rien à annuler.', {
        action: { label: 'Rétablir', onClick: () => void savePrint({ ...strip(p), id: p.id }) },
      });
    },
    reapply: async (p: PrintJob) => {
      await savePrint({ ...strip(p), id: p.id });
      toast.success('Consommation de nouveau déduite.');
    },
  };

  return (
    <>
      <PageHeader
        title="Impressions"
        description="Historique, file d’attente et déductions automatiques du stock."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp aria-hidden /> Importer .3mf / .gcode
            </Button>
            <Button onClick={() => setForm({ draft: tab === 'planned' ? { status: 'planned' } : undefined })}>
              <Plus aria-hidden /> Nouvelle impression
            </Button>
          </>
        }
      />
      <section aria-label="Résumé" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Impressions" value={String(done.length)} />
        <Stat label="Filament déduit" value={formatGrams(consumed)} />
        <Stat
          label={settings.electricity.enabled ? 'Coût (matière + élec.)' : 'Coût matière'}
          value={formatMoney(cost, settings.currency)}
        />
        <Stat
          label="Reste à imprimer"
          value={formatGrams(plannedG)}
          hint={`${planned.length} planifiée(s)`}
        />
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
            {list.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                {t === 'planned' ? 'File d’attente vide.' : 'Aucune impression.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((p) => (
                  <li key={p.id}>
                    <PrintItem
                      p={p}
                      byId={byId}
                      projectName={projectName(p.projectId)}
                      currency={settings.currency}
                      costOf={costOf}
                      dateFormat={settings.dateFormat}
                      actions={actions}
                      onDelete={() => setToDelete(p)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <PrintFormDialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        print={form?.print}
        draft={form?.draft}
        title={form?.title}
        applyStockDefault={form?.apply}
      />
      <SlicerImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        destructive
        title={`Supprimer « ${toDelete?.name} » ?`}
        description={toDelete?.stockApplied ? 'Le filament déduit sera rendu aux bobines.' : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!toDelete) return;
          const id = toDelete.id;
          await deletePrint(id);
          toast.success('Impression supprimée.', {
            action: { label: 'Annuler', onClick: () => void restorePrint(id) },
          });
        }}
      />
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </Card>
  );
}

function PrintItem({
  p,
  byId,
  projectName,
  currency,
  costOf,
  dateFormat,
  actions,
  onDelete,
}: {
  p: PrintJob;
  byId: Map<string, Spool>;
  projectName: string;
  currency: string;
  costOf: (p: PrintJob) => { material: number; energy: number; total: number };
  dateFormat: string;
  actions: Record<
    'edit' | 'launch' | 'duplicate' | 'unapply' | 'reapply',
    (p: PrintJob) => void | Promise<void>
  >;
  onDelete: () => void;
}) {
  const grams = totalGrams(p.usages);
  const notDeducted =
    p.status !== 'planned' && p.stockApplied === false && p.usages.some((u) => u.spoolId && u.grams > 0);
  // Vérification avant impression : les bobines prévues pour une impression planifiée suffisent-elles ?
  const short =
    p.status === 'planned' ? checkStock(p.usages, [...byId.values()]).filter((c) => c.shortG > 0) : [];
  return (
    <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{p.name}</span>
          <Badge tone={TONE[p.status]}>
            {PRINT_STATUS_LABELS[p.status]}
            {p.status === 'failed' && p.failedAtPercent != null ? ` à ${p.failedAtPercent} %` : ''}
          </Badge>
          {notDeducted && <Badge tone="muted">Non déduite</Badge>}
          {short.length > 0 && (
            <Badge
              tone="warn"
              title={short.map((c) => `${c.code} : il manque ${formatGrams(c.shortG)}`).join(' · ')}
            >
              <AlertTriangle className="size-3" aria-hidden /> Stock insuffisant (
              {short.map((c) => `${c.code} −${formatGrams(c.shortG)}`).join(', ')})
            </Badge>
          )}
          {p.needsReview && (
            <Badge tone="warn" title={p.reviewNote ?? undefined}>
              <AlertTriangle className="size-3" aria-hidden /> À vérifier
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {[
            formatDate(p.date, dateFormat) === '—'
              ? p.status === 'planned'
                ? null
                : 'Date inconnue'
              : formatDate(p.date, dateFormat),
            projectName,
            p.plate,
            p.durationMin ? formatDuration(p.durationMin) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {p.reviewNote && <p className="text-warn-foreground text-xs">{p.reviewNote}</p>}
        {p.notes && <p className="text-muted-foreground line-clamp-2 text-xs">{p.notes}</p>}
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
              {u.slicerType ?? 'Sans bobine'} · {formatGrams(u.grams)}
            </span>
          );
        })}
        <span className="text-sm font-semibold tabular-nums">
          {p.status === 'planned' ? formatGrams(p.estimatedG ?? grams) : formatGrams(grams)}
        </span>
        {p.status !== 'planned' && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatMoney(costOf(p).total, currency)}
          </span>
        )}
        {p.status === 'planned' && (
          <Button size="sm" onClick={() => void actions.launch(p)}>
            <Play aria-hidden /> Imprimer
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${p.name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void actions.edit(p)}>
              <Pencil aria-hidden /> Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void actions.duplicate(p)}>
              <Copy aria-hidden /> Dupliquer
            </DropdownMenuItem>
            {p.stockApplied && (
              <DropdownMenuItem onSelect={() => void actions.unapply(p)}>
                <Undo2 aria-hidden /> Annuler la déduction
              </DropdownMenuItem>
            )}
            {notDeducted && (
              <DropdownMenuItem onSelect={() => void actions.reapply(p)}>
                <RotateCcw aria-hidden /> Déduire du stock
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 aria-hidden /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
