import {
  Archive,
  ArrowLeft,
  FileDown,
  FileText,
  FileUp,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { downloadText } from '@/app/download';
import { usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { addProjectPart, deleteProject, saveProject, setReservations, updateProject } from '@/db/repo';
import { PRINT_STATUS_LABELS } from '@/lib/export';
import { formatDate, formatGrams, formatMoney, formatPercent } from '@/lib/format';
import { formatDuration } from '@/lib/prints';
import {
  actualConsumption,
  compareConsumption,
  estimatedCost,
  partPlates,
  platesFromSliced,
  projectCost,
  projectPlan,
  projectProgress,
  realMargin,
  remainingPlan,
  statusDef,
  suggestedPrice,
} from '@/lib/projects';
import { PAYMENT_STATUSES, type PartFilament, type Project, type ProjectPart } from '@/lib/schemas';
import { normalizeSlicerType } from '@/lib/slicer/match';
import { averageCostPerGram } from '@/lib/stats';
import { ColorSwatch } from '../inventory/SpoolBits';
import { PrintFormDialog } from '../prints/PrintFormDialog';
import { readSlicedFile } from '../prints/SlicerImportDialog';
import { FeasibilityPanel } from './FeasibilityPanel';
import { ProjectDialog, useContacts } from './ProjectDialog';

const PAYMENT_LABELS: Record<(typeof PAYMENT_STATUSES)[number], string> = {
  unpaid: 'À payer',
  partial: 'Acompte versé',
  paid: 'Payé',
};

export function ProjectDetailPage() {
  const { id } = useParams();
  const projects = useProjects();
  const project = projects?.find((p) => p.id === id);
  const prints = usePrints() ?? [];
  const spools = useSpools(true) ?? [];
  const settings = useSettings();
  const contacts = useContacts();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [manualPart, setManualPart] = useState(false);
  const [newPrint, setNewPrint] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepFiles, setKeepFiles] = useState(true);
  const byId = useMemo(() => new Map(spools.map((s) => [s.id, s])), [spools]);

  if (!projects) return <p className="text-muted-foreground">Chargement…</p>;
  if (!project)
    return (
      <div className="flex flex-col gap-3">
        <p>Ce projet n’existe pas (ou plus).</p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/projects">Retour aux projets</Link>
        </Button>
      </div>
    );

  const cur = settings.currency;
  const st = statusDef(project.status, settings);
  const contact = contacts.find((c) => c.id === project.contactId);
  const plan = projectPlan(project.parts);
  const progress = projectProgress(project, prints);
  const rest = remainingPlan(project, progress);
  const cost = projectCost(project, prints, byId, settings);
  const estimate = estimatedCost(plan, averageCostPerGram(spools), project, settings);
  const margin = project.pricing.marginPct ?? settings.projects.defaultMarginPct;
  const suggested = suggestedPrice(Math.max(cost.total, estimate.total), margin, settings.projects.roundTo);
  const real = realMargin(project.pricing.finalPrice, cost.total || estimate.total);
  const uses = actualConsumption(project.id, prints, byId, settings);
  const comparison = compareConsumption(plan.filaments, uses, byId, normalizeSlicerType);
  const update = (patch: Partial<Project>) => updateProject(project.id, patch);
  const updatePricing = (patch: Partial<Project['pricing']>) =>
    update({ pricing: { ...project.pricing, ...patch } });
  const updatePart = (partId: string, patch: Partial<ProjectPart>) =>
    saveProject({ ...project, parts: project.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)) });

  const importFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        const sliced = await readSlicedFile(file);
        if (!sliced.sliced || !sliced.plates.length) {
          toast.error(
            `${file.name} n’est pas découpé : dans Bambu Studio, tranche puis « Exporter le fichier de plateau découpé ».`,
            { duration: 10000 },
          );
          continue;
        }
        await addProjectPart(
          project.id,
          {
            name: file.name.replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/i, ''),
            source: '3mf',
            fileName: file.name,
            fileSize: file.size,
            quantity: 1,
            plates: platesFromSliced(sliced.plates),
            notes: sliced.warnings.join(' ') || null,
          },
          keepFiles && file.name.toLowerCase().endsWith('.3mf') ? file : null,
        );
        toast.success(`${file.name} : ${sliced.plates.length} plateau(x) ajouté(s).`);
      } catch (e) {
        toast.error(`${file.name} : ${e instanceof Error ? e.message : 'illisible'}`);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="self-start print:hidden"
        onClick={() => navigate('/projects')}
      >
        <ArrowLeft aria-hidden /> Projets
      </Button>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">
              {project.name}
              {project.code && (
                <span className="text-muted-foreground ml-2 text-base font-normal">[{project.code}]</span>
              )}
            </h1>
            <p className="text-muted-foreground text-sm">
              {project.forSelf
                ? 'Pour moi'
                : `Pour ${contact?.name ?? 'un tiers'}${contact?.contact ? ` (${contact.contact})` : ''}`}
              {project.dueDate && ` · échéance ${formatDate(project.dueDate, settings.dateFormat)}`}
              {project.deliveredAt && ` · livré le ${formatDate(project.deliveredAt, settings.dateFormat)}`}
              {` · créé le ${formatDate(project.createdAt, settings.dateFormat)}`}
            </p>
            {project.description && <p className="mt-2 text-sm whitespace-pre-wrap">{project.description}</p>}
            {project.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {project.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <NativeSelect
              aria-label="Statut du projet"
              className="w-auto"
              value={project.status}
              onChange={(e) => void update({ status: e.target.value })}
            >
              {settings.projectStatuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            {st.reserves && <Badge tone="info">Réserve du stock</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Modifier
          </Button>
          <Button variant="outline" onClick={() => setNewPrint(true)}>
            <Printer aria-hidden /> Nouvelle impression
          </Button>
          {!project.forSelf && (
            <Button variant="outline" asChild>
              <Link to={`/projects/${project.id}/document?type=quote`}>
                <FileText aria-hidden /> Devis
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/projects/${project.id}/document?type=summary`}>
              <FileText aria-hidden /> Récapitulatif
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const { sync: _s, ...doc } = project;
              downloadText(
                JSON.stringify(
                  { project: doc, prints: prints.filter((p) => p.projectId === project.id), contact },
                  null,
                  2,
                ),
                `projet-${project.code ?? project.id}.json`,
                'application/json',
              );
            }}
          >
            <FileDown aria-hidden /> JSON
          </Button>
          <Button variant="outline" onClick={() => void update({ archived: !project.archived })}>
            <Archive aria-hidden /> {project.archived ? 'Désarchiver' : 'Archiver'}
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Supprimer
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pièces */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Pièces à imprimer ({project.parts.length})</CardTitle>
              <CardDescription>
                {plan.totalPlates} plateau(x) · {formatGrams(plan.totalG)} prévus ·{' '}
                {formatDuration(plan.totalTimeS / 60)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={keepFiles} onCheckedChange={(v) => setKeepFiles(v === true)} /> Conserver
                les fichiers
              </label>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp aria-hidden /> Importer des .3mf
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".3mf,.gcode"
                className="sr-only"
                aria-label="Fichiers .3mf à ajouter au projet"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) void importFiles(Array.from(files));
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="outline" onClick={() => setManualPart(true)}>
                <Plus aria-hidden /> Pièce manuelle
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {project.parts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Importe un ou plusieurs .3mf découpés (ou ajoute une pièce à la main).
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {project.parts.map((part) => {
                  const pp = progress.perPart.find((x) => x.partId === part.id);
                  const perCopy = part.plates.reduce(
                    (a, pl) => a + pl.filaments.reduce((b, f) => b + f.grams, 0),
                    0,
                  );
                  const time = part.plates.reduce((a, pl) => a + (pl.predictionS ?? 0), 0);
                  const fils = [
                    ...new Map(
                      part.plates
                        .flatMap((pl) => pl.filaments)
                        .map((f) => [`${f.productHint ?? f.type}${f.color}`, f]),
                    ).values(),
                  ];
                  return (
                    <li key={part.id} className="flex flex-wrap items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{part.name}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                          {part.plates.length} plateau(x) · {formatGrams(perCopy)} ·{' '}
                          {formatDuration(time / 60)} par exemplaire
                          {fils.map((f, i) => (
                            <ColorSwatch key={i} hex={f.color} name={f.productHint ?? f.type} size="sm" />
                          ))}
                          {part.remotePath && ' · fichier synchronisé'}
                        </p>
                        {part.notes && <p className="text-warn-foreground text-xs">{part.notes}</p>}
                      </div>
                      <span className="text-sm tabular-nums">
                        {pp?.printed ?? 0}/{partPlates(part)} imprimé(s)
                      </span>
                      <label className="flex items-center gap-1 text-sm">
                        ×
                        <Input
                          aria-label={`Quantité de ${part.name}`}
                          type="number"
                          min={1}
                          className="h-8 w-16"
                          defaultValue={part.quantity}
                          key={`q${part.quantity}`}
                          onBlur={(e) => {
                            const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            if (q !== part.quantity) void updatePart(part.id, { quantity: q });
                          }}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Retirer ${part.name}`}
                        onClick={() =>
                          void saveProject({
                            ...project,
                            parts: project.parts.filter((p) => p.id !== part.id),
                          })
                        }
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

        {/* Avancement */}
        <Card>
          <CardHeader>
            <CardTitle>Avancement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  {progress.printedPlates}/{progress.totalPlates || '?'} plateau(x) imprimé(s)
                </span>
                <strong>{formatPercent(progress.ratio)}</strong>
              </div>
              <div
                className="bg-muted h-3 overflow-hidden rounded-full"
                role="meter"
                aria-label="Avancement du projet"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.ratio * 100)}
              >
                <div className="bg-ok h-full rounded-full" style={{ width: `${progress.ratio * 100}%` }} />
              </div>
            </div>
            {progress.unassigned > 0 && (
              <p className="text-muted-foreground text-xs">
                {progress.unassigned} impression(s) réussie(s) sans pièce précisée : non comptée(s). Modifie
                l’impression pour choisir sa pièce.
              </p>
            )}
            <PrintList title="Impressions réussies" list={progress.done} />
            {progress.failed.length > 0 && <PrintList title="Ratées / annulées" list={progress.failed} />}
            {progress.planned.length > 0 && <PrintList title="Planifiées" list={progress.planned} />}
          </CardContent>
        </Card>

        {/* Consommation */}
        <Card>
          <CardHeader>
            <CardTitle>Consommation prévue / réelle</CardTitle>
          </CardHeader>
          <CardContent>
            {comparison.length === 0 ? (
              <p className="text-muted-foreground text-sm">Rien de prévu ni consommé pour l’instant.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th scope="col" className="py-1 font-medium">
                      Filament
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Prévu
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Réel
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <ColorSwatch decorative hex={r.color} name={r.label} size="sm" /> {r.label}
                        </span>
                      </td>
                      <td className="py-1 text-right whitespace-nowrap tabular-nums">
                        {formatGrams(r.plannedG)}
                      </td>
                      <td className="py-1 text-right whitespace-nowrap tabular-nums">
                        {formatGrams(r.actualG)}
                      </td>
                      <td
                        className={cn(
                          'py-1 text-right whitespace-nowrap tabular-nums',
                          r.diffG > 0 && 'text-danger-foreground',
                        )}
                      >
                        {r.diffG > 0 ? '+' : ''}
                        {formatGrams(r.diffG)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1">Total</td>
                    <td className="py-1 text-right whitespace-nowrap tabular-nums">
                      {formatGrams(comparison.reduce((a, r) => a + r.plannedG, 0))}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap tabular-nums">
                      {formatGrams(comparison.reduce((a, r) => a + r.actualG, 0))}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap tabular-nums">
                      {formatGrams(comparison.reduce((a, r) => a + r.diffG, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {uses.some((u) => u.failedG > 0) && (
              <p className="text-muted-foreground mt-2 text-xs">
                Dont {formatGrams(uses.reduce((a, u) => a + u.failedG, 0))} perdus en impressions ratées.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Faisabilité du reste à imprimer */}
        <div className="lg:col-span-2">
          <FeasibilityPanel
            needs={rest.filaments}
            totalTimeS={rest.totalTimeS}
            projectId={project.id}
            title="Faisabilité du reste à imprimer"
          />
        </div>

        {/* Coûts et prix */}
        <Card>
          <CardHeader>
            <CardTitle>Coûts</CardTitle>
            <CardDescription>
              Réel d’après les impressions rattachées ; estimation d’après les .3mf (avec la marge pour les
              ratés).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th scope="col" className="py-1 font-medium">
                    Poste
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Réel
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Estimé
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Matière', cost.material, estimate.material],
                    ['dont impressions ratées', cost.failedMaterial, estimate.failedMaterial],
                    ['Électricité', cost.electricity, estimate.electricity],
                    [`Machine (${settings.projects.machineHourlyRate} €/h)`, cost.machine, estimate.machine],
                    [`Main-d’œuvre (${settings.projects.laborHourlyRate} €/h)`, cost.labor, estimate.labor],
                  ] as const
                ).map(([label, a, b]) => (
                  <tr key={label} className="border-t">
                    <td className="py-1">{label}</td>
                    <td className="py-1 text-right whitespace-nowrap tabular-nums">{formatMoney(a, cur)}</td>
                    <td className="py-1 text-right whitespace-nowrap tabular-nums">{formatMoney(b, cur)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right whitespace-nowrap tabular-nums">
                    {formatMoney(cost.total, cur)}
                  </td>
                  <td className="py-1 text-right whitespace-nowrap tabular-nums">
                    {formatMoney(estimate.total, cur)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Temps de travail (min)" htmlFor="labor" hint="Préparation, post-traitement">
                <Input
                  id="labor"
                  inputMode="numeric"
                  defaultValue={project.pricing.laborMinutes ?? ''}
                  key={`l${project.pricing.laborMinutes}`}
                  onBlur={(e) =>
                    void updatePricing({
                      laborMinutes: e.target.value.trim() ? Math.max(0, Number(e.target.value) || 0) : null,
                    })
                  }
                />
              </Field>
              {project.budget != null && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Budget</p>
                  <p className={cn('font-semibold', cost.total > project.budget && 'text-danger-foreground')}>
                    {formatMoney(cost.total, cur)} / {formatMoney(project.budget, cur)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{project.forSelf ? 'Prix (si tu le vendais)' : 'Prix et paiement'}</CardTitle>
            <CardDescription>
              Prix suggéré = coût (réel ou estimé, le plus élevé) + marge, arrondi au pas de{' '}
              {formatMoney(settings.projects.roundTo, cur)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Marge (%)" htmlFor="margin">
              <Input
                id="margin"
                inputMode="decimal"
                defaultValue={margin}
                key={`m${margin}`}
                onBlur={(e) =>
                  void updatePricing({
                    marginPct: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) : null,
                  })
                }
              />
            </Field>
            <div>
              <p className="text-muted-foreground text-xs">Prix suggéré</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(suggested, cur)}</p>
            </div>
            <Field label="Prix final (€)" htmlFor="final">
              <Input
                id="final"
                inputMode="decimal"
                defaultValue={project.pricing.finalPrice ?? ''}
                key={`f${project.pricing.finalPrice}`}
                onBlur={(e) =>
                  void updatePricing({
                    finalPrice: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) : null,
                  })
                }
              />
            </Field>
            <div>
              <p className="text-muted-foreground text-xs">Marge réelle</p>
              <p
                className={cn(
                  'font-semibold tabular-nums',
                  real && real.amount < 0 && 'text-danger-foreground',
                )}
              >
                {real
                  ? `${formatMoney(real.amount, cur)}${real.pct != null ? ` (${formatPercent(real.pct)})` : ''}`
                  : '—'}
              </p>
            </div>
            {!project.forSelf && (
              <>
                <Field label="Paiement" htmlFor="payment">
                  <NativeSelect
                    id="payment"
                    value={project.pricing.paymentStatus}
                    onChange={(e) =>
                      void updatePricing({
                        paymentStatus: e.target.value as Project['pricing']['paymentStatus'],
                        paidAt:
                          e.target.value === 'paid'
                            ? (project.pricing.paidAt ?? new Date().toISOString().slice(0, 10))
                            : project.pricing.paidAt,
                      })
                    }
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PAYMENT_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Déjà payé (€)" htmlFor="paid">
                  <Input
                    id="paid"
                    inputMode="decimal"
                    defaultValue={project.pricing.paidAmount ?? ''}
                    key={`p${project.pricing.paidAmount}`}
                    onBlur={(e) =>
                      void updatePricing({
                        paidAmount: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) : null,
                      })
                    }
                  />
                </Field>
              </>
            )}
            {project.pricing.finalPrice == null && (
              <Button
                variant="outline"
                size="sm"
                className="col-span-2 justify-self-start"
                onClick={() => void updatePricing({ finalPrice: suggested })}
              >
                Utiliser le prix suggéré
              </Button>
            )}
          </CardContent>
        </Card>

        {project.reservations.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Bobines réservées</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void setReservations(project.id, [])}>
                <Unlock aria-hidden /> Tout libérer
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2 text-sm">
                {project.reservations.map((r) => {
                  const s = byId.get(r.spoolId);
                  return (
                    <li key={r.spoolId}>
                      <Badge>
                        <ColorSwatch decorative hex={s?.colorHex} name={s?.colorName} size="sm" />{' '}
                        {s?.code ?? '?'} · {formatGrams(r.grams)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
              {!st.reserves && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Statut « {st.label} » : ces réservations ne bloquent pas le stock.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {project.history.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Historique de synchronisation</CardTitle>
              <CardDescription>
                Versions remplacées lors d’un conflit (conservées, rien n’est perdu).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm">
                {project.history.map((h) => (
                  <li key={h.at}>
                    {formatDate(h.at, settings.dateFormat)} — {h.reason}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <ProjectDialog project={project} open={editing} onOpenChange={setEditing} />
      <ManualPartDialog
        open={manualPart}
        onOpenChange={setManualPart}
        onCreate={(part) => addProjectPart(project.id, part)}
      />
      <PrintFormDialog
        open={newPrint}
        onOpenChange={setNewPrint}
        draft={{ projectId: project.id, status: 'success' }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={`Supprimer « ${project.name} » ?`}
        description="Les impressions restent dans l’historique (sans projet)."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteProject(project.id);
          navigate('/projects');
        }}
      />
    </div>
  );

  function PrintList({ title, list }: { title: string; list: typeof prints }) {
    return (
      <div>
        <p className="text-muted-foreground text-xs font-semibold">
          {title} ({list.length})
        </p>
        <ul className="text-sm">
          {list.slice(0, 10).map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">
                {p.name}
                {p.projectPartId && project?.parts.find((x) => x.id === p.projectPartId)
                  ? ` — ${project.parts.find((x) => x.id === p.projectPartId)!.name}`
                  : ''}
              </span>
              <span className="text-muted-foreground shrink-0">
                {PRINT_STATUS_LABELS[p.status]} · {formatGrams(p.usages.reduce((a, u) => a + u.grams, 0))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

function ManualPartDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (p: Omit<ProjectPart, 'id'>) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [hours, setHours] = useState('');
  const [rows, setRows] = useState<PartFilament[]>([
    { id: 1, type: 'PLA', color: '#000000', productHint: 'PLA Basic', grams: 0, lengthM: null },
  ]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pièce saisie à la main</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error('Nom requis.');
            await onCreate({
              name: name.trim(),
              source: 'manual',
              quantity: Math.max(1, Math.floor(Number(qty) || 1)),
              plates: [
                {
                  index: 1,
                  name: null,
                  predictionS: hours.trim() ? Number(hours.replace(',', '.')) * 3600 : null,
                  filaments: rows.filter((r) => r.grams > 0),
                },
              ],
            });
            onOpenChange(false);
            setName('');
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Nom" htmlFor="mp-name" className="col-span-3">
              <Input id="mp-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Quantité" htmlFor="mp-qty">
              <Input id="mp-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Durée / exemplaire (h)" htmlFor="mp-h">
              <Input id="mp-h" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
              <Field label="Gamme" htmlFor={`mp-g${i}`}>
                <Input
                  id={`mp-g${i}`}
                  value={r.productHint ?? ''}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i
                          ? { ...x, productHint: e.target.value, type: e.target.value.split(' ')[0] ?? '' }
                          : x,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Couleur" htmlFor={`mp-c${i}`}>
                <input
                  id={`mp-c${i}`}
                  type="color"
                  className="border-input h-10 w-full rounded-md border"
                  value={r.color ?? '#000000'}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, color: e.target.value.toUpperCase() } : x)))
                  }
                />
              </Field>
              <Field label="Grammes" htmlFor={`mp-w${i}`}>
                <Input
                  id={`mp-w${i}`}
                  inputMode="decimal"
                  value={r.grams || ''}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, grams: Number(e.target.value.replace(',', '.')) || 0 } : x,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Retirer ce filament"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setRows([
                ...rows,
                {
                  id: rows.length + 1,
                  type: 'PLA',
                  color: '#FFFFFF',
                  productHint: 'PLA Basic',
                  grams: 0,
                  lengthM: null,
                },
              ])
            }
          >
            <Plus aria-hidden /> Filament
          </Button>
          <DialogFooter>
            <Button type="submit">Ajouter la pièce</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
