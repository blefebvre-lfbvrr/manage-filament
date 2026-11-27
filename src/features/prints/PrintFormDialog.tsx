import { ImagePlus } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useProjects, useSpools } from '@/app/hooks';
import { shrinkImage } from '@/app/images';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { createProject, saveAttachment, savePrint, type PrintInput } from '@/db/repo';
import { PRINT_STATUS_LABELS } from '@/lib/export';
import { formatGrams } from '@/lib/format';
import { consumesStock, scaleForFailure, totalGrams, validatePrint } from '@/lib/prints';
import { PRINT_STATUSES, type FilamentUsage, type PrintJob, type PrintStatus } from '@/lib/schemas';
import { StockWarnings, toNumber, UsageEditor, type UsageRow } from './UsageEditor';

export type PrintDraft = Partial<PrintInput> & { rows?: UsageRow[] };

const NEW_PROJECT = '__new__';

function rowsFrom(p: PrintDraft | undefined): UsageRow[] {
  if (p?.rows) return p.rows;
  return (p?.usages ?? []).map((u) => ({
    spoolId: u.spoolId,
    grams: String(u.plannedG ?? u.grams),
    role: u.role,
    lengthM: u.plannedG && u.lengthM ? u.lengthM : u.lengthM,
    slicerType: u.slicerType,
    slicerColor: u.slicerColor,
    amsSlot: u.amsSlot,
  }));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Saisie / modification d'une impression. `print` = modification, `draft` = préremplissage (file d'attente, .3mf). */
export function PrintFormDialog({
  open,
  onOpenChange,
  print,
  draft,
  title,
  onSaved,
  applyStockDefault,
}: {
  /** Valeur initiale de « Déduire du stock » (sinon : comme l'impression modifiée). */
  applyStockDefault?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  print?: PrintJob;
  draft?: PrintDraft;
  title?: string;
  onSaved?: (p: PrintJob) => void;
}) {
  const spools = useSpools() ?? [];
  const projects = useProjects() ?? [];
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const src: PrintDraft | undefined = print ?? draft;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<PrintStatus>('success');
  const [failedAt, setFailedAt] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newProject, setNewProject] = useState('');
  const [plate, setPlate] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [applyStock, setApplyStock] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(src?.name ?? '');
    setDate(src?.date ?? (print ? '' : today()));
    setStatus(src?.status ?? 'success');
    setFailedAt(src?.failedAtPercent == null ? '' : String(src.failedAtPercent));
    setProjectId(src?.projectId ?? '');
    setNewProject('');
    setPlate(src?.plate ?? '');
    const d = src?.durationMin;
    setHours(d == null ? '' : String(Math.floor(d / 60)));
    setMinutes(d == null ? '' : String(Math.round(d % 60)));
    setNotes(src?.notes ?? '');
    setRows(rowsFrom(src));
    setApplyStock(
      applyStockDefault ?? (print ? print.stockApplied !== false || print.status === 'planned' : true),
    );
    setPhoto(null);
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, print?.id, draft]);

  const pct = status === 'failed' && failedAt.trim() !== '' ? toNumber(failedAt) : null;
  const factor = pct != null && Number.isFinite(pct) ? pct / 100 : 1;
  // En modification, le filament déjà déduit par cette impression redevient disponible.
  const availableSpools = print?.stockApplied
    ? spools.map((s) => ({
        ...s,
        remainingG:
          s.remainingG + print.usages.filter((u) => u.spoolId === s.id).reduce((a, u) => a + u.grams, 0),
      }))
    : spools;
  const enteredTotal = rows.reduce((a, r) => a + (toNumber(r.grams) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const base: FilamentUsage[] = rows.map((r) => ({
      spoolId: r.spoolId,
      grams: Math.max(0, toNumber(r.grams) || 0),
      plannedG: null,
      lengthM: r.lengthM ?? null,
      role: r.role,
      amsSlot: r.amsSlot ?? null,
      slicerType: r.slicerType ?? null,
      slicerColor: r.slicerColor ?? null,
    }));
    if (rows.some((r) => Number.isNaN(toNumber(r.grams)))) {
      setErrors(['Grammes invalides.']);
      return;
    }
    const usages = pct != null && Number.isFinite(pct) ? scaleForFailure(base, pct) : base;
    const h = toNumber(hours) || 0;
    const m = toNumber(minutes) || 0;
    const input: PrintInput = {
      ...(print ? { id: print.id } : {}),
      name: name.trim(),
      date: date || null,
      durationMin: hours.trim() || minutes.trim() ? Math.round(h * 60 + m) : null,
      projectId: projectId && projectId !== NEW_PROJECT ? projectId : null,
      plate: plate.trim() || null,
      status,
      failedAtPercent: status === 'failed' && pct != null && Number.isFinite(pct) ? pct : null,
      estimatedG: src?.estimatedG ?? (Math.round(enteredTotal * 10) / 10 || null),
      usages,
      energyKwh: src?.energyKwh ?? null,
      sourceFileId: src?.sourceFileId ?? null,
      photoIds: [...(src?.photoIds ?? [])],
      notes: notes.trim() || null,
      legacyRow: src?.legacyRow ?? null,
      needsReview: false,
      reviewNote: null,
      custom: src?.custom ?? {},
    };
    const errs = validatePrint(input);
    if (projectId === NEW_PROJECT && !newProject.trim()) errs.push('Nomme le nouveau projet.');
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      if (projectId === NEW_PROJECT) input.projectId = (await createProject(newProject)).id;
      if (photo)
        input.photoIds = [...input.photoIds, await saveAttachment(await shrinkImage(photo), photo.name)];
      const saved = await savePrint(input, { applyStock });
      const deducted = saved.stockApplied ? totalGrams(saved.usages) : 0;
      toast.success(
        saved.stockApplied
          ? `« ${saved.name} » enregistrée : ${formatGrams(deducted)} déduits du stock.`
          : `« ${saved.name} » enregistrée${consumesStock(saved.status) ? ' sans déduction' : ' dans la file d’attente'}.`,
      );
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide aria-describedby={id('desc')}>
        <DialogHeader>
          <DialogTitle>{title ?? (print ? 'Modifier l’impression' : 'Nouvelle impression')}</DialogTitle>
          <DialogDescription id={id('desc')}>
            Les grammes sont déduits des bobines choisies dès l’enregistrement (sauf impression planifiée).
            Tout est annulable.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom" htmlFor={id('name')} className="sm:col-span-2">
              <Input
                id={id('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Boîte à vis"
                autoFocus={!print}
              />
            </Field>
            <Field label="Date" htmlFor={id('date')}>
              <Input id={id('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Résultat" htmlFor={id('status')}>
              <NativeSelect
                id={id('status')}
                value={status}
                onChange={(e) => setStatus(e.target.value as PrintStatus)}
              >
                {PRINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PRINT_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {status === 'failed' && (
              <Field label="Ratée à (%)" htmlFor={id('pct')} hint="Seule la part déposée est déduite">
                <Input
                  id={id('pct')}
                  inputMode="decimal"
                  value={failedAt}
                  onChange={(e) => setFailedAt(e.target.value)}
                  placeholder="ex. 35"
                />
              </Field>
            )}
            <Field label="Projet" htmlFor={id('project')}>
              <NativeSelect
                id={id('project')}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_PROJECT}>+ Nouveau projet…</option>
              </NativeSelect>
            </Field>
            {projectId === NEW_PROJECT && (
              <Field label="Nom du projet" htmlFor={id('newproj')}>
                <Input
                  id={id('newproj')}
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                />
              </Field>
            )}
            <Field label="Plateau" htmlFor={id('plate')}>
              <Input
                id={id('plate')}
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="ex. Plateau 1"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Durée (h)" htmlFor={id('h')}>
                <Input
                  id={id('h')}
                  inputMode="numeric"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </Field>
              <Field label="(min)" htmlFor={id('m')}>
                <Input
                  id={id('m')}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <UsageEditor
            rows={rows}
            onChange={setRows}
            spools={spools}
            idPrefix={id('u')}
            failedPercent={pct != null && Number.isFinite(pct) ? pct : null}
          />
          <StockWarnings rows={rows} spools={availableSpools} factor={status === 'planned' ? 1 : factor} />

          <Field label="Notes" htmlFor={id('notes')}>
            <Textarea
              id={id('notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-16"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <ImagePlus className="size-4" aria-hidden />
              <span>{photo ? photo.name : 'Ajouter une photo du résultat'}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {status !== 'planned' && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={applyStock} onCheckedChange={(v) => setApplyStock(v === true)} />
                Déduire du stock
              </label>
            )}
          </div>

          {errors.length > 0 && (
            <ul className="text-danger-foreground text-sm" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {status === 'planned'
                ? 'Mettre en file d’attente'
                : applyStock
                  ? `Enregistrer et déduire ${formatGrams(Math.round(enteredTotal * factor * 10) / 10)}`
                  : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
