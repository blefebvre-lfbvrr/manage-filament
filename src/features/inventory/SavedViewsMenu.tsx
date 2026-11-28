import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getDb } from '@/db/db';
import { removeView, saveView } from '@/db/repo';
import type { SavedView } from '@/lib/schemas';

export function useSavedViews(entity: SavedView['entity']) {
  return useLiveQuery(
    async () =>
      (await getDb().savedViews.toArray())
        .filter((v) => v.entity === entity && !v.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [entity],
    [] as SavedView[],
  );
}

/** Vues enregistrées : filtres, tri, colonnes et affichage, rappelés en un clic. */
export function SavedViewsMenu({
  entity,
  current,
  onApply,
}: {
  entity: SavedView['entity'];
  current: Record<string, unknown>;
  onApply: (state: Record<string, unknown>) => void;
}) {
  const views = useSavedViews(entity);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark aria-hidden /> Vues
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Vues enregistrées</DropdownMenuLabel>
          {views.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={() => {
                onApply(v.state);
                toast.success(`Vue « ${v.name} » appliquée.`);
              }}
            >
              <span className="flex-1">{v.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive rounded p-0.5"
                aria-label={`Supprimer la vue ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  void removeView(v.id).then(() => toast.success(`Vue « ${v.name} » supprimée.`));
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuItem>
          ))}
          {views.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">Aucune vue pour l’instant.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setName('');
              setNaming(true);
            }}
          >
            Enregistrer la vue actuelle…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer la vue</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveView({ name, entity, state: current });
                toast.success(`Vue « ${name.trim()} » enregistrée.`);
                setNaming(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Enregistrement impossible.');
              }
            }}
          >
            <Field
              label="Nom de la vue"
              htmlFor="view-name"
              hint="Filtres, tri, colonnes et affichage actuels. Un nom existant est remplacé."
            >
              <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNaming(false)}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
