import { CalendarClock, FlaskConical, Plus, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLocalState, usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Input, NativeSelect } from '@/components/ui/input';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import {
  EMPTY_PROJECT_FILTERS,
  filterProjects,
  projectCost,
  projectProgress,
  revenueByMonth,
  sortProjects,
  statusDef,
  type ProjectFilters,
  type ProjectSort,
} from '@/lib/projects';
import { CloudSyncButton } from './CloudSyncButton';
import { ProjectDialog, useContacts } from './ProjectDialog';

export function ProjectsPage() {
  const projects = useProjects() ?? [];
  const prints = usePrints() ?? [];
  const spools = useSpools(true) ?? [];
  const settings = useSettings();
  const contacts = useContacts();
  const [filters, setFilters] = useLocalState<ProjectFilters>('projects.filters', EMPTY_PROJECT_FILTERS);
  const [sort, setSort] = useLocalState<ProjectSort>('projects.sort', 'updated');
  const [creating, setCreating] = useState(false);
  const byId = useMemo(() => new Map(spools.map((s) => [s.id, s])), [spools]);
  const contactName = (id?: string | null) => contacts.find((c) => c.id === id)?.name ?? '';
  const f = { ...EMPTY_PROJECT_FILTERS, ...filters };
  const list = sortProjects(filterProjects(projects, f, contactName, new Date()), sort, settings);
  const set = <K extends keyof ProjectFilters>(k: K, v: ProjectFilters[K]) => setFilters({ ...f, [k]: v });
  const cur = settings.currency;

  const active = projects.filter((p) => !p.archived && !statusDef(p.status, settings).closed);
  const revenue = revenueByMonth(projects, prints, byId, settings);
  const thisMonth = revenue.find((r) => r.month === new Date().toISOString().slice(0, 7));
  const unpaid = projects.filter(
    (p) => !p.forSelf && !p.deletedAt && p.pricing.finalPrice != null && p.pricing.paymentStatus !== 'paid',
  );

  return (
    <>
      <PageHeader
        title="Projets"
        description="Tout ce que tu imprimes pour un objectif, pour toi ou pour d’autres : pièces, avancement, faisabilité, coûts et prix."
        actions={
          <>
            <CloudSyncButton />
            <Button variant="outline" asChild>
              <Link to="/feasibility">
                <FlaskConical aria-hidden /> Puis-je imprimer ça ?
              </Link>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden /> Nouveau projet
            </Button>
          </>
        }
      />
      <section aria-label="Résumé" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projets en cours" value={String(active.length)} />
        <Stat
          label="CA du mois (tiers)"
          value={formatMoney(thisMonth?.revenue ?? 0, cur)}
          hint={thisMonth ? `marge ${formatMoney(thisMonth.margin, cur)}` : undefined}
        />
        <Stat
          label="CA 12 derniers mois"
          value={formatMoney(
            revenue.slice(-12).reduce((a, r) => a + r.revenue, 0),
            cur,
          )}
          hint={`marge ${formatMoney(
            revenue.slice(-12).reduce((a, r) => a + r.margin, 0),
            cur,
          )}`}
        />
        <Stat
          label="À encaisser"
          value={formatMoney(
            unpaid.reduce((a, p) => a + (p.pricing.finalPrice ?? 0) - (p.pricing.paidAmount ?? 0), 0),
            cur,
          )}
          hint={`${unpaid.length} projet(s)`}
        />
      </section>

      <div role="group" aria-label="Filtres" className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Rechercher un projet"
          placeholder="Rechercher (nom, code, client, tag…)"
          value={f.query}
          onChange={(e) => set('query', e.target.value)}
          className="sm:max-w-72"
        />
        <NativeSelect
          aria-label="Statut"
          className="w-auto"
          value={f.status}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {settings.projectStatuses.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Pour qui"
          className="w-auto"
          value={f.forWhom}
          onChange={(e) => set('forWhom', e.target.value as ProjectFilters['forWhom'])}
        >
          <option value="">Pour tout le monde</option>
          <option value="self">Pour moi</option>
          <option value="others">Pour des tiers</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Client"
          className="w-auto"
          value={f.contactId}
          onChange={(e) => set('contactId', e.target.value)}
        >
          <option value="">Tous les contacts</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Période"
          className="w-auto"
          value={f.period}
          onChange={(e) => set('period', e.target.value as ProjectFilters['period'])}
        >
          <option value="">Toutes périodes</option>
          <option value="30d">Modifiés depuis 30 j</option>
          <option value="90d">Modifiés depuis 90 j</option>
          <option value="12m">Modifiés depuis 12 mois</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Trier par"
          className="w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as ProjectSort)}
        >
          <option value="updated">Récents</option>
          <option value="due">Échéance</option>
          <option value="status">Statut</option>
          <option value="name">Nom</option>
        </NativeSelect>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.showArchived}
            onChange={(e) => set('showArchived', e.target.checked)}
          />{' '}
          Archivés
        </label>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((p) => {
          const pr = projectProgress(p, prints);
          const cost = projectCost(p, prints, byId, settings);
          const st = statusDef(p.status, settings);
          const late = p.dueDate && !st.closed && p.dueDate < new Date().toISOString().slice(0, 10);
          return (
            <li key={p.id}>
              <Card
                className={cn(
                  'relative flex h-full flex-col gap-2 p-4 hover:shadow-md',
                  p.archived && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-2">
                  <Link
                    to={`/projects/${p.id}`}
                    className="min-w-0 flex-1 text-lg font-semibold after:absolute after:inset-0 hover:underline"
                  >
                    {p.name}
                    {p.code && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">[{p.code}]</span>
                    )}
                  </Link>
                  <Badge tone={st.closed ? 'muted' : st.reserves ? 'info' : 'neutral'}>{st.label}</Badge>
                </div>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3.5" aria-hidden />{' '}
                    {p.forSelf ? 'Pour moi' : contactName(p.contactId) || 'Tiers'}
                  </span>
                  {p.dueDate && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        late && 'text-danger-foreground font-semibold',
                      )}
                    >
                      <CalendarClock className="size-3.5" aria-hidden /> {late ? 'En retard : ' : 'Pour le '}
                      {formatDate(p.dueDate, settings.dateFormat)}
                    </span>
                  )}
                  <span>{p.parts.length} pièce(s)</span>
                </p>
                <div>
                  <div className="text-muted-foreground mb-1 flex justify-between text-xs">
                    <span>
                      {pr.printedPlates}/{pr.totalPlates || '?'} plateau(x)
                      {pr.failed.length > 0 && ` · ${pr.failed.length} raté(s)`}
                    </span>
                    <span>{formatPercent(pr.ratio)}</span>
                  </div>
                  <div
                    className="bg-muted h-2 overflow-hidden rounded-full"
                    role="meter"
                    aria-label={`Avancement de ${p.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pr.ratio * 100)}
                  >
                    <div className="bg-ok h-full rounded-full" style={{ width: `${pr.ratio * 100}%` }} />
                  </div>
                </div>
                <p className="mt-auto flex flex-wrap gap-x-4 text-sm">
                  <span>
                    Coût <strong className="tabular-nums">{formatMoney(cost.total, cur)}</strong>
                  </span>
                  {!p.forSelf && p.pricing.finalPrice != null && (
                    <span>
                      Prix <strong className="tabular-nums">{formatMoney(p.pricing.finalPrice, cur)}</strong>
                      {p.pricing.paymentStatus === 'paid'
                        ? ' · payé'
                        : p.pricing.paymentStatus === 'partial'
                          ? ' · acompte'
                          : ' · à payer'}
                    </span>
                  )}
                </p>
              </Card>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="text-muted-foreground col-span-full p-6 text-center text-sm">Aucun projet.</li>
        )}
      </ul>
      <ProjectDialog open={creating} onOpenChange={setCreating} />
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
