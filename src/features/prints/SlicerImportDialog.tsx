import { FileUp, Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjects, useSpools } from '@/app/hooks';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { createProject, saveAttachment, savePrint } from '@/db/repo';
import { formatGrams } from '@/lib/format';
import { formatDuration, scaleForFailure } from '@/lib/prints';
import type { AmsSlot, FilamentUsage, PrintStatus } from '@/lib/schemas';
import { parseGcodeMeta } from '@/lib/slicer/gcode';
import { autoMatchAll, rankCandidates } from '@/lib/slicer/match';
import { matchProject } from '@/lib/projects';
import { parse3mfFile } from '@/lib/slicer/threemf';
import { SlicerParseError, type SlicedFile, type SlicedPlate } from '@/lib/slicer/types';
import { ColorSwatch } from '../inventory/SpoolBits';
import { StockWarnings, toNumber, UsageEditor, type UsageRow } from './UsageEditor';

const NEW_PROJECT = '__new__';
const MB = 1024 * 1024;

/** Lit un fichier découpé dans le navigateur (aucun envoi). */
export async function readSlicedFile(file: File): Promise<SlicedFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.gcode') || lower.endsWith('.gco') || lower.endsWith('.g')) {
    // Les infos sont en tête et en fin de fichier : inutile de charger tout le G-code.
    const head = await file.slice(0, MB / 2).text();
    const tail = file.size > MB / 2 ? await file.slice(Math.max(MB / 2, file.size - 2 * MB)).text() : '';
    return parseGcodeMeta(`${head}\n${tail}`);
  }
  if (lower.endsWith('.3mf')) return parse3mfFile(new Uint8Array(await file.arrayBuffer()));
  throw new SlicerParseError('Format non reconnu : choisis un .3mf (découpé) ou un .gcode.');
}

const baseName = (n: string) => n.replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/i, '');

export function SlicerImportDialog({
  open,
  onOpenChange,
  initialFile,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialFile?: File | null;
}) {
  const spools = useSpools() ?? [];
  const projects = useProjects() ?? [];
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<SlicedFile | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [rows, setRows] = useState<Record<number, UsageRow[]>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<PrintStatus>('success');
  const [failedAt, setFailedAt] = useState('');
  const [projectId, setProjectId] = useState('');
  const [match, setMatch] = useState<{ projectId: string; partId: string | null; reason: string } | null>(
    null,
  );
  const [newProject, setNewProject] = useState('');
  const [keepFile, setKeepFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setSelected([]);
    setRows({});
    setNames({});
    setStatus('success');
    setFailedAt('');
  };

  const load = async (f: File) => {
    try {
      const res = await readSlicedFile(f);
      setFile(f);
      setParsed(res);
      setSelected(res.plates.length === 1 ? [res.plates[0]!.index] : []);
      const r: Record<number, UsageRow[]> = {};
      const n: Record<number, string> = {};
      for (const p of res.plates) {
        const auto = autoMatchAll(p.filaments, spools);
        r[p.index] = p.filaments.map((fil, i) => {
          const ranked = rankCandidates(fil, spools)
            .filter((c) => c.score > 0)
            .slice(0, 4);
          const a = auto[i];
          return {
            spoolId: a?.spool.id ?? null,
            grams: String(fil.usedG),
            role: 'main',
            lengthM: fil.usedM,
            slicerType: fil.productHint ?? fil.type,
            slicerColor: fil.color,
            amsSlot: fil.id >= 1 && fil.id <= 4 ? (fil.id as AmsSlot) : null,
            suggested: ranked.map((c) => c.spool.id),
            hint: `Filament ${fil.id} du fichier : ${fil.productHint ?? fil.type}${fil.color ? ` ${fil.color}` : ''} — ${a ? `rattaché à ${a.spool.code} (${a.reasons.join(', ')})` : 'aucune bobine évidente, choisis-la'}`,
          };
        });
        n[p.index] =
          res.plates.length > 1
            ? `${baseName(f.name)} — ${p.name ?? `plateau ${p.index}`}`
            : baseName(f.name);
      }
      setRows(r);
      setNames(n);
      // Rattachement automatique : préfixe [CODE] du fichier ou .3mf déjà importé dans un projet.
      const m = matchProject(f.name, projects);
      if (m) {
        setProjectId(m.project.id);
        setMatch({
          projectId: m.project.id,
          partId: m.part?.id ?? null,
          reason: `${m.project.name} (${m.reason})`,
        });
      } else setMatch(null);
    } catch (e) {
      toast.error(e instanceof SlicerParseError ? e.message : 'Fichier illisible.');
    }
  };

  useEffect(() => {
    if (open && initialFile) void load(initialFile);
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const pct = status === 'failed' && failedAt.trim() ? toNumber(failedAt) : null;

  const save = async () => {
    if (!parsed || !file || !selected.length) return;
    const plates = parsed.plates.filter((p) => selected.includes(p.index));
    const missing =
      status !== 'planned' &&
      plates.some((p) => rows[p.index]!.some((r) => !r.spoolId && toNumber(r.grams) > 0));
    if (missing) {
      toast.error('Choisis une bobine pour chaque filament (ou passe l’impression en « Planifiée »).');
      return;
    }
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast.error('Pourcentage invalide.');
      return;
    }
    setSaving(true);
    try {
      let project: string | null = projectId && projectId !== NEW_PROJECT ? projectId : null;
      if (projectId === NEW_PROJECT && newProject.trim()) project = (await createProject(newProject)).id;
      const sourceFileId = keepFile ? await saveAttachment(file, file.name) : null;
      let total = 0;
      for (const p of plates) {
        const base: FilamentUsage[] = rows[p.index]!.map((r) => ({
          spoolId: r.spoolId,
          grams: Math.max(0, toNumber(r.grams) || 0),
          lengthM: r.lengthM ?? null,
          role: r.role,
          amsSlot: r.amsSlot ?? null,
          slicerType: r.slicerType ?? null,
          slicerColor: r.slicerColor ?? null,
        }));
        const usages = pct != null ? scaleForFailure(base, pct) : base;
        const saved = await savePrint({
          name: names[p.index]?.trim() || baseName(file.name),
          date: status === 'planned' ? null : new Date().toISOString().slice(0, 10),
          durationMin: p.predictionS != null ? Math.round(p.predictionS / 60) : null,
          projectId: project,
          projectPartId: project && project === match?.projectId ? match.partId : null,
          plateIndex: project && project === match?.projectId && match.partId ? p.index : null,
          plate: p.name ?? `Plateau ${p.index}`,
          status,
          failedAtPercent: pct,
          estimatedG: p.weightG ?? base.reduce((a, u) => a + u.grams, 0),
          usages,
          energyKwh: null,
          sourceFileId,
          photoIds: [],
          notes: `Importé depuis ${file.name}${parsed.slicer ? ` (${parsed.slicer})` : ''}`,
          legacyRow: null,
          needsReview: false,
          reviewNote: null,
          custom: {},
        });
        if (saved.stockApplied) total += saved.usages.reduce((a, u) => a + u.grams, 0);
      }
      toast.success(
        status === 'planned'
          ? `${plates.length} impression(s) ajoutée(s) à la file d’attente.`
          : `${plates.length} impression(s) enregistrée(s), ${formatGrams(Math.round(total * 10) / 10)} déduits.`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const plateLabel = (p: SlicedPlate) =>
    `${p.name ?? `Plateau ${p.index}`} · ${formatGrams(p.weightG ?? p.filaments.reduce((a, f) => a + f.usedG, 0))} · ${formatDuration(p.predictionS != null ? p.predictionS / 60 : null)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide aria-describedby={id('desc')}>
        <DialogHeader>
          <DialogTitle>Importer un fichier découpé</DialogTitle>
          <DialogDescription id={id('desc')}>
            .3mf découpé par Bambu Studio (fichier de plateau découpé / .gcode.3mf) ou .gcode Bambu Studio /
            OrcaSlicer. Le fichier est lu dans ton navigateur.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${dragOver ? 'border-primary bg-primary/5' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
          >
            <FileUp className="text-muted-foreground size-8" aria-hidden />
            <p className="text-sm">Glisse ton .3mf ou .gcode ici ou</p>
            <Button onClick={() => inputRef.current?.click()}>Choisir un fichier</Button>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              aria-label="Fichier .3mf ou .gcode"
              accept=".3mf,.gcode,.gco"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void load(f);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              <strong>{file?.name}</strong>
              {parsed.slicer && <span className="text-muted-foreground"> · {parsed.slicer}</span>}
            </p>
            {parsed.warnings.length > 0 && (
              <ul className="bg-muted flex flex-col gap-1 rounded-md p-3 text-sm">
                {parsed.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
                  </li>
                ))}
              </ul>
            )}
            {parsed.plates.length > 1 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-semibold">Plateaux à enregistrer</legend>
                {parsed.plates.map((p) => (
                  <label key={p.index} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(p.index)}
                      onCheckedChange={(v) =>
                        setSelected((s) => (v === true ? [...s, p.index] : s.filter((x) => x !== p.index)))
                      }
                    />
                    {plateLabel(p)}
                  </label>
                ))}
              </fieldset>
            )}

            {parsed.plates
              .filter((p) => selected.includes(p.index))
              .map((p) => (
                <section
                  key={p.index}
                  className="flex flex-col gap-3 rounded-lg border p-3"
                  aria-label={`Plateau ${p.index}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {p.filaments.map((f) => (
                      <span
                        key={f.id}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                      >
                        <ColorSwatch hex={f.color} name={f.type} size="sm" decorative />
                        {f.id} · {f.productHint ?? f.type} · {formatGrams(f.usedG)}
                      </span>
                    ))}
                    <span className="text-muted-foreground">{plateLabel(p)}</span>
                  </div>
                  <Field label="Nom de l’impression" htmlFor={id(`name-${p.index}`)}>
                    <Input
                      id={id(`name-${p.index}`)}
                      value={names[p.index] ?? ''}
                      onChange={(e) => setNames((n) => ({ ...n, [p.index]: e.target.value }))}
                    />
                  </Field>
                  <UsageEditor
                    rows={rows[p.index] ?? []}
                    onChange={(r) => setRows((all) => ({ ...all, [p.index]: r }))}
                    spools={spools}
                    idPrefix={id(`p${p.index}`)}
                    failedPercent={pct != null && Number.isFinite(pct) ? pct : null}
                  />
                  <StockWarnings
                    rows={rows[p.index] ?? []}
                    spools={spools}
                    factor={pct != null && Number.isFinite(pct) ? pct / 100 : 1}
                  />
                </section>
              ))}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Enregistrer comme" htmlFor={id('status')}>
                <NativeSelect
                  id={id('status')}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PrintStatus)}
                >
                  <option value="success">Réussie (déduire maintenant)</option>
                  <option value="planned">Planifiée (file d’attente)</option>
                  <option value="failed">Ratée</option>
                  <option value="cancelled">Annulée</option>
                </NativeSelect>
              </Field>
              {status === 'failed' && (
                <Field label="Ratée à (%)" htmlFor={id('pct')}>
                  <Input
                    id={id('pct')}
                    inputMode="decimal"
                    value={failedAt}
                    onChange={(e) => setFailedAt(e.target.value)}
                    placeholder="ex. 40"
                  />
                </Field>
              )}
              <Field
                label="Projet"
                htmlFor={id('project')}
                hint={match ? `Rattaché automatiquement : ${match.reason}` : undefined}
              >
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
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keepFile} onCheckedChange={(v) => setKeepFile(v === true)} />
              Conserver le fichier avec l’impression (
              {((file?.size ?? 0) / MB).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo, stocké sur
              cet appareil)
            </label>
          </div>
        )}

        <DialogFooter>
          {parsed && (
            <Button variant="ghost" onClick={reset}>
              Autre fichier
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {parsed && (
            <Button onClick={() => void save()} disabled={saving || !selected.length}>
              {status === 'planned' ? 'Ajouter à la file' : 'Enregistrer et déduire'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
