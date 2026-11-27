import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { useSettings } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { getDataMode } from '@/db/db';
import { clearAllData, restoreBackup } from '@/db/repo';
import { validateBackup, type Backup, type TableName } from '@/lib/backup';
import { formatDateTime } from '@/lib/format';
import { ExcelImportWizard } from './ExcelImportWizard';
import { exportCsv, exportExcel, exportJsonBackup } from './exporters';

const COUNT_LABELS: Partial<Record<TableName, string>> = {
  spools: 'bobines',
  prints: 'impressions',
  movements: 'mouvements',
  projects: 'projets',
  products: 'gammes',
  colors: 'couleurs',
};

export function ImportExportPage() {
  const settings = useSettings();
  const location = useLocation();
  const backupRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: string } | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (location.hash === '#backup') backupRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de l’export.');
    }
  };

  return (
    <>
      <PageHeader
        title="Import / Export"
        description="Importe ton Excel, exporte tes données et fais des sauvegardes. Tout reste sur cet appareil."
      />
      <div className="flex flex-col gap-4">
        <ExcelImportWizard />

        <Card>
          <CardHeader>
            <CardTitle>Exporter</CardTitle>
            <CardDescription>
              L’export Excel contient les feuilles Bobines, Impressions, Mouvements et Projets. Les CSV
              utilisent le point-virgule (Excel français).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => void run(exportExcel, 'Export Excel téléchargé.')}>
              <FileSpreadsheet aria-hidden /> Excel (.xlsx)
            </Button>
            <Button variant="outline" onClick={() => void run(() => exportCsv('spools'), 'CSV téléchargé.')}>
              CSV bobines
            </Button>
            <Button variant="outline" onClick={() => void run(() => exportCsv('prints'), 'CSV téléchargé.')}>
              CSV impressions
            </Button>
            <Button
              variant="outline"
              onClick={() => void run(() => exportCsv('movements'), 'CSV téléchargé.')}
            >
              CSV mouvements
            </Button>
          </CardContent>
        </Card>

        <div ref={backupRef} id="backup">
          <Card>
            <CardHeader>
              <CardTitle>Sauvegarde et restauration</CardTitle>
              <CardDescription>
                Le fichier JSON contient absolument tout (bobines, journal, impressions, catalogue,
                paramètres, mappings). Garde-le en lieu sûr : c’est ta seule copie hors de ce navigateur.
                {settings.lastBackupAt && (
                  <> Dernière sauvegarde : {formatDateTime(settings.lastBackupAt, settings.dateFormat)}.</>
                )}
                {getDataMode() === 'demo' && <> (Mode démo : la sauvegarde concerne les données de démo.)</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => void run(exportJsonBackup, 'Sauvegarde téléchargée.')}>
                <Download aria-hidden /> Sauvegarder (JSON)
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden /> Restaurer une sauvegarde
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Fichier de sauvegarde"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const v = validateBackup(JSON.parse(await file.text()));
                    if (!v.ok) {
                      toast.error(v.errors.join('\n'));
                      return;
                    }
                    const summary = Object.entries(COUNT_LABELS)
                      .map(([k, label]) => `${v.counts[k as TableName]} ${label}`)
                      .join(', ');
                    setPending({
                      backup: v.backup,
                      summary: `${summary} — sauvegarde du ${formatDateTime(v.backup.exportedAt)}`,
                    });
                  } catch {
                    toast.error('Fichier illisible : ce n’est pas un JSON valide.');
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-4" aria-hidden /> Zone sensible
            </CardTitle>
            <CardDescription>
              Efface toutes les données de {getDataMode() === 'demo' ? 'la démo' : 'cet appareil'} (le
              catalogue de départ est recréé). Fais une sauvegarde avant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setConfirmClear(true)}>
              Tout effacer
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restaurer cette sauvegarde ?"
        destructive={mode === 'replace'}
        confirmLabel="Restaurer"
        description={
          <div className="flex flex-col gap-3">
            <p>{pending?.summary}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-foreground mb-1 font-medium">Mode</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1"
                />
                <span>
                  <strong>Remplacer</strong> : les données actuelles sont effacées puis remplacées.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                  className="mt-1"
                />
                <span>
                  <strong>Fusionner</strong> : les éléments de la sauvegarde écrasent ceux qui ont le même
                  identifiant, le reste est conservé.
                </span>
              </label>
            </fieldset>
          </div>
        }
        onConfirm={async () => {
          if (!pending) return;
          await restoreBackup(pending.backup, mode);
          toast.success('Sauvegarde restaurée.');
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        destructive
        title="Tout effacer ?"
        description="Cette action est irréversible sans sauvegarde."
        confirmLabel="Effacer définitivement"
        onConfirm={async () => {
          await clearAllData();
          toast.success('Données effacées.');
        }}
      />
    </>
  );
}
