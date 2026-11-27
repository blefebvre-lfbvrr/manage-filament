import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCatalog, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/input';
import { getDb } from '@/db/db';
import { formatDateTime, formatGrams } from '@/lib/format';
import { spoolSearchText } from '@/lib/filters';
import { matchesQuery } from '@/lib/text';
import { ColorSwatch, StockBar } from '../inventory/SpoolBits';
import { defaultTareFor } from './WeighDialog';
import { WeighForm } from './WeighForm';

/** Mode pesée « atelier » : on enchaîne les bobines sur la balance. */
export function WeighPage() {
  const spools = useSpools();
  const settings = useSettings();
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    setSelectedId(id);
    // Sur mobile, le formulaire est sous la liste : on y amène l'utilisateur.
    if (window.innerWidth < 1024)
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const recent = useLiveQuery(
    async () => (await getDb().weighings.orderBy('at').reverse().limit(8).toArray()) ?? [],
    [],
    [],
  );

  const list = useMemo(
    () =>
      (spools ?? [])
        .filter((s) => s.status !== 'archived' && matchesQuery(spoolSearchText(s), query))
        .sort(
          (a, b) =>
            Number(Boolean(b.needsWeighing)) - Number(Boolean(a.needsWeighing)) ||
            Number(b.status === 'ams') - Number(a.status === 'ams') ||
            a.code.localeCompare(b.code, 'fr', { numeric: true }),
        ),
    [spools, query],
  );
  const selected =
    list.find((s) => s.id === selectedId) ?? (spools ?? []).find((s) => s.id === selectedId) ?? null;
  const codeOf = (id: string) => spools?.find((s) => s.id === id)?.code ?? '?';

  return (
    <>
      <PageHeader
        title="Pesée"
        description="Choisis une bobine, pose-la sur la balance et saisis le poids brut : la tare est soustraite automatiquement."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card>
          <CardHeader>
            <Input
              type="search"
              aria-label="Chercher une bobine"
              placeholder="Chercher (code, couleur…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            <ul className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto" aria-label="Bobines">
              {list.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === selectedId}
                    onClick={() => select(s.id)}
                    className={cn(
                      'hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-md p-2 text-left focus-visible:ring-2 focus-visible:outline-none',
                      s.id === selectedId && 'bg-accent ring-primary ring-2',
                    )}
                  >
                    <ColorSwatch hex={s.colorHex} name={s.colorName} finish={s.finish} decorative size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {s.code}
                        {s.needsWeighing && (
                          <AlertTriangle
                            className="text-warn-foreground size-4"
                            aria-label="Pesée recommandée"
                          />
                        )}
                      </span>
                      <span className="text-muted-foreground block truncate text-sm">
                        {s.productLine || s.material} {s.colorName}
                        {s.status === 'ams' && s.amsSlot ? ` · AMS ${s.amsSlot}` : ''}
                      </span>
                    </span>
                    <StockBar spool={s} settings={settings} className="w-28" />
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="text-muted-foreground p-4 text-sm">Aucune bobine.</li>}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4" ref={formRef}>
          <Card>
            <CardHeader>
              <CardTitle>{selected ? `Peser ${selected.code}` : 'Choisis une bobine'}</CardTitle>
              {selected && (
                <p className="text-muted-foreground text-sm">
                  {selected.productLine} {selected.colorName} ·{' '}
                  <Link className="text-primary underline" to={`/spools/${selected.id}`}>
                    voir la fiche
                  </Link>
                </p>
              )}
            </CardHeader>
            <CardContent>
              {selected ? (
                <WeighForm spool={selected} defaultTareG={defaultTareFor(selected, catalog)} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Les bobines « à peser » sont en haut de la liste.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dernières pesées</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y text-sm">
                {recent.map((w) => (
                  <li key={w.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      <strong>{codeOf(w.spoolId)}</strong> · {formatGrams(w.grossG)} − {formatGrams(w.tareG)}
                    </span>
                    <span className="tabular-nums">
                      = {formatGrams(w.netG)}{' '}
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(w.at, settings.dateFormat)}
                      </span>
                    </span>
                  </li>
                ))}
                {recent.length === 0 && <li className="text-muted-foreground">Aucune pesée.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
