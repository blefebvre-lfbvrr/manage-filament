import { FileUp, FolderPlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDuration } from '@/lib/prints';
import { platesFromSliced, projectPlan } from '@/lib/projects';
import type { ProjectPart } from '@/lib/schemas';
import { newId } from '@/lib/ids';
import { formatGrams } from '@/lib/format';
import { readSlicedFile } from '../prints/SlicerImportDialog';
import { FeasibilityPanel } from './FeasibilityPanel';
import { ProjectDialog } from './ProjectDialog';

/** Mode rapide : analyse un ou plusieurs .3mf sans créer de projet. */
export function QuickFeasibilityPage() {
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const plan = projectPlan(parts);

  const load = async (files: File[]) => {
    for (const file of files) {
      try {
        const s = await readSlicedFile(file);
        if (!s.sliced || !s.plates.length) {
          toast.error(
            `${file.name} n’est pas découpé : dans Bambu Studio, tranche puis « Exporter le fichier de plateau découpé ».`,
            { duration: 10000 },
          );
          continue;
        }
        setParts((p) => [
          ...p,
          {
            id: newId(),
            name: file.name.replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/i, ''),
            source: '3mf',
            fileName: file.name,
            fileSize: file.size,
            quantity: 1,
            plates: platesFromSliced(s.plates),
            notes: s.warnings.join(' ') || null,
          },
        ]);
      } catch (e) {
        toast.error(`${file.name} : ${e instanceof Error ? e.message : 'illisible'}`);
      }
    }
  };

  return (
    <>
      <PageHeader
        title="Puis-je imprimer ça ?"
        description="Dépose un ou plusieurs .3mf découpés, indique les quantités : FilaTrack vérifie ton stock filament par filament (avec marges), propose des alternatives et la liste de commande."
        actions={
          parts.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <FolderPlus aria-hidden /> Créer un projet avec ces pièces
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <Card
          className={dragOver ? 'ring-primary ring-2' : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void load(Array.from(e.dataTransfer.files));
          }}
        >
          <CardContent className="flex flex-col gap-3 pt-4 sm:pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => inputRef.current?.click()}>
                <FileUp aria-hidden /> Choisir des .3mf
              </Button>
              <span className="text-muted-foreground text-sm">
                ou glisse-les ici. Lus dans ton navigateur, envoyés nulle part.
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".3mf,.gcode"
                className="sr-only"
                aria-label="Fichiers à analyser"
                onChange={(e) => {
                  if (e.target.files) void load(Array.from(e.target.files));
                  e.target.value = '';
                }}
              />
            </div>
            {parts.length > 0 && (
              <ul className="flex flex-col divide-y">
                {parts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {p.plates.length} plateau(x) ·{' '}
                      {formatGrams(
                        p.plates.reduce((a, pl) => a + pl.filaments.reduce((b, f) => b + f.grams, 0), 0),
                      )}{' '}
                      · {formatDuration(p.plates.reduce((a, pl) => a + (pl.predictionS ?? 0), 0) / 60)}
                    </span>
                    <label className="flex items-center gap-1 text-sm">
                      Quantité
                      <Input
                        aria-label={`Quantité de ${p.name}`}
                        type="number"
                        min={1}
                        className="h-8 w-16"
                        value={p.quantity}
                        onChange={(e) =>
                          setParts((all) =>
                            all.map((x) =>
                              x.id === p.id
                                ? { ...x, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Retirer ${p.name}`}
                      onClick={() => setParts((all) => all.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {parts.length > 0 && <FeasibilityPanel needs={plan.filaments} totalTimeS={plan.totalTimeS} />}
      </div>
      <ProjectDialog open={creating} onOpenChange={setCreating} initialParts={parts} />
    </>
  );
}
