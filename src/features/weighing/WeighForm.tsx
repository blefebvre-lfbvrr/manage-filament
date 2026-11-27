import { Scale } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { recordWeighing } from '@/db/repo';
import { formatGrams } from '@/lib/format';
import type { Spool } from '@/lib/schemas';
import { netFromGross } from '@/lib/spool';

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.').replace(/\s/g, '')));

/** Saisie d'une pesée : poids brut sur la balance → restant net (brut − tare). */
export function WeighForm({
  spool,
  defaultTareG,
  onDone,
  autoFocus = true,
}: {
  spool: Spool;
  defaultTareG?: number | null;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const uid = useId();
  const grossRef = useRef<HTMLInputElement>(null);
  const initialTare = spool.tareG ?? defaultTareG ?? null;
  const [gross, setGross] = useState('');
  const [tare, setTare] = useState(initialTare == null ? '' : String(initialTare));
  const [saveTare, setSaveTare] = useState(spool.tareG == null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGross('');
    setTare(initialTare == null ? '' : String(initialTare));
    setSaveTare(spool.tareG == null);
    setNote('');
    if (autoFocus) grossRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spool.id]);

  const g = num(gross);
  const t = num(tare);
  const valid = Number.isFinite(g) && g >= 0 && Number.isFinite(t) && t >= 0;
  const net = valid ? netFromGross(g, t) : null;
  const delta = net === null ? null : Math.round((net - spool.remainingG) * 10) / 10;
  const tareChanged = Number.isFinite(t) && t !== spool.tareG;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      toast.error('Saisis le poids brut et la tare.');
      return;
    }
    setBusy(true);
    try {
      const r = await recordWeighing(spool.id, g, t, {
        note: note.trim() || null,
        updateTare: saveTare && tareChanged,
      });
      toast.success(
        `${spool.code} : ${formatGrams(r.weighing.netG)} restants${r.movement ? ` (${r.movement.deltaG > 0 ? '+' : ''}${formatGrams(r.movement.deltaG)})` : ', inchangé'}.`,
      );
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pesée impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Poids brut sur la balance (g)" htmlFor={`${uid}-gross`}>
          <Input
            ref={grossRef}
            id={`${uid}-gross`}
            inputMode="decimal"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            className="h-12 text-lg"
            placeholder="ex. 532"
          />
        </Field>
        <Field
          label="Tare bobine vide (g)"
          htmlFor={`${uid}-tare`}
          hint={spool.isRefill ? 'Recharge : tare de la bobine réutilisable' : undefined}
        >
          <Input
            id={`${uid}-tare`}
            inputMode="decimal"
            value={tare}
            onChange={(e) => setTare(e.target.value)}
            className="h-12 text-lg"
          />
        </Field>
      </div>
      <div className="bg-muted grid grid-cols-3 gap-2 rounded-lg p-3 text-center" aria-live="polite">
        <div>
          <p className="text-muted-foreground text-xs">Actuel</p>
          <p className="font-semibold tabular-nums">{formatGrams(spool.remainingG)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Mesuré (net)</p>
          <p className="text-lg font-bold tabular-nums">{net === null ? '—' : formatGrams(net)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Écart</p>
          <p
            className={`font-semibold tabular-nums ${delta && delta < 0 ? 'text-danger-foreground' : delta ? 'text-ok-foreground' : ''}`}
          >
            {delta === null ? '—' : `${delta > 0 ? '+' : ''}${formatGrams(delta)}`}
          </p>
        </div>
      </div>
      {tareChanged && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={saveTare} onCheckedChange={(v) => setSaveTare(v === true)} />
          Mémoriser cette tare pour {spool.code}
        </label>
      )}
      <Field label="Note (facultatif)" htmlFor={`${uid}-note`}>
        <Input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy || !valid} size="lg">
        <Scale aria-hidden /> Enregistrer la pesée
      </Button>
    </form>
  );
}
