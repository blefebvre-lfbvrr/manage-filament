import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, CloudDownload, EyeOff, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useProjects, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { getDb } from '@/db/db';
import {
  autoValidateBambu,
  bambuPrintInput,
  saveSettings,
  setBambuTaskState,
  validateBambuTask,
} from '@/db/repo';
import { matchTaskProject, proposeUsages, toUsages, type UsageProposal } from '@/lib/bambu/inbox';
import { bambuTaskSchema, HEARTBEAT_MS, type BambuTask } from '@/lib/bambu/tasks';
import { formatDateTime, formatGrams } from '@/lib/format';
import { formatDuration } from '@/lib/prints';
import type { BambuInboxItem, Project, Spool } from '@/lib/schemas';
import { CloudSyncButton } from '../projects/CloudSyncButton';
import { ColorSwatch } from '../inventory/SpoolBits';
import { SpoolSelect } from '../inventory/SpoolSelect';

const STATUS: Record<
  BambuTask['status'],
  { label: string; tone: 'ok' | 'danger' | 'warn' | 'info' | 'muted' }
> = {
  success: { label: 'Réussie', tone: 'ok' },
  failed: { label: 'Échouée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'warn' },
  running: { label: 'En cours', tone: 'info' },
  unknown: { label: 'Statut inconnu', tone: 'muted' },
};

function useBambuInbox() {
  return useLiveQuery(
    async () => (await getDb().bambuTasks.toArray()).sort((a, b) => taskTime(b).localeCompare(taskTime(a))),
    [],
    [] as BambuInboxItem[],
  );
}

function taskTime(i: BambuInboxItem): string {
  const t = i.task as Partial<BambuTask>;
  return t.endTime ?? t.startTime ?? i.receivedAt;
}

const ago = (iso: string) => formatDistanceToNow(parseISO(iso), { locale: fr, addSuffix: true });

export function InboxPage() {
  const items = useBambuInbox();
  const spools = useSpools() ?? [];
  const projects = useProjects() ?? [];
  const settings = useSettings();
  const [tab, setTab] = useState<'pending' | 'validated' | 'ignored'>('pending');
  const [now] = useState(() => Date.now());
  const list = items.filter((i) => i.state === tab);
  const counts = {
    pending: items.filter((i) => i.state === 'pending').length,
    validated: items.filter((i) => i.state === 'validated').length,
    ignored: items.filter((i) => i.state === 'ignored').length,
  };
  const checked = settings.bambu.lastCheckedAt ?? settings.bambu.lastFileUpdatedAt;
  const stale = checked ? now - Date.parse(checked) > 2 * HEARTBEAT_MS : false;

  return (
    <>
      <PageHeader
        title="À valider"
        description="Impressions récupérées du cloud Bambu Lab. Rien n’est déduit du stock avant ta validation, et une impression n’est jamais déduite deux fois."
        actions={<CloudSyncButton />}
      />
      <Card className="mb-4 flex flex-col gap-2 p-4 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <CloudDownload className="size-4" aria-hidden />
          {checked ? (
            <span>
              Dernière synchro Bambu <strong>{ago(checked)}</strong>
              {settings.bambu.lastFileUpdatedAt && settings.bambu.lastFileUpdatedAt !== checked && (
                <> · dernière nouveauté {ago(settings.bambu.lastFileUpdatedAt)}</>
              )}
              {settings.cloud.lastSyncAt && <> · récupérée par l’app {ago(settings.cloud.lastSyncAt)}</>}
            </span>
          ) : (
            <span>
              Aucune synchro Bambu reçue pour l’instant. Configure la synchro du dépôt privé dans les{' '}
              <Link to="/settings#cloud" className="underline">
                paramètres
              </Link>{' '}
              puis la GitHub Action (voir le README, section « Synchro cloud Bambu »).
            </span>
          )}
        </p>
        {stale && (
          <p className="text-warn-foreground flex items-center gap-2">
            <TriangleAlert className="size-4" aria-hidden /> La synchro ne semble plus tourner : le token
            Bambu a peut-être expiré (une issue « Token Bambu expiré » est ouverte dans ce cas).
          </p>
        )}
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.bambu.autoValidate}
            onCheckedChange={async (v) => {
              await saveSettings({ bambu: { ...settings.bambu, autoValidate: v === true } });
              if (v === true) {
                const n = await autoValidateBambu();
                if (n) toast.success(`${n} impression(s) validée(s) automatiquement.`);
              }
            }}
          />
          Valider automatiquement les impressions réussies quand toutes les bobines sont sûres (slot AMS et
          couleur identiques)
        </label>
      </Card>

      <div role="tablist" aria-label="État" className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ['pending', 'À valider'],
            ['validated', 'Validées'],
            ['ignored', 'Ignorées'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            role="tab"
            aria-selected={tab === k}
            variant={tab === k ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(k)}
          >
            {label} ({counts[k]})
          </Button>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {list.map((item) => (
          <li key={item.id}>
            <InboxCard item={item} spools={spools} projects={projects} />
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-muted-foreground p-6 text-center text-sm">
            {tab === 'pending' ? 'Rien à valider.' : 'Aucune impression.'}
          </li>
        )}
      </ul>
    </>
  );
}

function InboxCard({
  item,
  spools,
  projects,
}: {
  item: BambuInboxItem;
  spools: Spool[];
  projects: Project[];
}) {
  const settings = useSettings();
  const task = useMemo(() => {
    const parsed = bambuTaskSchema.safeParse(item.task);
    return parsed.success ? parsed.data : null;
  }, [item.task]);
  const initial = useMemo(() => (task ? proposeUsages(task, spools) : []), [task, spools]);
  const match = useMemo(() => (task ? matchTaskProject(task, projects) : null), [task, projects]);
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [percent, setPercent] = useState('');
  const [busy, setBusy] = useState(false);
  if (!task) {
    return <Card className="p-4 text-sm">Impression {item.id} illisible (format inattendu).</Card>;
  }
  const proposals: UsageProposal[] = initial.map((p) =>
    p.filamentIndex in overrides
      ? { ...p, spoolId: overrides[p.filamentIndex] ?? null, certain: false, reason: 'choix manuel' }
      : p,
  );
  const pid = projectId === undefined ? (match?.project.id ?? '') : projectId;
  const st = STATUS[task.status];
  const isFail = task.status === 'failed' || task.status === 'cancelled';
  const pending = item.state === 'pending';
  const byId = new Map(spools.map((s) => [s.id, s]));

  const validate = async () => {
    if (task.status === 'running') return toast.error('Impression encore en cours : attends la fin.');
    let pct: number | null = null;
    if (isFail) {
      pct = Number(percent.replace(',', '.'));
      if (!percent.trim() || !(pct >= 0 && pct <= 100))
        return toast.error('Indique l’avancement au moment de l’arrêt (0 à 100 %).');
    }
    if (proposals.some((p) => !p.spoolId && p.grams > 0))
      return toast.error('Choisis une bobine pour chaque filament (ou ignore l’impression).');
    setBusy(true);
    try {
      const same = Boolean(pid && match?.project.id === pid);
      await validateBambuTask(item.id, {
        ...bambuPrintInput(task, toUsages(task, proposals, pct), pid || null, pct),
        projectPartId: same ? (match?.part?.id ?? null) : null,
        plateIndex: same ? (match?.plateIndex ?? null) : null,
      });
      toast.success(`« ${task.plateName ?? task.title} » validée : stock mis à jour.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Validation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card role="region" className="flex flex-col gap-3 p-4" aria-label={task.plateName ?? task.title}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold break-words">{task.plateName ?? task.title}</h2>
          {task.fileName && (
            <p className="text-muted-foreground text-sm break-words">
              {task.fileName}
              {task.plateIndex != null && ` · plateau ${task.plateIndex}`}
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            {formatDateTime(task.endTime ?? task.startTime, settings.dateFormat)}
            {task.deviceName && ` · ${task.deviceName}`}
            {task.durationS != null && ` · ${formatDuration(task.durationS / 60)}`}
            {task.weightG != null && ` · ${formatGrams(task.weightG)}`}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {pending ? (
        <>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => {
              const f = task.filaments[p.filamentIndex]!;
              return (
                <li
                  key={p.filamentIndex}
                  className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <ColorSwatch hex={f.color} name={f.type || 'Filament'} />
                    <span>
                      {f.type || 'Filament'}
                      {f.slot !== null && f.slot <= 3 && ` · slot ${f.slot + 1}`} · {formatGrams(f.grams)}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SpoolSelect
                        spools={spools}
                        value={p.spoolId}
                        onChange={(v) => setOverrides((o) => ({ ...o, [p.filamentIndex]: v }))}
                        label={`Bobine pour ${f.type || 'le filament'} ${p.filamentIndex + 1}`}
                        suggested={
                          initial[p.filamentIndex]?.spoolId ? [initial[p.filamentIndex]!.spoolId!] : []
                        }
                        invalid={!p.spoolId}
                      />
                    </div>
                    <Badge tone={p.certain ? 'ok' : p.spoolId ? 'warn' : 'danger'}>
                      {p.certain ? 'sûr' : p.spoolId ? 'à vérifier' : 'à choisir'} · {p.reason}
                    </Badge>
                    {p.spoolId && byId.get(p.spoolId) && byId.get(p.spoolId)!.remainingG < p.grams && (
                      <Badge tone="danger">stock insuffisant</Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Projet</span>
              <NativeSelect
                value={pid}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-auto max-w-full"
              >
                <option value="">— Aucun projet —</option>
                {projects
                  .filter((p) => !p.archived || p.id === pid)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.code ? ` [${p.code}]` : ''}
                    </option>
                  ))}
              </NativeSelect>
              {match && pid === match.project.id && (
                <span className="text-muted-foreground text-xs">
                  Rattaché automatiquement : {match.reason}
                  {match.part && ` · pièce « ${match.part.name} »`}
                </span>
              )}
            </label>
            {isFail && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Avancement à l’arrêt (%)</span>
                <Input
                  inputMode="decimal"
                  className="w-28"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  placeholder="ex. 40"
                />
              </label>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  await setBambuTaskState(item.id, 'ignored');
                  toast.success('Impression ignorée (aucune déduction).');
                }}
              >
                <EyeOff aria-hidden /> Ignorer
              </Button>
              <Button disabled={busy || task.status === 'running'} onClick={() => void validate()}>
                <CheckCircle2 aria-hidden /> Valider
              </Button>
            </div>
          </div>
          {isFail && (
            <p className="text-muted-foreground text-xs">
              Échec ou annulation : la consommation déduite = filament prévu × avancement (le cloud ne fournit
              pas la quantité réellement extrudée).
            </p>
          )}
        </>
      ) : item.state === 'validated' ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="text-ok-foreground size-4" aria-hidden /> Validée
          {item.decidedAt && ` ${ago(item.decidedAt)}`} ·{' '}
          <Link to="/prints" className="underline">
            voir dans les impressions
          </Link>
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Ignorée{item.decidedAt && ` ${ago(item.decidedAt)}`}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await setBambuTaskState(item.id, 'pending');
            }}
          >
            <RotateCcw aria-hidden /> Remettre à valider
          </Button>
        </p>
      )}
    </Card>
  );
}
