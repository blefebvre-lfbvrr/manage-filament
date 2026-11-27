import { useLiveQuery } from 'dexie-react-hooks';
import { Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { usePrints, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { getDb } from '@/db/db';
import { undoMovement } from '@/db/repo';
import { formatDateTime, formatGrams } from '@/lib/format';
import { MOVEMENT_LABELS } from '@/lib/movements';
import { MOVEMENT_TYPES, type MovementType } from '@/lib/schemas';
import { matchesQuery } from '@/lib/text';
import { ColorSwatch } from '../inventory/SpoolBits';

const PAGE = 100;

/** Journal global de tous les mouvements de stock, avec annulation. */
export function JournalPage() {
  const movements = useLiveQuery(() => getDb().movements.toArray(), [], []);
  const spools = useSpools(true);
  const prints = usePrints();
  const settings = useSettings();
  const [type, setType] = useState<MovementType | ''>('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const spoolById = useMemo(() => new Map((spools ?? []).map((s) => [s.id, s])), [spools]);
  const printById = useMemo(() => new Map((prints ?? []).map((p) => [p.id, p])), [prints]);
  const list = useMemo(
    () =>
      movements
        .filter((m) => !m.deletedAt && (!type || m.type === type))
        .filter((m) => {
          const s = spoolById.get(m.spoolId);
          return matchesQuery(
            `${s?.code ?? ''} ${s?.productLine ?? ''} ${s?.colorName ?? ''} ${m.note ?? ''}`,
            query,
          );
        })
        .sort((a, b) => b.at.localeCompare(a.at) || b.createdAt.localeCompare(a.createdAt)),
    [movements, type, query, spoolById],
  );

  return (
    <>
      <PageHeader
        title="Journal des mouvements"
        description="Chaque ajout, consommation, pesée ou correction du stock. Annuler un mouvement ajoute un mouvement inverse : rien n’est effacé."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          aria-label="Rechercher dans le journal"
          placeholder="Bobine, couleur, note…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-72"
        />
        <NativeSelect
          aria-label="Type de mouvement"
          value={type}
          onChange={(e) => setType(e.target.value as MovementType | '')}
          className="sm:max-w-56"
        >
          <option value="">Tous les types</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <span className="text-muted-foreground text-sm sm:ml-auto sm:self-center" role="status">
          {list.length} mouvement(s)
        </span>
      </div>
      <div className="bg-card relative overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <caption className="sr-only">Mouvements de stock, du plus récent au plus ancien</caption>
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              {['Date', 'Bobine', 'Type', 'Variation', 'Détail', ''].map((h, i) => (
                <th key={i} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((m) => {
              const s = spoolById.get(m.spoolId);
              const p = m.refKind === 'print' && m.refId ? printById.get(m.refId) : undefined;
              return (
                <tr
                  key={m.id}
                  className={`border-t ${m.reversedById ? 'text-muted-foreground line-through' : ''}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatDateTime(m.at, settings.dateFormat)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {s ? (
                      <Link
                        to={`/spools/${s.id}`}
                        className="text-primary inline-flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <ColorSwatch decorative hex={s.colorHex} name={s.colorName} size="sm" />
                        {s.code}
                      </Link>
                    ) : (
                      '?'
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{MOVEMENT_LABELS[m.type]}</td>
                  <td
                    className={`px-3 py-2 font-semibold whitespace-nowrap tabular-nums ${m.deltaG < 0 ? 'text-danger-foreground' : 'text-ok-foreground'}`}
                  >
                    {m.deltaG > 0 ? '+' : ''}
                    {formatGrams(m.deltaG)}
                  </td>
                  <td className="max-w-80 px-3 py-2">
                    <span className="line-clamp-2">
                      {p ? (
                        <Link to="/prints" className="underline">
                          {p.name}
                        </Link>
                      ) : (
                        m.note
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!m.reversedById && m.type !== 'undo' && m.type !== 'initial' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Annuler le mouvement ${MOVEMENT_LABELS[m.type]} de ${s?.code ?? ''}`}
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="text-muted-foreground p-6 text-center text-sm">Aucun mouvement.</p>
        )}
      </div>
      {list.length > limit && (
        <Button variant="outline" className="mt-3" onClick={() => setLimit((l) => l + PAGE)}>
          Afficher {Math.min(PAGE, list.length - limit)} de plus
        </Button>
      )}
    </>
  );
}
