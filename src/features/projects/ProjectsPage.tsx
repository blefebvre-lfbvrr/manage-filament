import { Archive, ArchiveRestore, ChevronDown, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getDb } from '@/db/db';
import { createProject } from '@/db/repo';
import { PRINT_STATUS_LABELS } from '@/lib/export';
import { formatDate, formatGrams, formatMoney, formatPercent } from '@/lib/format';
import { nowIso } from '@/lib/ids';
import type { Project } from '@/lib/schemas';
import { costByProject, periodRange, printCosts } from '@/lib/stats';

export function ProjectsPage() {
  const projects = useProjects() ?? [];
  const prints = usePrints() ?? [];
  const spools = useSpools(true) ?? [];
  const settings = useSettings();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const byId = useMemo(() => new Map(spools.map((s) => [s.id, s])), [spools]);
  const costs = useMemo(
    () => costByProject(prints, projects, byId, settings, periodRange('all', new Date())),
    [prints, projects, byId, settings],
  );
  const cur = settings.currency;
  const visible = projects.filter((p) => showArchived || !p.archived);
  const noProject = costs.find((c) => c.id === '__none__');

  return (
    <>
      <PageHeader
        title="Projets"
        description={`Regroupe les impressions, suis le budget et le coût cumulé${settings.electricity.enabled ? ' (matière + électricité)' : ' (matière)'}.`}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Nouveau projet
          </Button>
        }
      />
      <label className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />{' '}
        Afficher les projets archivés
      </label>
      <ul className="flex flex-col gap-3">
        {visible.map((p) => {
          const c = costs.find((x) => x.id === p.id) ?? { cost: 0, grams: 0, prints: 0, plannedG: 0 };
          const used = p.budget ? c.cost / p.budget : null;
          const list = prints
            .filter((x) => x.projectId === p.id)
            .sort(
              (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.legacyRow ?? 0) - (b.legacyRow ?? 0),
            );
          const planned = list.filter((x) => x.status === 'planned').length;
          const done = list.length - planned;
          const expanded = open === p.id;
          return (
            <li key={p.id}>
              <Card className={cn('p-4', p.archived && 'opacity-70')}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      {p.name}
                      {p.archived && <Badge tone="muted">Archivé</Badge>}
                    </h2>
                    {p.notes && <p className="text-muted-foreground text-sm">{p.notes}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Modifier ${p.name}`}
                    onClick={() => setEditing(p)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={p.archived ? `Désarchiver ${p.name}` : `Archiver ${p.name}`}
                    onClick={async () => {
                      await getDb().projects.update(p.id, { archived: !p.archived, updatedAt: nowIso() });
                      toast.success(p.archived ? 'Projet réactivé.' : 'Projet archivé.');
                    }}
                  >
                    {p.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  </Button>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground text-xs">Coût cumulé</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(c.cost, cur)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Filament</dt>
                    <dd className="font-semibold tabular-nums">{formatGrams(c.grams)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Impressions</dt>
                    <dd className="font-semibold tabular-nums">
                      {done} faite(s) · {planned} à faire
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Reste à imprimer</dt>
                    <dd className="font-semibold tabular-nums">{formatGrams(c.plannedG)}</dd>
                  </div>
                </dl>
                {p.budget != null && (
                  <div className="mt-3">
                    <div className="text-muted-foreground mb-1 flex justify-between text-xs">
                      <span>Budget {formatMoney(p.budget, cur)}</span>
                      <span
                        className={cn(used !== null && used > 1 && 'text-danger-foreground font-semibold')}
                      >
                        {used === null ? '' : `${formatPercent(used)} utilisé`}
                      </span>
                    </div>
                    <div
                      className="bg-muted h-2 overflow-hidden rounded-full"
                      role="meter"
                      aria-label={`Budget de ${p.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Math.min(1, used ?? 0) * 100)}
                    >
                      <div
                        className={cn(
                          'h-full rounded-full',
                          used !== null && used > 1
                            ? 'bg-destructive'
                            : used !== null && used > 0.8
                              ? 'bg-warn'
                              : 'bg-ok',
                        )}
                        style={{ width: `${Math.min(100, (used ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {list.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : p.id)}
                    >
                      <ChevronDown
                        className={cn('transition-transform', expanded && 'rotate-180')}
                        aria-hidden
                      />{' '}
                      {expanded ? 'Masquer' : 'Voir'} les impressions
                    </Button>
                    {expanded && (
                      <ul className="mt-2 flex flex-col divide-y text-sm">
                        {list.map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1">{x.name}</span>
                            <Badge
                              tone={
                                x.status === 'success'
                                  ? 'ok'
                                  : x.status === 'failed'
                                    ? 'danger'
                                    : x.status === 'planned'
                                      ? 'info'
                                      : 'muted'
                              }
                            >
                              {PRINT_STATUS_LABELS[x.status]}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {formatDate(x.date, settings.dateFormat)}
                            </span>
                            <span className="w-20 text-right tabular-nums">
                              {formatGrams(
                                x.status === 'planned'
                                  ? (x.estimatedG ?? 0)
                                  : x.usages.reduce((a, u) => a + u.grams, 0),
                              )}
                            </span>
                            <span className="text-muted-foreground w-20 text-right tabular-nums">
                              {x.status === 'planned'
                                ? ''
                                : formatMoney(printCosts(x, byId, settings).total, cur)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Card>
            </li>
          );
        })}
        {noProject && noProject.prints > 0 && (
          <li>
            <Card className="text-muted-foreground p-4 text-sm">
              Sans projet : {noProject.prints} impression(s), {formatGrams(noProject.grams)},{' '}
              {formatMoney(noProject.cost, cur)}.
            </Card>
          </li>
        )}
        {visible.length === 0 && (
          <li className="text-muted-foreground p-6 text-center text-sm">Aucun projet.</li>
        )}
      </ul>
      <ProjectDialog project={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ProjectDialog({ project, onClose }: { project: Project | 'new' | null; onClose: () => void }) {
  const p = project && project !== 'new' ? project : null;
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [prev, setPrev] = useState<typeof project>(null);
  if (project !== prev) {
    setPrev(project);
    setName(p?.name ?? '');
    setBudget(p?.budget == null ? '' : String(p.budget));
    setNotes(p?.notes ?? '');
  }
  return (
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{p ? `Modifier « ${p.name} »` : 'Nouveau projet'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const b = budget.trim() === '' ? null : Number(budget.replace(',', '.'));
            if (!name.trim() || (b !== null && (!Number.isFinite(b) || b < 0))) {
              toast.error('Nom requis et budget positif.');
              return;
            }
            if (p)
              await getDb().projects.update(p.id, {
                name: name.trim(),
                budget: b,
                notes: notes.trim() || null,
                updatedAt: nowIso(),
              });
            else {
              const created = await createProject(name);
              await getDb().projects.update(created.id, { budget: b, notes: notes.trim() || null });
            }
            toast.success('Projet enregistré.');
            onClose();
          }}
        >
          <Field label="Nom" htmlFor="pj-name">
            <Input id="pj-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Budget (€, facultatif)" htmlFor="pj-budget">
            <Input
              id="pj-budget"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="pj-notes">
            <Textarea id="pj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
