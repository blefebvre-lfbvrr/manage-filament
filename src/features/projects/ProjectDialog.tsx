import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSettings } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getDb } from '@/db/db';
import { saveContact, saveProject } from '@/db/repo';
import { makeProject } from '@/lib/project-factory';
import type { Project } from '@/lib/schemas';

const NEW = '__new__';

export function useContacts() {
  return useLiveQuery(
    async () =>
      (await getDb().contacts.toArray())
        .filter((c) => !c.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [],
    [],
  );
}

/** Création / modification des informations d'un projet. */
export function ProjectDialog({
  project,
  open,
  onOpenChange,
  initialParts,
}: {
  project?: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialParts?: Project['parts'];
}) {
  const settings = useSettings();
  const contacts = useContacts();
  const navigate = useNavigate();
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [f, setF] = useState(() => init(project));
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setF(init(project));
  }
  const set = <K extends keyof ReturnType<typeof init>>(k: K, v: ReturnType<typeof init>[K]) =>
    setF((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{project ? `Modifier « ${project.name} »` : 'Nouveau projet'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!f.name.trim()) return toast.error('Donne un nom au projet.');
            const budget = f.budget.trim() ? Number(f.budget.replace(',', '.')) : null;
            if (budget !== null && !(budget >= 0)) return toast.error('Budget invalide.');
            let contactId: string | null = f.forSelf ? null : f.contactId || null;
            if (!f.forSelf && f.contactId === NEW) {
              if (!f.newContact.trim()) return toast.error('Nom du contact requis.');
              contactId = (
                await saveContact({
                  name: f.newContact.trim(),
                  contact: f.newContactInfo.trim() || null,
                  notes: null,
                })
              ).id;
            }
            const base = project ?? makeProject(f.name, { parts: initialParts ?? [] });
            const saved = await saveProject({
              ...base,
              name: f.name.trim(),
              code: f.code.trim().toUpperCase() || null,
              description: f.description.trim() || null,
              tags: f.tags
                .split(/[,;]/)
                .map((t) => t.trim())
                .filter(Boolean),
              forSelf: f.forSelf,
              contactId,
              status: f.status,
              dueDate: f.dueDate || null,
              deliveredAt: f.deliveredAt || null,
              budget,
            });
            toast.success('Projet enregistré.');
            onOpenChange(false);
            if (!project) navigate(`/projects/${saved.id}`);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom" htmlFor={id('name')} className="sm:col-span-2">
              <Input id={id('name')} value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </Field>
            <Field
              label="Code (préfixe de fichier)"
              htmlFor={id('code')}
              hint="Ex. DUPONT : « [DUPONT] support.3mf » sera rattaché à ce projet"
            >
              <Input id={id('code')} value={f.code} onChange={(e) => set('code', e.target.value)} />
            </Field>
            <Field label="Description" htmlFor={id('desc')} className="sm:col-span-3">
              <Textarea
                id={id('desc')}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
                className="min-h-16"
              />
            </Field>
            <Field label="Statut" htmlFor={id('status')}>
              <NativeSelect
                id={id('status')}
                value={f.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {settings.projectStatuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Échéance" htmlFor={id('due')}>
              <Input
                id={id('due')}
                type="date"
                value={f.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </Field>
            <Field label="Livré le" htmlFor={id('delivered')}>
              <Input
                id={id('delivered')}
                type="date"
                value={f.deliveredAt}
                onChange={(e) => set('deliveredAt', e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <Checkbox checked={!f.forSelf} onCheckedChange={(v) => set('forSelf', v !== true)} /> Pour
              quelqu’un d’autre (ami, client, association)
            </label>
            {!f.forSelf && (
              <>
                <Field label="Pour qui" htmlFor={id('contact')}>
                  <NativeSelect
                    id={id('contact')}
                    value={f.contactId}
                    onChange={(e) => set('contactId', e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value={NEW}>+ Nouveau contact…</option>
                  </NativeSelect>
                </Field>
                {f.contactId === NEW && (
                  <>
                    <Field label="Nom du contact" htmlFor={id('cname')}>
                      <Input
                        id={id('cname')}
                        value={f.newContact}
                        onChange={(e) => set('newContact', e.target.value)}
                      />
                    </Field>
                    <Field label="Email / téléphone" htmlFor={id('cinfo')}>
                      <Input
                        id={id('cinfo')}
                        value={f.newContactInfo}
                        onChange={(e) => set('newContactInfo', e.target.value)}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            <Field label="Budget (€, facultatif)" htmlFor={id('budget')}>
              <Input
                id={id('budget')}
                inputMode="decimal"
                value={f.budget}
                onChange={(e) => set('budget', e.target.value)}
              />
            </Field>
            <Field label="Tags (virgules)" htmlFor={id('tags')} className="sm:col-span-2">
              <Input id={id('tags')} value={f.tags} onChange={(e) => set('tags', e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">{project ? 'Enregistrer' : 'Créer le projet'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function init(p?: Project) {
  return {
    name: p?.name ?? '',
    code: p?.code ?? '',
    description: p?.description ?? '',
    tags: (p?.tags ?? []).join(', '),
    forSelf: p?.forSelf ?? true,
    contactId: p?.contactId ?? '',
    newContact: '',
    newContactInfo: '',
    status: p?.status ?? 'idea',
    dueDate: p?.dueDate ?? '',
    deliveredAt: p?.deliveredAt ?? '',
    budget: p?.budget == null ? '' : String(p.budget),
  };
}
