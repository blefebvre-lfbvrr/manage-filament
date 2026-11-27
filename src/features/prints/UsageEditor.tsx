import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { formatGrams } from '@/lib/format';
import { checkStock } from '@/lib/prints';
import type { FilamentUsage, Spool } from '@/lib/schemas';
import { SpoolSelect } from '../inventory/SpoolSelect';

export interface UsageRow {
  spoolId: string | null;
  /** Grammes saisis (prévus si l'impression est ratée à X %). */
  grams: string;
  role: FilamentUsage['role'];
  lengthM?: number | null;
  slicerType?: string | null;
  slicerColor?: string | null;
  amsSlot?: FilamentUsage['amsSlot'];
  /** Suggestions de rattachement (ids de bobines) et explication. */
  suggested?: string[];
  hint?: string;
}

export const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').replace(/\s/g, ''));
  return v.trim() === '' || !Number.isFinite(n) ? NaN : n;
};

/** Message de vérification avant impression : « Ce fichier demande 180 g de …, tu en as 120 g ». */
export function StockWarnings({
  rows,
  spools,
  factor = 1,
}: {
  rows: UsageRow[];
  spools: Spool[];
  factor?: number;
}) {
  const checks = checkStock(
    rows.map((r) => ({ spoolId: r.spoolId, grams: (toNumber(r.grams) || 0) * factor })),
    spools,
  ).filter((c) => c.shortG > 0);
  if (!checks.length) return null;
  return (
    <ul
      className="border-warn/50 bg-warn/10 text-warn-foreground flex flex-col gap-1 rounded-md border p-3 text-sm"
      role="alert"
    >
      {checks.map((c) => {
        const s = spools.find((x) => x.id === c.spoolId)!;
        return (
          <li key={c.spoolId} className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Il faut {formatGrams(c.neededG)} de {s.productLine || s.material} {s.colorName} ({c.code}), il
              en reste {formatGrams(c.availableG)} : prévois un changement de bobine (relais) ou une autre
              bobine.
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function UsageEditor({
  rows,
  onChange,
  spools,
  idPrefix,
  failedPercent,
}: {
  rows: UsageRow[];
  onChange: (rows: UsageRow[]) => void;
  spools: Spool[];
  idPrefix: string;
  failedPercent?: number | null;
}) {
  const set = (i: number, patch: Partial<UsageRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const scaled = failedPercent != null && Number.isFinite(failedPercent);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Filaments utilisés</legend>
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucun filament : rien ne sera déduit.</p>
      )}
      {rows.map((r, i) => {
        const g = toNumber(r.grams);
        return (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]"
          >
            <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
              <SpoolSelect
                id={`${idPrefix}-spool-${i}`}
                label={`Bobine du filament ${i + 1}`}
                spools={spools}
                value={r.spoolId}
                suggested={r.suggested}
                onChange={(v) => set(i, { spoolId: v })}
              />
              {r.hint && <p className="text-muted-foreground text-xs">{r.hint}</p>}
            </div>
            <label className="text-muted-foreground flex flex-col gap-1 text-xs">
              {scaled ? 'Prévu (g)' : 'Grammes'}
              <Input
                inputMode="decimal"
                value={r.grams}
                aria-invalid={Number.isNaN(g) || undefined}
                onChange={(e) => set(i, { grams: e.target.value })}
                className="h-9"
              />
              {scaled && !Number.isNaN(g) && (
                <span className="text-foreground">
                  Déduit : {formatGrams(Math.round(g * failedPercent!) / 100)}
                </span>
              )}
            </label>
            <label className="text-muted-foreground flex flex-col gap-1 text-xs">
              Rôle
              <NativeSelect
                className="h-9"
                value={r.role}
                onChange={(e) => set(i, { role: e.target.value as UsageRow['role'] })}
              >
                <option value="main">Principale</option>
                <option value="relay">Relais (auto-refill)</option>
              </NativeSelect>
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              className="self-end"
              aria-label={`Retirer le filament ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, { spoolId: null, grams: '', role: 'main' }])}
      >
        <Plus aria-hidden /> Ajouter un filament
      </Button>
    </fieldset>
  );
}
