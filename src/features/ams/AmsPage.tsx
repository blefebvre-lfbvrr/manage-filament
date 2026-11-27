import { ArrowDownToLine, LogOut } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { placeSpool, type Placement } from '@/db/repo';
import type { Spool } from '@/lib/schemas';
import { ColorSwatch, LevelBadge, StockBar } from '../inventory/SpoolBits';
import { spoolLevel } from '@/lib/spool';

const SLOTS: Exclude<Placement, null>[] = [1, 2, 3, 4, 'external'];
const slotLabel = (p: Exclude<Placement, null>) => (p === 'external' ? 'Support externe' : `Slot ${p}`);
const MIME = 'application/x-filatrack-spool';

export function AmsPage() {
  const spools = useSpools();
  const settings = useSettings();
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<Placement | 'off'>(null);

  const occupant = (p: Exclude<Placement, null>) =>
    (spools ?? []).find((s) =>
      p === 'external' ? s.status === 'external' : s.status === 'ams' && s.amsSlot === p,
    ) ?? null;
  const available = useMemo(
    () =>
      (spools ?? [])
        .filter((s) => s.status === 'opened' || s.status === 'sealed')
        .sort(
          (a, b) =>
            a.material.localeCompare(b.material) || a.code.localeCompare(b.code, 'fr', { numeric: true }),
        ),
    [spools],
  );

  const place = async (spoolId: string, target: Placement) => {
    const s = spools?.find((x) => x.id === spoolId);
    try {
      await placeSpool(spoolId, target);
      setPicked(null);
      toast.success(target === null ? `${s?.code} retirée de l’AMS.` : `${s?.code} → ${slotLabel(target)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Déplacement impossible.');
    }
  };

  const dropProps = (target: Placement) => ({
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes(MIME)) {
        e.preventDefault();
        setOver(target ?? 'off');
      }
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData(MIME);
      if (id) void place(id, target);
    },
  });

  const dragProps = (s: Spool) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, s.id);
      e.dataTransfer.effectAllowed = 'move';
    },
  });

  if (!spools) return <p className="text-muted-foreground">Chargement…</p>;
  const pickedSpool = spools.find((s) => s.id === picked);

  return (
    <>
      <PageHeader
        title="AMS lite"
        description="Glisse une bobine sur un slot (ou touche-la puis touche le slot). La bobine qui occupait le slot repasse en « Ouverte »."
      />
      {pickedSpool && (
        <p role="status" className="bg-primary/10 mb-3 rounded-md p-2 text-sm">
          <strong>{pickedSpool.code}</strong> sélectionnée : touche un slot pour l’y placer.{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setPicked(null)}>
            Annuler
          </Button>
        </p>
      )}
      <section aria-label="Slots" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {SLOTS.map((slot) => {
          const s = occupant(slot);
          return (
            <Card
              key={slot}
              {...dropProps(slot)}
              className={cn(
                'relative flex min-h-56 flex-col items-center gap-2 p-3 text-center transition-colors',
                over === slot && 'bg-primary/10 ring-primary ring-2',
                slot === 'external' && 'col-span-2 md:col-span-1',
              )}
              aria-label={`${slotLabel(slot)}${s ? ` : ${s.code}` : ' : vide'}`}
              role="group"
            >
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {slotLabel(slot)}
              </p>
              {s ? (
                <>
                  <div
                    {...dragProps(s)}
                    className="cursor-grab active:cursor-grabbing"
                    title="Glisser vers un autre slot"
                  >
                    <ColorSwatch
                      hex={s.colorHex}
                      name={s.colorName}
                      finish={s.finish}
                      size="xl"
                      className="size-20"
                    />
                  </div>
                  <Link to={`/spools/${s.id}`} className="text-primary font-bold hover:underline">
                    {s.code}
                  </Link>
                  <p className="text-sm leading-tight">
                    {s.productLine || s.material}
                    <br />
                    <span className="text-muted-foreground">{s.colorName}</span>
                  </p>
                  <StockBar spool={s} settings={settings} className="w-full" />
                  <LevelBadge level={spoolLevel(s, settings)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-auto"
                    onClick={() => void place(s.id, null)}
                  >
                    <LogOut aria-hidden /> Retirer
                  </Button>
                </>
              ) : (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-sm">
                  <div className="size-20 rounded-full border-2 border-dashed" aria-hidden />
                  Vide
                </div>
              )}
              {pickedSpool && pickedSpool.id !== s?.id && (
                <Button size="sm" className="mt-auto" onClick={() => void place(pickedSpool.id, slot)}>
                  <ArrowDownToLine aria-hidden /> Placer ici
                </Button>
              )}
            </Card>
          );
        })}
      </section>

      <section
        aria-labelledby="available-title"
        className={cn('mt-6 rounded-xl border p-3', over === 'off' && 'bg-muted')}
        {...dropProps(null)}
      >
        <h2 id="available-title" className="mb-2 font-semibold">
          Bobines disponibles ({available.length})
        </h2>
        <p className="text-muted-foreground mb-3 text-sm">Dépose ici une bobine de l’AMS pour la retirer.</p>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {available.map((s) => (
            <li key={s.id}>
              <div
                {...dragProps(s)}
                className={cn(
                  'bg-card flex items-center gap-3 rounded-lg border p-2',
                  picked === s.id && 'ring-primary ring-2',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-pressed={picked === s.id}
                  onClick={() => setPicked(picked === s.id ? null : s.id)}
                >
                  <ColorSwatch hex={s.colorHex} name={s.colorName} finish={s.finish} decorative size="lg" />
                  <span className="min-w-0">
                    <span className="block font-semibold whitespace-nowrap">{s.code}</span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {s.productLine || s.material} {s.colorName}
                    </span>
                  </span>
                </button>
                <StockBar spool={s} settings={settings} className="w-24" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Placer ${s.code}`}>
                      Placer
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {SLOTS.map((slot) => (
                      <DropdownMenuItem key={slot} onSelect={() => void place(s.id, slot)}>
                        {slotLabel(slot)}
                        {occupant(slot) ? ` (remplace ${occupant(slot)!.code})` : ''}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
          {available.length === 0 && (
            <li className="text-muted-foreground text-sm">Aucune bobine ouverte ou neuve.</li>
          )}
        </ul>
      </section>
    </>
  );
}
