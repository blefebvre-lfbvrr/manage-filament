import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { setRemaining, updateSpool } from '@/db/repo';
import { locationOf } from '@/lib/filters';
import { formatCostPerGram, formatDate, formatGrams, formatMoney, formatPercent } from '@/lib/format';
import type { AppSettings, CustomFieldDef, Spool } from '@/lib/schemas';
import { costPerGram, percentRemaining, remainingValue, STOCK_LEVEL_LABELS } from '@/lib/spool';
import { ColorSwatch, LevelBadge, StatusBadge, StockBar } from './SpoolBits';
import { spoolLevel as levelOf } from '@/lib/spool';

/** Cellule éditable en ligne : clic ou Entrée pour éditer, Entrée pour valider, Échap pour annuler. */
function EditableCell({
  value,
  display,
  onCommit,
  numeric,
  label,
}: {
  value: string;
  display: React.ReactNode;
  onCommit: (v: string) => Promise<void>;
  numeric?: boolean;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = async () => {
    setEditing(false);
    if (draft === value) return;
    try {
      await onCommit(draft);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Modification impossible.');
    }
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        className="border-input bg-background h-8 w-full min-w-20 rounded border px-2 text-sm"
        inputMode={numeric ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="hover:bg-accent focus-visible:ring-ring w-full rounded px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:outline-none"
      aria-label={`${label} : modifier`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {display}
    </button>
  );
}

const num = (v: string) => {
  const n = Number(v.replace(',', '.').replace(/\s/g, ''));
  if (v.trim() === '' || !Number.isFinite(n)) throw new Error('Nombre invalide.');
  return n;
};

export function SpoolTable({
  spools,
  settings,
  customDefs,
  visibility,
  onVisibilityChange,
  selection,
  onSelectionChange,
  sorting,
  onSortingChange,
}: {
  spools: Spool[];
  settings: AppSettings;
  customDefs: CustomFieldDef[];
  visibility: VisibilityState;
  onVisibilityChange: (v: VisibilityState) => void;
  selection: RowSelectionState;
  onSelectionChange: (s: RowSelectionState) => void;
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
}) {
  const columns = useMemo<ColumnDef<Spool>[]>(() => {
    const cols: ColumnDef<Spool>[] = [
      {
        id: 'select',
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Tout sélectionner"
            checked={
              table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false
            }
            onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Sélectionner ${row.original.code}`}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        ),
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Code',
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            to={`/spools/${row.original.id}`}
            className="text-primary flex items-center gap-2 font-semibold hover:underline"
          >
            <ColorSwatch
              decorative
              hex={row.original.colorHex}
              name={row.original.colorName}
              finish={row.original.finish}
            />
            {row.original.code}
            {row.original.needsWeighing && (
              <AlertTriangle className="text-warn-foreground size-4" aria-label="Pesée recommandée" />
            )}
          </Link>
        ),
      },
      { id: 'productLine', accessorKey: 'productLine', header: 'Gamme' },
      { id: 'colorName', accessorKey: 'colorName', header: 'Couleur' },
      {
        id: 'brand',
        accessorKey: 'brand',
        header: 'Marque',
        cell: ({ getValue }) => (getValue() as string) || <span className="text-muted-foreground">—</span>,
      },
      { id: 'material', accessorKey: 'material', header: 'Matériau' },
      {
        id: 'status',
        accessorFn: (s) => (s.status === 'ams' ? `0${s.amsSlot}` : s.status),
        header: 'Statut',
        cell: ({ row }) => <StatusBadge spool={row.original} />,
      },
      {
        id: 'location',
        accessorFn: (s) => locationOf(s),
        header: 'Emplacement',
        cell: ({ row }) =>
          row.original.status === 'ams' || row.original.status === 'external' ? (
            locationOf(row.original)
          ) : (
            <EditableCell
              label={`Emplacement de ${row.original.code}`}
              value={row.original.location ?? ''}
              display={row.original.location || <span className="text-muted-foreground">—</span>}
              onCommit={(v) => updateSpool(row.original.id, { location: v.trim() || null })}
            />
          ),
      },
      {
        id: 'remainingG',
        accessorKey: 'remainingG',
        header: 'Restant',
        cell: ({ row }) => (
          <EditableCell
            numeric
            label={`Restant de ${row.original.code} (g)`}
            value={String(row.original.remainingG)}
            display={<StockBar spool={row.original} settings={settings} className="w-32" />}
            onCommit={async (v) => {
              const m = await setRemaining(row.original.id, num(v), 'Correction depuis le tableau');
              if (m)
                toast.success(
                  `${row.original.code} : restant corrigé (${m.deltaG > 0 ? '+' : ''}${m.deltaG} g). Annulable depuis la fiche.`,
                );
            }}
          />
        ),
      },
      {
        id: 'percent',
        accessorFn: (s) => percentRemaining(s.remainingG, s.initialNetG) ?? -1,
        header: '% restant',
        cell: ({ row }) => formatPercent(percentRemaining(row.original.remainingG, row.original.initialNetG)),
      },
      {
        id: 'level',
        accessorFn: (s) => ['empty', 'critical', 'low', 'ok'].indexOf(levelOf(s, settings)),
        header: 'Niveau',
        cell: ({ row }) => <LevelBadge level={levelOf(row.original, settings)} />,
      },
      {
        id: 'initialNetG',
        accessorKey: 'initialNetG',
        header: 'Poids net',
        cell: ({ row }) => formatGrams(row.original.initialNetG),
      },
      {
        id: 'price',
        accessorFn: (s) => s.price ?? -1,
        header: 'Prix',
        cell: ({ row }) => (
          <EditableCell
            numeric
            label={`Prix de ${row.original.code} (€)`}
            value={row.original.price == null ? '' : String(row.original.price)}
            display={formatMoney(row.original.price, settings.currency)}
            onCommit={(v) => updateSpool(row.original.id, { price: v.trim() ? num(v) : null })}
          />
        ),
      },
      {
        id: 'costPerKg',
        accessorFn: (s) => costPerGram(s) ?? -1,
        header: 'Coût / kg',
        cell: ({ row }) => formatCostPerGram(costPerGram(row.original), settings.currency),
      },
      {
        id: 'value',
        accessorFn: (s) => remainingValue(s),
        header: 'Valeur restante',
        cell: ({ row }) => formatMoney(remainingValue(row.original), settings.currency),
      },
      {
        id: 'purchaseDate',
        accessorFn: (s) => s.purchaseDate ?? '',
        header: 'Achat',
        cell: ({ row }) => formatDate(row.original.purchaseDate, settings.dateFormat),
      },
      {
        id: 'openedAt',
        accessorFn: (s) => s.openedAt ?? '',
        header: 'Ouverte le',
        cell: ({ row }) => formatDate(row.original.openedAt, settings.dateFormat),
      },
      {
        id: 'lastDriedAt',
        accessorFn: (s) => s.lastDriedAt ?? '',
        header: 'Séchage',
        cell: ({ row }) => formatDate(row.original.lastDriedAt, settings.dateFormat),
      },
      { id: 'shop', accessorFn: (s) => s.shop ?? '', header: 'Magasin' },
      { id: 'tags', accessorFn: (s) => s.tags.join(', '), header: 'Tags' },
      {
        id: 'notes',
        accessorFn: (s) => s.notes ?? '',
        header: 'Notes',
        cell: ({ row }) => (
          <EditableCell
            label={`Notes de ${row.original.code}`}
            value={row.original.notes ?? ''}
            display={
              <span className="text-muted-foreground line-clamp-2 max-w-72">{row.original.notes || '—'}</span>
            }
            onCommit={(v) => updateSpool(row.original.id, { notes: v.trim() || null })}
          />
        ),
      },
    ];
    for (const d of customDefs) {
      cols.push({
        id: `custom:${d.key}`,
        accessorFn: (s) => {
          const v = s.custom?.[d.key];
          return v === null || v === undefined ? '' : String(v);
        },
        header: d.label,
      });
    }
    return cols;
  }, [settings, customDefs]);

  const table = useReactTable({
    data: spools,
    columns,
    getRowId: (s) => s.id,
    state: { columnVisibility: visibility, rowSelection: selection, sorting },
    onColumnVisibilityChange: (u) => onVisibilityChange(typeof u === 'function' ? u(visibility) : u),
    onRowSelectionChange: (u) => onSelectionChange(typeof u === 'function' ? u(selection) : u),
    onSortingChange: (u) => onSortingChange(typeof u === 'function' ? u(sorting) : u),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-card relative overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Inventaire des bobines. Les en-têtes permettent de trier ; les cellules Restant, Prix, Emplacement
          et Notes sont modifiables.
        </caption>
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap"
                  >
                    {h.column.getCanSort() ? (
                      <button
                        type="button"
                        className="hover:text-foreground inline-flex items-center gap-1"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'hover:bg-muted/30 border-t',
                row.getIsSelected() && 'bg-primary/5',
                row.original.status === 'archived' && 'opacity-60',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-middle whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.getRowModel().rows.length === 0 && (
        <p className="text-muted-foreground p-6 text-center text-sm">
          Aucune bobine ne correspond aux filtres.
        </p>
      )}
      <p className="sr-only">{`Niveaux : ${Object.values(STOCK_LEVEL_LABELS).join(', ')}.`}</p>
    </div>
  );
}
