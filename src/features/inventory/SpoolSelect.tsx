import { NativeSelect } from '@/components/ui/input';
import { formatGrams } from '@/lib/format';
import type { Spool } from '@/lib/schemas';
import { ColorSwatch } from './SpoolBits';

export function spoolOptionLabel(s: Spool): string {
  const where =
    s.status === 'ams' && s.amsSlot ? ` · AMS ${s.amsSlot}` : s.status === 'external' ? ' · externe' : '';
  return `${s.code} · ${s.productLine || s.material} ${s.colorName}${where} · ${formatGrams(s.remainingG)}`;
}

/** Sélecteur de bobine accessible (select natif), bobines de l'AMS en premier. */
export function SpoolSelect({
  id,
  spools,
  value,
  onChange,
  label,
  suggested = [],
  placeholder = '— Choisir une bobine —',
  invalid,
}: {
  id?: string;
  spools: Spool[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  /** Bobines proposées en tête (rattachement automatique). */
  suggested?: string[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const usable = spools.filter((s) => !s.deletedAt && (s.status !== 'archived' || s.id === value));
  const sugg = suggested.map((sid) => usable.find((s) => s.id === sid)).filter((s): s is Spool => Boolean(s));
  const ams = usable
    .filter((s) => (s.status === 'ams' || s.status === 'external') && !suggested.includes(s.id))
    .sort((a, b) => (a.amsSlot ?? 9) - (b.amsSlot ?? 9));
  const rest = usable
    .filter((s) => s.status !== 'ams' && s.status !== 'external' && !suggested.includes(s.id))
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  const current = usable.find((s) => s.id === value);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ColorSwatch hex={current?.colorHex} name={current?.colorName} finish={current?.finish} decorative />
      <NativeSelect
        id={id}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-invalid={invalid || undefined}
        className="min-w-0"
      >
        <option value="">{placeholder}</option>
        {sugg.length > 0 && (
          <optgroup label="Suggestions">
            {sugg.map((s) => (
              <option key={s.id} value={s.id}>
                {spoolOptionLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        {ams.length > 0 && (
          <optgroup label="Dans l’AMS / support externe">
            {ams.map((s) => (
              <option key={s.id} value={s.id}>
                {spoolOptionLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Autres bobines">
          {rest.map((s) => (
            <option key={s.id} value={s.id}>
              {spoolOptionLabel(s)}
            </option>
          ))}
        </optgroup>
      </NativeSelect>
    </div>
  );
}
