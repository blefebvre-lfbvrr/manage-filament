import type { RowSelectionState, SortingState, VisibilityState } from '@tanstack/react-table';
import { Archive, Columns3, Copy, LayoutGrid, MapPin, PackageOpen, Plus, Rows3, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useCustomFields, useLocations, useLocalState, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { bulkUpdateSpools, duplicateSpool, restoreSpools, softDeleteSpools } from '@/db/repo';
import {
  distinctValues,
  EMPTY_FILTERS,
  filterSpools,
  locationOf,
  sortSpools,
  type SpoolFilters,
} from '@/lib/filters';
import { formatGrams, formatMoney } from '@/lib/format';
import type { SpoolStatus } from '@/lib/schemas';
import { remainingValue, SPOOL_STATUS_LABELS, spoolLevel as levelOf } from '@/lib/spool';
import { SpoolCard } from './SpoolCard';
import { SpoolFormDialog } from './SpoolFormDialog';
import { COLUMN_LABELS, DEFAULT_HIDDEN } from './columns';
import { SpoolTable } from './SpoolTable';
import { FiltersBar } from './FiltersBar';

export function InventoryPage() {
  const spools = useSpools();
  const settings = useSettings();
  const customDefs = useCustomFields('spool');
  const knownLocations = useLocations();
  const [filters, setFilters] = useLocalState<SpoolFilters>('inventory.filters', EMPTY_FILTERS);
  const [view, setView] = useLocalState<'table' | 'grid'>(
    'inventory.view',
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches ? 'grid' : 'table',
  );
  const [visibility, setVisibility] = useLocalState<VisibilityState>('inventory.columns', DEFAULT_HIDDEN);
  const [sorting, setSorting] = useLocalState<SortingState>('inventory.sorting', [
    { id: 'code', desc: false },
  ]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [locationDialog, setLocationDialog] = useState(false);
  const [locationValue, setLocationValue] = useState('');
  const [dupDialog, setDupDialog] = useState(false);
  const [dupCount, setDupCount] = useState('1');
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => spools ?? [], [spools]);
  const filtered = useMemo(
    () => filterSpools(all, { ...EMPTY_FILTERS, ...filters }, settings),
    [all, filters, settings],
  );
  const gridSorted = useMemo(() => sortSpools(filtered, sorting[0]), [filtered, sorting]);
  const selectedIds = Object.keys(selection).filter((k) => selection[k] && filtered.some((s) => s.id === k));

  const active = all.filter((s) => s.status !== 'archived');
  const stock = active.filter((s) => s.status !== 'empty');
  const totalG = stock.reduce((a, s) => a + Math.max(0, s.remainingG), 0);
  const value = stock.reduce((a, s) => a + remainingValue(s), 0);
  const watch = active.filter((s) => levelOf(s, settings) !== 'ok').length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setFormOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bulkStatus = async (status: SpoolStatus) => {
    try {
      await bulkUpdateSpools(selectedIds, { status });
      toast.success(`${selectedIds.length} bobine(s) : statut « ${SPOOL_STATUS_LABELS[status]} ».`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action impossible.');
    }
  };

  const toggleSelected = (id: string, v: boolean) => setSelection((s) => ({ ...s, [id]: v }));

  if (!spools) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <>
      <PageHeader
        title="Inventaire"
        description="Toutes tes bobines, leur restant et leur emplacement."
        actions={
          <Button onClick={() => setFormOpen(true)} aria-keyshortcuts="n">
            <Plus aria-hidden /> Ajouter
          </Button>
        }
      />

      <section aria-label="Résumé du stock" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bobines actives" value={String(active.length)} />
        <Stat label="Filament en stock" value={formatGrams(totalG, 'kg')} />
        <Stat label="Valeur du stock" value={formatMoney(value, settings.currency)} />
        <Stat
          label="À surveiller"
          value={String(watch)}
          hint="bientôt vides, à changer ou vides"
          tone={watch ? 'warn' : undefined}
        />
      </section>

      {all.length === 0 ? (
        <EmptyState onAdd={() => setFormOpen(true)} />
      ) : (
        <div className="flex flex-col gap-3">
          <FiltersBar
            ref={searchRef}
            filters={{ ...EMPTY_FILTERS, ...filters }}
            onChange={setFilters}
            materials={distinctValues(all, (s) => s.material)}
            brands={distinctValues(all, (s) => s.brand)}
            locations={[...new Set([...distinctValues(all, locationOf), ...knownLocations])].sort((a, b) =>
              a.localeCompare(b, 'fr'),
            )}
            resultCount={filtered.length}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Affichage" className="inline-flex rounded-md border">
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={view === 'table'}
                onClick={() => setView('table')}
              >
                <Rows3 aria-hidden /> Tableau
              </Button>
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid aria-hidden /> Cartes
              </Button>
            </div>
            {view === 'table' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 aria-hidden /> Colonnes
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
                  {[
                    ...Object.entries(COLUMN_LABELS).filter(([k]) => k !== 'code'),
                    ...customDefs.map((d) => [`custom:${d.key}`, d.label] as const),
                  ].map(([key, label]) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibility[key] !== false}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(c) => setVisibility({ ...visibility, [key]: c })}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Trier par</span>
                <select
                  className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                  value={`${sorting[0]?.id ?? 'code'}:${sorting[0]?.desc ? 'desc' : 'asc'}`}
                  onChange={(e) => {
                    const [id, dir] = e.target.value.split(':');
                    setSorting([{ id: id!, desc: dir === 'desc' }]);
                  }}
                >
                  <option value="code:asc">Code</option>
                  <option value="remainingG:asc">Restant (croissant)</option>
                  <option value="remainingG:desc">Restant (décroissant)</option>
                  <option value="productLine:asc">Gamme</option>
                  <option value="colorName:asc">Couleur</option>
                  <option value="status:asc">Statut</option>
                </select>
              </label>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div
              role="region"
              aria-label="Actions groupées"
              className="bg-card sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-lg border p-2 shadow-sm md:top-2"
            >
              <span className="px-2 text-sm font-medium">{selectedIds.length} sélectionnée(s)</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <PackageOpen aria-hidden /> Statut
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(['sealed', 'opened', 'external', 'empty', 'archived'] as SpoolStatus[]).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => void bulkStatus(s)}>
                      {SPOOL_STATUS_LABELS[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setLocationDialog(true)}>
                <MapPin aria-hidden /> Emplacement
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDupDialog(true)}>
                <Copy aria-hidden /> Dupliquer
              </Button>
              <Button variant="outline" size="sm" onClick={() => void bulkStatus('archived')}>
                <Archive aria-hidden /> Archiver
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden /> Supprimer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelection({})}>
                Désélectionner
              </Button>
            </div>
          )}

          {view === 'table' ? (
            <SpoolTable
              spools={filtered}
              settings={settings}
              customDefs={customDefs}
              visibility={visibility}
              onVisibilityChange={setVisibility}
              selection={selection}
              onSelectionChange={setSelection}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {gridSorted.map((s) => (
                <li key={s.id}>
                  <SpoolCard
                    spool={s}
                    settings={settings}
                    selected={Boolean(selection[s.id])}
                    onSelectedChange={(v) => toggleSelected(s.id, v)}
                  />
                </li>
              ))}
              {gridSorted.length === 0 && (
                <li className="text-muted-foreground col-span-full p-6 text-center text-sm">
                  Aucune bobine ne correspond aux filtres.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <SpoolFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={`Supprimer ${selectedIds.length} bobine(s) ?`}
        description="Elles disparaissent de l’inventaire mais leur historique est conservé. Tu pourras annuler juste après."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          const ids = [...selectedIds];
          await softDeleteSpools(ids);
          setSelection({});
          toast.success(`${ids.length} bobine(s) supprimée(s).`, {
            action: { label: 'Annuler', onClick: () => void restoreSpools(ids) },
          });
        }}
      />

      <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer l’emplacement</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await bulkUpdateSpools(selectedIds, { location: locationValue.trim() || null });
              toast.success('Emplacement mis à jour.');
              setLocationDialog(false);
            }}
          >
            <Field label="Nouvel emplacement" htmlFor="bulk-location" hint="Laisse vide pour effacer">
              <Input
                id="bulk-location"
                list="bulk-locations"
                value={locationValue}
                onChange={(e) => setLocationValue(e.target.value)}
                autoFocus
              />
              <datalist id="bulk-locations">
                {knownLocations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
            <DialogFooter>
              <Button type="submit">Appliquer à {selectedIds.length} bobine(s)</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dupDialog} onOpenChange={setDupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dupliquer</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const n = Math.max(1, Math.min(50, Number(dupCount) || 1));
              let total = 0;
              for (const id of selectedIds) total += (await duplicateSpool(id, n)).length;
              toast.success(`${total} bobine(s) créée(s), neuves et scellées.`);
              setDupDialog(false);
            }}
          >
            <Field
              label="Copies par bobine"
              htmlFor="dup-count"
              hint="Les copies sont neuves (restant = poids net), avec un nouveau code."
            >
              <Input
                id="dup-count"
                type="number"
                min={1}
                max={50}
                value={dupCount}
                onChange={(e) => setDupCount(e.target.value)}
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button type="submit">Dupliquer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === 'warn' ? 'text-warn-foreground' : ''}`}>
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </Card>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <h2 className="text-lg font-semibold">Aucune bobine pour l’instant</h2>
      <p className="text-muted-foreground text-sm">
        Ajoute ta première bobine, importe ton fichier Excel, ou essaie l’application avec des données de
        démo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAdd}>
          <Plus aria-hidden /> Ajouter une bobine
        </Button>
        <Button variant="outline" asChild>
          <Link to="/data">Importer mon Excel</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/settings#demo">Activer la démo</Link>
        </Button>
      </div>
    </Card>
  );
}
