import { CheckCircle2, FileUp, Info, TriangleAlert, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { downloadText, todayStamp } from '@/app/download';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/input';
import { getDb } from '@/db/db';
import { applyImportPlan, type ImportResult } from '@/db/repo';
import {
  analyzeWorkbook,
  planInputFromAnalysis,
  withRole,
  type SavedMappingLookup,
  type SheetAnalysis,
  type SheetRole,
  type WorkbookAnalysis,
} from '@/lib/excel/analyze';
import { FIELDS, mappingToRecord, type ColumnTarget, type ImportKind } from '@/lib/excel/mapping';
import {
  buildImportPlan,
  type DuplicateStrategy,
  type ExistingData,
  type ImportIssue,
  type ImportPlan,
} from '@/lib/excel/plan';
import { readWorkbook } from '@/lib/excel/read';
import { isBlank, parseString } from '@/lib/excel/values';
import { toCsv } from '@/lib/export';
import { formatGrams } from '@/lib/format';
import { SPOOL_STATUS_LABELS } from '@/lib/spool';
import { ColorSwatch } from '../inventory/SpoolBits';

type Step = 'file' | 'mapping' | 'preview' | 'done';

const ROLE_LABELS: Record<SheetRole, string> = {
  spools: 'Bobines',
  prints: 'Impressions',
  lists: 'Listes (projets, emplacements, gammes)',
  ignore: 'Ignorer',
};
const ACTION_LABELS = { create: 'Créée', update: 'Mise à jour', skip: 'Ignorée (doublon)' };

async function loadExisting(): Promise<ExistingData> {
  const db = getDb();
  const [spools, prints, projects, brands, products, colors, customFieldDefs, locations] = await Promise.all([
    db.spools.toArray(),
    db.prints.toArray(),
    db.projects.toArray(),
    db.brands.toArray(),
    db.products.toArray(),
    db.colors.toArray(),
    db.customFieldDefs.toArray(),
    db.locations.toArray(),
  ]);
  return {
    spools,
    prints,
    projects,
    brands,
    products,
    colors,
    customFieldDefs,
    locations: locations.map((l) => l.name),
  };
}

async function savedMappings(): Promise<SavedMappingLookup> {
  const all = await getDb().importMappings.toArray();
  const map = new Map(all.map((m) => [m.signature, m.columns]));
  return (sig) => map.get(sig);
}

function sample(sheet: SheetAnalysis, col: number): string {
  const values: string[] = [];
  for (const r of sheet.table?.records ?? []) {
    const v = r.cells[col];
    if (!isBlank(v)) values.push(parseString(v) ?? '');
    if (values.length >= 3) break;
  }
  return values.join(' · ');
}

function TargetSelect({
  kind,
  value,
  onChange,
  label,
}: {
  kind: ImportKind;
  value: ColumnTarget;
  onChange: (v: ColumnTarget) => void;
  label: string;
}) {
  const fields = FIELDS[kind];
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as ColumnTarget)}
      className="h-9"
    >
      <optgroup label="Champ FilaTrack">
        {fields
          .filter((f) => !f.computed)
          .map((f) => (
            <option key={f.key} value={`field:${f.key}`}>
              {f.label}
            </option>
          ))}
      </optgroup>
      <optgroup label="Colonne calculée (vérification seulement)">
        {fields
          .filter((f) => f.computed || f.inputOrComputed)
          .map((f) => (
            <option key={f.key} value={`check:${f.key}`}>
              {f.label} (calculé)
            </option>
          ))}
      </optgroup>
      <optgroup label="Autre">
        <option value="custom">Champ personnalisé</option>
        <option value="ignore">Ignorer</option>
      </optgroup>
    </NativeSelect>
  );
}

const ISSUE_ICON = { error: XCircle, warning: TriangleAlert, info: Info };
const ISSUE_CLS = {
  error: 'text-danger-foreground',
  warning: 'text-warn-foreground',
  info: 'text-muted-foreground',
};

export function ExcelImportWizard() {
  const [step, setStep] = useState<Step>('file');
  const [analysis, setAnalysis] = useState<WorkbookAnalysis | null>(null);
  const [lookup, setLookup] = useState<SavedMappingLookup>(() => () => undefined);
  const [existing, setExisting] = useState<ExistingData | null>(null);
  const [keepLegacyCodes, setKeepLegacyCodes] = useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [applySettings, setApplySettings] = useState(true);
  const [saveMapping, setSaveMapping] = useState(true);
  const [issueFilter, setIssueFilter] = useState<'all' | ImportIssue['level']>('all');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step !== 'file') headingRef.current?.focus();
  }, [step]);

  const plan: ImportPlan | null = useMemo(() => {
    if (!analysis || !existing || step === 'file') return null;
    return buildImportPlan(
      planInputFromAnalysis(analysis, {
        existing,
        options: { keepLegacyCodes, duplicateStrategy, now: new Date().toISOString() },
      }),
    );
  }, [analysis, existing, keepLegacyCodes, duplicateStrategy, step]);

  const openFile = async (file: File) => {
    try {
      const wb = readWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
      const lk = await savedMappings();
      setLookup(() => lk);
      setAnalysis(analyzeWorkbook(wb, lk));
      setExisting(await loadExisting());
      setResult(null);
      setStep('mapping');
    } catch (e) {
      console.error(e);
      toast.error('Impossible de lire ce fichier. Formats acceptés : .xlsx, .xls, .ods, .csv.');
    }
  };

  const updateSheet = (i: number, next: SheetAnalysis) =>
    setAnalysis((a) => (a ? { ...a, sheets: a.sheets.map((s, j) => (j === i ? next : s)) } : a));

  const doImport = async () => {
    if (!plan || !analysis) return;
    setBusy(true);
    try {
      const mappings = saveMapping
        ? analysis.sheets
            .filter(
              (s): s is SheetAnalysis & { role: ImportKind } =>
                (s.role === 'spools' || s.role === 'prints') && Boolean(s.table && s.signature),
            )
            .map((s) => ({
              name: `${analysis.fileName} — ${s.sheet.name}`,
              kind: s.role,
              signature: s.signature!,
              columns: mappingToRecord(s.table!.headers, s.targets),
            }))
        : [];
      setResult(await applyImportPlan(plan, { applySettings, mappings }));
      setStep('done');
      toast.success('Import terminé.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `Import annulé : ${e.message}` : 'Import annulé.');
    } finally {
      setBusy(false);
    }
  };

  const reportCsv = () => {
    if (!plan) return;
    const rows = plan.issues.map((i) => ({
      Niveau: i.level === 'error' ? 'Erreur' : i.level === 'warning' ? 'Avertissement' : 'Info',
      Feuille: i.sheet,
      Ligne: i.row ?? null,
      Colonne: i.column ?? null,
      Message: i.message,
    }));
    downloadText(toCsv(rows), `filatrack-rapport-import-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
  };

  const counts = plan
    ? {
        error: plan.issues.filter((i) => i.level === 'error').length,
        warning: plan.issues.filter((i) => i.level === 'warning').length,
        info: plan.issues.filter((i) => i.level === 'info').length,
      }
    : null;
  const hasTables = analysis?.sheets.some((s) => s.role === 'spools' || s.role === 'prints');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span ref={headingRef} tabIndex={-1} className="outline-none">
            Importer un fichier Excel
          </span>
        </CardTitle>
        <CardDescription>
          Reconnaît automatiquement ton fichier « Suivi filament » (feuilles Bobines, Impressions et listes).
          Rien n’est écrit avant la dernière étape ; les colonnes inconnues deviennent des champs
          personnalisés.
        </CardDescription>
        <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Étapes">
          {(['file', 'mapping', 'preview', 'done'] as Step[]).map((s, i) => (
            <li key={s} aria-current={s === step ? 'step' : undefined}>
              <Badge tone={s === step ? 'info' : 'muted'}>
                {i + 1}.{' '}
                {{ file: 'Fichier', mapping: 'Colonnes', preview: 'Vérification', done: 'Terminé' }[s]}
              </Badge>
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === 'file' && (
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
              if (f) void openFile(f);
            }}
          >
            <FileUp className="text-muted-foreground size-8" aria-hidden />
            <p className="text-sm">Glisse ton fichier ici ou</p>
            <Button onClick={() => inputRef.current?.click()}>Choisir un fichier</Button>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              aria-label="Fichier Excel à importer"
              accept=".xlsx,.xls,.xlsm,.ods,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void openFile(f);
              }}
            />
            <p className="text-muted-foreground text-xs">
              Le fichier est lu dans ton navigateur ; il n’est envoyé nulle part.
            </p>
          </div>
        )}

        {step === 'mapping' && analysis && (
          <>
            <p className="text-sm">
              Fichier : <strong>{analysis.fileName}</strong>
              {analysis.settings && Object.keys(analysis.settings).length > 0 && (
                <>
                  {' '}
                  — seuils détectés : {analysis.settings.lowThresholdG ?? '?'} g /{' '}
                  {analysis.settings.criticalThresholdG ?? '?'} g
                </>
              )}
            </p>
            {analysis.sheets.map((s, i) => (
              <section
                key={s.sheet.name}
                className="rounded-lg border p-3"
                aria-label={`Feuille ${s.sheet.name}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{s.sheet.name}</h3>
                  {s.sheet.hidden && <Badge tone="muted">masquée</Badge>}
                  {s.fromSavedMapping && <Badge tone="info">mapping enregistré</Badge>}
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Contenu</span>
                    <NativeSelect
                      className="h-9 w-auto"
                      value={s.role}
                      onChange={(e) => updateSheet(i, withRole(s, e.target.value as SheetRole, lookup))}
                    >
                      {(Object.keys(ROLE_LABELS) as SheetRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                </div>
                {s.reason && (s.role === 'ignore' || s.role === 'lists') && (
                  <p className="text-muted-foreground mt-1 text-sm">{s.reason}</p>
                )}
                {(s.role === 'spools' || s.role === 'prints') && s.table && (
                  <div className="relative mt-3 overflow-x-auto">
                    <p className="text-muted-foreground mb-2 text-xs">
                      En-têtes ligne {s.table.headerRowIndex + 1} ·{' '}
                      {s.table.records.filter((r) => r.cells.some((c) => !isBlank(c))).length} lignes non
                      vides
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-left">
                          <th scope="col" className="py-1 pr-3 font-medium">
                            Colonne Excel
                          </th>
                          <th scope="col" className="py-1 pr-3 font-medium">
                            Aperçu
                          </th>
                          <th scope="col" className="py-1 font-medium">
                            Correspond à
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.table.headers.map((h, c) => (
                          <tr key={c} className="border-t">
                            <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                              {h}
                              {s.table!.formulaColumns.has(c) && (
                                <span className="text-muted-foreground ml-1 text-xs">(formule)</span>
                              )}
                            </td>
                            <td
                              className="text-muted-foreground max-w-56 truncate py-1.5 pr-3"
                              title={sample(s, c)}
                            >
                              {sample(s, c) || '—'}
                            </td>
                            <td className="min-w-56 py-1.5">
                              <TargetSelect
                                kind={s.role as ImportKind}
                                label={`Correspondance de la colonne ${h}`}
                                value={s.targets[c] ?? 'ignore'}
                                onChange={(v) =>
                                  updateSheet(i, {
                                    ...s,
                                    targets: s.targets.map((t, j) => (j === c ? v : t)),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep('file')}>
                Changer de fichier
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!hasTables}>
                Vérifier l’import
              </Button>
            </div>
          </>
        )}

        {step === 'preview' && plan && counts && (
          <>
            <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">Options</legend>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={keepLegacyCodes}
                  onCheckedChange={(v) => setKeepLegacyCodes(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Garder les ID de l’Excel comme codes courts (ex. B04)
                  <span className="text-muted-foreground block text-xs">
                    Sinon : codes par matériau (PLA-001…). L’ID d’origine est conservé dans tous les cas.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={applySettings}
                  onCheckedChange={(v) => setApplySettings(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Reprendre les seuils du fichier ({plan.settings.lowThresholdG ?? '—'} g /{' '}
                  {plan.settings.criticalThresholdG ?? '—'} g)
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={saveMapping}
                  onCheckedChange={(v) => setSaveMapping(v === true)}
                  className="mt-0.5"
                />
                <span>Mémoriser la correspondance des colonnes pour les prochains imports</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Doublons (déjà présents dans FilaTrack)
                <NativeSelect
                  className="h-9"
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                >
                  <option value="skip">Ignorer (recommandé pour un réimport)</option>
                  <option value="update">Mettre à jour la fiche (sans toucher au stock)</option>
                  <option value="create">Créer en double</option>
                </NativeSelect>
              </label>
            </fieldset>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile
                label="Bobines"
                value={`${plan.spools.filter((s) => s.action === 'create').length} nouvelles`}
                hint={`${plan.stats.emptySpoolRows} lignes vides ignorées`}
              />
              <SummaryTile
                label="Impressions"
                value={`${plan.prints.filter((p) => p.action === 'create').length} nouvelles`}
                hint={`dont ${plan.stats.plannedPrints} planifiées`}
              />
              <SummaryTile label="Consommation déduite" value={formatGrams(plan.stats.deductedG)} />
              <SummaryTile
                label="Projets / gammes"
                value={`${plan.projects.length} / ${plan.products.length}`}
                hint={`${plan.customFieldDefs.length} champ(s) personnalisé(s)`}
              />
            </div>

            <section aria-label="Rapport">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Rapport</h3>
                {(['all', 'error', 'warning', 'info'] as const).map((l) => (
                  <Button
                    key={l}
                    size="sm"
                    variant={issueFilter === l ? 'secondary' : 'ghost'}
                    aria-pressed={issueFilter === l}
                    onClick={() => setIssueFilter(l)}
                  >
                    {
                      {
                        all: 'Tout',
                        error: `Erreurs (${counts.error})`,
                        warning: `Avertissements (${counts.warning})`,
                        info: `Infos (${counts.info})`,
                      }[l]
                    }
                  </Button>
                ))}
                <Button size="sm" variant="outline" className="ml-auto" onClick={reportCsv}>
                  Télécharger le rapport
                </Button>
              </div>
              <ul className="max-h-72 overflow-y-auto rounded-md border text-sm">
                {plan.issues
                  .filter((i) => issueFilter === 'all' || i.level === issueFilter)
                  .map((i, k) => {
                    const Icon = ISSUE_ICON[i.level];
                    return (
                      <li key={k} className="flex gap-2 border-b px-3 py-1.5 last:border-0">
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${ISSUE_CLS[i.level]}`}
                          aria-label={i.level}
                        />
                        <span>
                          <span className="text-muted-foreground">
                            {i.sheet}
                            {i.row ? ` · ligne ${i.row}` : ''}
                            {i.column ? ` · ${i.column}` : ''} —{' '}
                          </span>
                          {i.message}
                        </span>
                      </li>
                    );
                  })}
                {plan.issues.length === 0 && (
                  <li className="text-muted-foreground px-3 py-2">Aucun problème détecté.</li>
                )}
              </ul>
              {plan.reconciliation.length > 0 && (
                <p className="mt-2 text-sm">
                  <CheckCircle2 className="text-ok-foreground mr-1 inline size-4" aria-hidden />
                  Restants recalculés comparés à l’Excel :{' '}
                  {plan.reconciliation.filter((r) => Math.abs(r.diffG) <= 0.1).length}/
                  {plan.reconciliation.length} identiques.
                </p>
              )}
            </section>

            {plan.spools.length > 0 && (
              <section aria-label="Aperçu des bobines" className="relative overflow-x-auto">
                <h3 className="mb-2 font-semibold">Aperçu des bobines</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      {['Ligne', 'Code', 'Gamme', 'Couleur', 'Statut', 'Restant', 'Action'].map((h) => (
                        <th key={h} scope="col" className="py-1 pr-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.spools.map((p) => (
                      <tr key={p.spool.id + p.sourceRow} className="border-t">
                        <td className="text-muted-foreground py-1.5 pr-3">{p.sourceRow}</td>
                        <td className="py-1.5 pr-3 font-medium">{p.spool.code}</td>
                        <td className="py-1.5 pr-3">{p.spool.productLine}</td>
                        <td className="py-1.5 pr-3">
                          <span className="inline-flex items-center gap-1.5">
                            <ColorSwatch
                              decorative
                              hex={p.spool.colorHex}
                              name={p.spool.colorName}
                              size="sm"
                            />{' '}
                            {p.spool.colorName}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          {p.spool.status === 'ams'
                            ? `AMS ${p.spool.amsSlot}`
                            : SPOOL_STATUS_LABELS[p.spool.status]}
                          {p.spool.location ? ` · ${p.spool.location}` : ''}
                        </td>
                        <td
                          className={`py-1.5 pr-3 tabular-nums ${p.spool.remainingG < 0 ? 'text-danger-foreground' : ''}`}
                        >
                          {formatGrams(p.spool.remainingG)}
                        </td>
                        <td className="py-1.5">{ACTION_LABELS[p.action]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Retour aux colonnes
              </Button>
              <Button
                onClick={() => void doImport()}
                disabled={
                  busy ||
                  (plan.spools.every((s) => s.action === 'skip') &&
                    plan.prints.every((p) => p.action === 'skip'))
                }
              >
                {busy ? 'Import en cours…' : 'Importer'}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col gap-3" role="status">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="text-ok-foreground size-5" aria-hidden /> Import terminé
            </p>
            <ul className="list-inside list-disc text-sm">
              <li>
                {result.spoolsCreated} bobine(s) créée(s)
                {result.spoolsUpdated ? `, ${result.spoolsUpdated} mise(s) à jour` : ''}
              </li>
              <li>
                {result.printsCreated} impression(s) créée(s)
                {result.printsUpdated ? `, ${result.printsUpdated} mise(s) à jour` : ''}
              </li>
              <li>{result.projectsCreated} projet(s) créé(s)</li>
              <li>{result.movementsCreated} mouvement(s) ajoutés au journal</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/">Voir l’inventaire</Link>
              </Button>
              <Button variant="outline" onClick={reportCsv}>
                Télécharger le rapport
              </Button>
              <Button variant="ghost" onClick={() => setStep('file')}>
                Importer un autre fichier
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
