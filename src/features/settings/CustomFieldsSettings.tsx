import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { useCustomFields } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { moveCustomFieldDef, removeCustomFieldDef, saveCustomFieldDef } from '@/db/repo';
import { CUSTOM_FIELD_TYPES, type CustomFieldDef } from '@/lib/schemas';

const TYPE_LABELS: Record<CustomFieldDef['type'], string> = {
  text: 'Texte',
  number: 'Nombre',
  date: 'Date',
  list: 'Liste de choix',
  checkbox: 'Case à cocher',
};
const ENTITY_LABELS = { spool: 'Bobines', print: 'Impressions' } as const;

/** Gestion des champs personnalisés des bobines et des impressions. */
export function CustomFieldsSettings() {
  return (
    <Card className="lg:col-span-2" id="custom-fields">
      <CardHeader>
        <CardTitle>Champs personnalisés</CardTitle>
        <CardDescription>
          Ajoute tes propres informations (numéro de lot, fournisseur, buse conseillée…). Elles apparaissent
          dans les formulaires, les fiches, les colonnes du tableau et les exports. Supprimer un champ le
          masque sans effacer les valeurs déjà saisies.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <EntityFields entity="spool" />
        <EntityFields entity="print" />
      </CardContent>
    </Card>
  );
}

function EntityFields({ entity }: { entity: 'spool' | 'print' }) {
  const defs = useCustomFields(entity);
  const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null);
  return (
    <section aria-label={`Champs des ${ENTITY_LABELS[entity].toLowerCase()}`} className="flex flex-col gap-2">
      <h3 className="font-semibold">{ENTITY_LABELS[entity]}</h3>
      <ul className="flex flex-col gap-1">
        {defs.map((d, i) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-sm">
            <span className="font-medium">{d.label}</span>
            <Badge tone="muted">{TYPE_LABELS[d.type]}</Badge>
            {d.type === 'list' && (
              <span className="text-muted-foreground truncate text-xs">{d.options.join(', ')}</span>
            )}
            <span className="ml-auto flex">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Monter ${d.label}`}
                disabled={i === 0}
                onClick={() => void moveCustomFieldDef(d.id, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Descendre ${d.label}`}
                disabled={i === defs.length - 1}
                onClick={() => void moveCustomFieldDef(d.id, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Modifier ${d.label}`}
                onClick={() => setEditing(d)}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Supprimer ${d.label}`}
                onClick={async () => {
                  await removeCustomFieldDef(d.id);
                  toast.success(`Champ « ${d.label} » masqué.`);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        ))}
        {defs.length === 0 && <li className="text-muted-foreground text-sm">Aucun champ.</li>}
      </ul>
      {editing ? (
        <FieldForm
          entity={entity}
          def={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Ajouter un champ
        </Button>
      )}
    </section>
  );
}

function FieldForm({
  entity,
  def,
  onDone,
}: {
  entity: 'spool' | 'print';
  def?: CustomFieldDef;
  onDone: () => void;
}) {
  const uid = useId();
  const [label, setLabel] = useState(def?.label ?? '');
  const [type, setType] = useState<CustomFieldDef['type']>(def?.type ?? 'text');
  const [options, setOptions] = useState((def?.options ?? []).join(', '));
  return (
    <form
      className="bg-muted/50 flex flex-col gap-3 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await saveCustomFieldDef({ id: def?.id, entity, label, type, options: options.split(/[,;\n]/) });
          toast.success('Champ enregistré.');
          onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Enregistrement impossible.');
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Libellé" htmlFor={`${uid}-label`}>
          <Input id={`${uid}-label`} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>
        <Field label="Type" htmlFor={`${uid}-type`}>
          <NativeSelect
            id={`${uid}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
          >
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === 'list' && (
          <Field
            label="Valeurs (séparées par des virgules)"
            htmlFor={`${uid}-opts`}
            className="sm:col-span-2"
          >
            <Input id={`${uid}-opts`} value={options} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
      </div>
      {def && def.type !== type && (
        <p className="text-warn-foreground text-xs">
          Changer le type ne convertit pas les valeurs déjà saisies.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {def ? 'Enregistrer' : 'Ajouter'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
