import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Copy,
  Droplets,
  Pencil,
  PenLine,
  QrCode,
  Scale,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/db/db';
import { WeighDialog } from '../weighing/WeighDialog';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useCustomFields, useMovements, usePrints, useProjects, useSettings, useSpool } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import {
  duplicateSpool,
  markDried,
  restoreSpools,
  setRemaining,
  softDeleteSpools,
  undoMovement,
  updateSpool,
} from '@/db/repo';
import { PRINT_STATUS_LABELS, spoolCost } from '@/lib/export';
import { locationOf } from '@/lib/filters';
import { formatCostPerGram, formatDate, formatDateTime, formatGrams, formatMoney } from '@/lib/format';
import { MOVEMENT_LABELS, withRunningBalance } from '@/lib/movements';
import { costPerGram, effectiveThresholds, isHygroscopic, remainingValue } from '@/lib/spool';
import { spoolLevel as levelOf } from '@/lib/spool';
import { ColorSwatch, LevelBadge, StatusBadge, StockBar } from './SpoolBits';
import { SpoolFormDialog } from './SpoolFormDialog';

export function SpoolDetailPage() {
  const { id } = useParams();
  const spool = useSpool(id);
  const settings = useSettings();
  const movements = useMovements(id);
  const prints = usePrints();
  const projects = useProjects();
  const customDefs = useCustomFields('spool');
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [weigh, setWeigh] = useState(false);
  const weighings = useLiveQuery(
    async () =>
      id
        ? (await getDb().weighings.where('spoolId').equals(id).toArray()).sort((a, b) =>
            b.at.localeCompare(a.at),
          )
        : [],
    [id],
    [],
  );
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const journal = useMemo(() => withRunningBalance(movements).reverse(), [movements]);
  const usedIn = useMemo(
    () =>
      (prints ?? [])
        .filter((p) => p.usages.some((u) => u.spoolId === id))
        .sort(
          (a, b) =>
            (b.date ?? '').localeCompare(a.date ?? '') ||
            (b.legacyRow ?? 0) - (a.legacyRow ?? 0) ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [prints, id],
  );

  if (spool === undefined) return <p className="text-muted-foreground">Chargement…</p>;
  if (spool === null)
    return (
      <div className="flex flex-col gap-3">
        <p>Cette bobine n’existe pas (ou plus).</p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/">Retour à l’inventaire</Link>
        </Button>
      </div>
    );

  const t = effectiveThresholds(spool, settings);
  const cpg = costPerGram(spool);
  const projectName = (pid?: string | null) => projects?.find((p) => p.id === pid)?.name;
  const info: [string, React.ReactNode][] = [
    ['Marque', spool.brand || '—'],
    ['Gamme', spool.productLine || '—'],
    ['Matériau', spool.material || '—'],
    ['Couleur', `${spool.colorName || '—'}${spool.colorHex ? ` (${spool.colorHex})` : ''}`],
    ['Finition', spool.finish || '—'],
    ['Référence fabricant', spool.manufacturerRef || '—'],
    ['Emplacement', locationOf(spool) || '—'],
    ['Diamètre', `${spool.diameterMm} mm`],
    ['Poids net initial', formatGrams(spool.initialNetG)],
    ['Tare (bobine vide)', spool.tareG == null ? '—' : formatGrams(spool.tareG)],
    [
      'Recharge / RFID',
      `${spool.isRefill ? 'Recharge' : 'Bobine complète'} · ${spool.hasRfid ? 'puce RFID' : 'sans RFID'}`,
    ],
    ['Seuils', `bientôt vide ≤ ${t.lowG} g · à changer ≤ ${t.criticalG} g`],
    [
      'Prix',
      `${formatMoney(spool.price, settings.currency)}${spool.shippingShare ? ` + ${formatMoney(spool.shippingShare, settings.currency)} de port` : ''}`,
    ],
    ['Coût', formatCostPerGram(cpg, settings.currency)],
    ['Valeur restante', formatMoney(remainingValue(spool), settings.currency)],
    ['Magasin', spool.shop || '—'],
    [
      'Achat',
      `${formatDate(spool.purchaseDate, settings.dateFormat)}${spool.orderNo ? ` · commande ${spool.orderNo}` : ''}${spool.lot ? ` · lot ${spool.lot}` : ''}`,
    ],
    ['Ouverte le', formatDate(spool.openedAt, settings.dateFormat)],
    [
      'Dernier séchage',
      `${formatDate(spool.lastDriedAt, settings.dateFormat)}${spool.humidityNote ? ` · ${spool.humidityNote}` : ''}`,
    ],
    [
      'Réglages',
      spool.settings
        ? [
            spool.settings.nozzleTempMin || spool.settings.nozzleTempMax
              ? `buse ${spool.settings.nozzleTempMin ?? '?'}–${spool.settings.nozzleTempMax ?? '?'} °C`
              : null,
            spool.settings.bedTemp ? `plateau ${spool.settings.bedTemp} °C` : null,
            spool.settings.speed,
            spool.settings.notes,
          ]
            .filter(Boolean)
            .join(' · ') || '—'
        : '—',
    ],
    ['ID d’origine', spool.legacyId || '—'],
    ['Tags', spool.tags.length ? spool.tags.join(', ') : '—'],
    ...customDefs.map((d): [string, React.ReactNode] => [
      d.label,
      spool.custom?.[d.key] == null ? '—' : String(spool.custom[d.key]),
    ]),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="self-start" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden /> Retour
      </Button>

      <Card>
        <div
          className="h-2 rounded-t-xl"
          style={{ backgroundColor: spool.colorHex ?? 'transparent' }}
          aria-hidden
        />
        <CardHeader className="gap-4 sm:flex-row sm:items-center">
          <ColorSwatch hex={spool.colorHex} name={spool.colorName} finish={spool.finish} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{spool.code}</h1>
            <p className="text-muted-foreground">
              {[spool.brand, spool.productLine || spool.material, spool.colorName]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge spool={spool} />
              <LevelBadge level={levelOf(spool, settings)} />
              {spool.deletedAt && <Badge tone="danger">Supprimée</Badge>}
              {spool.needsWeighing && (
                <Badge tone="warn">
                  <AlertTriangle className="size-3" aria-hidden /> Pesée recommandée
                </Badge>
              )}
            </div>
          </div>
          <StockBar spool={spool} settings={settings} className="w-full sm:w-56" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => setWeigh(true)}>
            <Scale aria-hidden /> Peser
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTarget(String(spool.remainingG));
              setNote('');
              setCorrect(true);
            }}
          >
            <PenLine aria-hidden /> Corriger le restant
          </Button>
          {isHygroscopic(spool.material) && spool.status !== 'sealed' && (
            <Button
              variant="outline"
              onClick={async () => {
                await markDried(spool.id);
                toast.success('Séchage enregistré.');
              }}
            >
              <Droplets aria-hidden /> Séchée aujourd’hui
            </Button>
          )}
          {spool.status !== 'ams' && (
            <Button variant="outline" asChild>
              <Link to="/ams">Mettre dans l’AMS</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil aria-hidden /> Modifier
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/labels?ids=${spool.id}`}>
              <QrCode aria-hidden /> Étiquette
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const [c] = await duplicateSpool(spool.id, 1);
              toast.success(`Copie ${c!.code} créée.`, {
                action: { label: 'Ouvrir', onClick: () => navigate(`/spools/${c!.id}`) },
              });
            }}
          >
            <Copy aria-hidden /> Dupliquer
          </Button>
          {spool.status !== 'empty' && (
            <Button
              variant="outline"
              onClick={async () => {
                await updateSpool(spool.id, { status: 'empty' });
                toast.success('Bobine marquée vide.');
              }}
            >
              Marquer vide
            </Button>
          )}
          {spool.status !== 'archived' && (
            <Button
              variant="outline"
              onClick={async () => {
                await updateSpool(spool.id, { status: 'archived' });
                toast.success('Bobine archivée.');
              }}
            >
              <Archive aria-hidden /> Archiver
            </Button>
          )}
          {spool.deletedAt ? (
            <Button variant="outline" onClick={() => void restoreSpools([spool.id])}>
              Restaurer
            </Button>
          ) : (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden /> Supprimer
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              {info.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="mb-1 sm:mb-0">{v}</dd>
                </div>
              ))}
            </dl>
            {spool.notes && (
              <div className="bg-muted mt-4 rounded-md p-3 text-sm">
                <p className="mb-1 font-medium">Notes</p>
                <p className="whitespace-pre-wrap">{spool.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Journal des mouvements</CardTitle>
            <p className="text-muted-foreground text-sm">
              Chaque modification du stock est tracée. « Annuler » ajoute un mouvement inverse.
            </p>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y">
              {journal.map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm ${m.reversedById ? 'text-muted-foreground line-through' : ''}`}
                >
                  <span className="text-muted-foreground w-28 shrink-0 text-xs tabular-nums">
                    {formatDateTime(m.at, settings.dateFormat)}
                  </span>
                  <span className="font-medium">{MOVEMENT_LABELS[m.type]}</span>
                  <span
                    className={`font-semibold tabular-nums ${m.deltaG < 0 ? 'text-danger-foreground' : 'text-ok-foreground'}`}
                  >
                    {m.deltaG > 0 ? '+' : ''}
                    {formatGrams(m.deltaG)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    → {formatGrams(m.balanceAfterG)}
                  </span>
                  {m.note && <span className="text-muted-foreground w-full text-xs sm:w-auto">{m.note}</span>}
                  {!m.reversedById && m.type !== 'undo' && m.type !== 'initial' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={async () => {
                        try {
                          await undoMovement(m.id);
                          toast.success('Mouvement annulé.');
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Annulation impossible.');
                        }
                      }}
                    >
                      <Undo2 aria-hidden /> Annuler
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {weighings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pesées ({weighings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {weighings.map((w) => (
                <li key={w.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground tabular-nums">
                    {formatDateTime(w.at, settings.dateFormat)}
                  </span>
                  <span className="tabular-nums">
                    {formatGrams(w.grossG)} brut − {formatGrams(w.tareG)} tare ={' '}
                    <strong>{formatGrams(w.netG)}</strong>
                  </span>
                  {w.note && <span className="text-muted-foreground w-full text-xs">{w.note}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Impressions avec cette bobine ({usedIn.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {usedIn.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune impression enregistrée.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {usedIn.map((p) => {
                const g = p.usages.filter((u) => u.spoolId === id).reduce((a, u) => a + u.grams, 0);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge tone={p.status === 'success' ? 'ok' : p.status === 'failed' ? 'danger' : 'muted'}>
                      {PRINT_STATUS_LABELS[p.status]}
                    </Badge>
                    {projectName(p.projectId) && (
                      <span className="text-muted-foreground">{projectName(p.projectId)}</span>
                    )}
                    <span className="ml-auto tabular-nums">{formatGrams(g)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatMoney(spoolCost(spool, g), settings.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <SpoolFormDialog open={edit} onOpenChange={setEdit} spool={spool} />
      <WeighDialog spool={spool} open={weigh} onOpenChange={setWeigh} />

      <Dialog open={correct} onOpenChange={setCorrect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corriger le restant de {spool.code}</DialogTitle>
            <DialogDescription>
              Indique le poids net de filament restant. Un mouvement « correction » annulable est ajouté au
              journal. Pour une mesure sur balance, utilise plutôt « Peser ».
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = Number(target.replace(',', '.'));
              if (!Number.isFinite(v) || target.trim() === '') {
                toast.error('Valeur invalide.');
                return;
              }
              const m = await setRemaining(spool.id, v, note.trim() || null);
              toast.success(
                m ? `Restant corrigé (${m.deltaG > 0 ? '+' : ''}${m.deltaG} g).` : 'Aucun changement.',
              );
              setCorrect(false);
            }}
          >
            <Field
              label="Restant (g)"
              htmlFor="correct-target"
              hint={`Actuellement ${formatGrams(spool.remainingG)}`}
            >
              <Input
                id="correct-target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Note (facultatif)" htmlFor="correct-note">
              <Input
                id="correct-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ex. pesée sur balance de cuisine"
              />
            </Field>
            <DialogFooter>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={`Supprimer ${spool.code} ?`}
        description="La bobine disparaît de l’inventaire ; son historique est conservé et elle reste restaurable."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await softDeleteSpools([spool.id]);
          toast.success(`${spool.code} supprimée.`, {
            action: { label: 'Annuler', onClick: () => void restoreSpools([spool.id]) },
          });
          navigate('/');
        }}
      />
    </div>
  );
}
