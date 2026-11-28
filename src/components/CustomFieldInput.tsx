import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import type { CustomFieldDef } from '@/lib/schemas';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: string): number | null => {
  if (v.trim() === '') return null;
  const x = Number(v.replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};

/** Saisie d'un champ personnalisé selon son type (texte, nombre, date, liste, case à cocher). */
export function CustomFieldInput({
  def,
  id,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 pt-6">
        <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id}>{def.label}</Label>
      </div>
    );
  }
  if (def.type === 'list') {
    return (
      <Field label={def.label} htmlFor={id}>
        <NativeSelect id={id} value={s(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      </Field>
    );
  }
  return (
    <Field label={def.label} htmlFor={id}>
      <Input
        id={id}
        type={def.type === 'date' ? 'date' : 'text'}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={s(value)}
        onChange={(e) =>
          onChange(
            def.type === 'number' ? (n(e.target.value) ?? (e.target.value || null)) : e.target.value || null,
          )
        }
      />
    </Field>
  );
}
