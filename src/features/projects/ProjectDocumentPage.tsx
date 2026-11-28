import { ArrowLeft, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { formatDate, formatGrams, formatMoney } from '@/lib/format';
import { formatDuration } from '@/lib/prints';
import { estimatedCost, projectCost, projectPlan, projectProgress, suggestedPrice } from '@/lib/projects';
import { averageCostPerGram } from '@/lib/stats';
import { useContacts } from './ProjectDialog';

/** Devis / récapitulatif sobre, à imprimer ou enregistrer en PDF depuis le navigateur. */
export function ProjectDocumentPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const type = params.get('type') === 'quote' ? 'quote' : 'summary';
  const project = useProjects()?.find((p) => p.id === id);
  const prints = usePrints() ?? [];
  const spools = useSpools(true) ?? [];
  const contacts = useContacts();
  const settings = useSettings();
  const byId = useMemo(() => new Map(spools.map((s) => [s.id, s])), [spools]);
  if (!project) return <p className="text-muted-foreground">Chargement…</p>;
  const cur = settings.currency;
  const contact = contacts.find((c) => c.id === project.contactId);
  const plan = projectPlan(project.parts);
  const cost = projectCost(project, prints, byId, settings);
  const est = estimatedCost(plan, averageCostPerGram(spools), project, settings);
  const price =
    project.pricing.finalPrice ??
    suggestedPrice(
      Math.max(cost.total, est.total),
      project.pricing.marginPct ?? settings.projects.defaultMarginPct,
      settings.projects.roundTo,
    );
  const progress = projectProgress(project, prints);
  const today = new Date().toISOString().slice(0, 10);
  const number = `${type === 'quote' ? 'D' : 'R'}-${today.replace(/-/g, '')}-${(project.code ?? project.id.slice(0, 4)).toUpperCase()}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${project.id}`}>
            <ArrowLeft aria-hidden /> Retour au projet
          </Link>
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer aria-hidden /> Imprimer / enregistrer en PDF
        </Button>
      </div>
      <article className="rounded-xl border bg-white p-8 text-sm text-black shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 flex justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{type === 'quote' ? 'Devis' : 'Récapitulatif de projet'}</h1>
            <p className="text-neutral-600">
              N° {number} · {formatDate(today, settings.dateFormat)}
            </p>
            {type === 'quote' && <p className="text-neutral-600">Valable 30 jours.</p>}
          </div>
          {!project.forSelf && (
            <div className="text-right">
              <p className="font-semibold">{contact?.name ?? 'Client'}</p>
              {contact?.contact && <p className="text-neutral-600">{contact.contact}</p>}
            </div>
          )}
        </header>
        <h2 className="text-lg font-semibold">{project.name}</h2>
        {project.description && (
          <p className="mb-4 whitespace-pre-wrap text-neutral-700">{project.description}</p>
        )}
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left">
              <th className="py-1">Pièce</th>
              <th className="py-1 text-right">Quantité</th>
              <th className="py-1 text-right">Plateaux</th>
              <th className="py-1 text-right">Filament</th>
            </tr>
          </thead>
          <tbody>
            {project.parts.map((p) => (
              <tr key={p.id} className="border-b border-neutral-300">
                <td className="py-1">{p.name}</td>
                <td className="py-1 text-right">{p.quantity}</td>
                <td className="py-1 text-right">{p.plates.length * p.quantity}</td>
                <td className="py-1 text-right">
                  {formatGrams(
                    p.plates.reduce((a, pl) => a + pl.filaments.reduce((b, f) => b + f.grams, 0), 0) *
                      p.quantity,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-neutral-600">
          Filament total : {formatGrams(plan.totalG)} · temps d’impression estimé :{' '}
          {formatDuration(plan.totalTimeS / 60)}
          {project.dueDate && ` · livraison prévue le ${formatDate(project.dueDate, settings.dateFormat)}`}
        </p>
        {type === 'summary' && (
          <section className="mt-6">
            <h3 className="font-semibold">Avancement et coûts</h3>
            <p>
              {progress.printedPlates}/{progress.totalPlates} plateau(x) imprimé(s)
              {progress.failed.length ? `, ${progress.failed.length} raté(s)` : ''}.
            </p>
            <p>
              Coût réel : {formatMoney(cost.total, cur)} (matière {formatMoney(cost.material, cur)},
              électricité {formatMoney(cost.electricity, cur)}, machine {formatMoney(cost.machine, cur)},
              main-d’œuvre {formatMoney(cost.labor, cur)}).
            </p>
          </section>
        )}
        {!project.forSelf && (
          <section className="mt-6 flex justify-end">
            <table className="min-w-64">
              <tbody>
                <tr className="border-t-2 border-neutral-800 text-base font-bold">
                  <td className="py-2">Total TTC</td>
                  <td className="py-2 text-right">{formatMoney(price, cur)}</td>
                </tr>
                {type === 'summary' && project.pricing.paidAmount != null && (
                  <tr>
                    <td className="py-1">Déjà réglé</td>
                    <td className="py-1 text-right">{formatMoney(project.pricing.paidAmount, cur)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
        <footer className="mt-8 text-xs text-neutral-500">Document généré par FilaTrack.</footer>
      </article>
    </div>
  );
}
