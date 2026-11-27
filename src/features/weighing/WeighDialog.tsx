import { useCatalog } from '@/app/hooks';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Spool } from '@/lib/schemas';
import { WeighForm } from './WeighForm';

export function defaultTareFor(spool: Spool, catalog: ReturnType<typeof useCatalog>): number | null {
  const product = catalog?.products.find((p) => p.id === spool.catalogProductId);
  const brand = catalog?.brands.find((b) => b.name === spool.brand);
  return product?.tareG ?? brand?.defaultTareG ?? null;
}

export function WeighDialog({
  spool,
  open,
  onOpenChange,
}: {
  spool: Spool;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const catalog = useCatalog();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Peser {spool.code}</DialogTitle>
          <DialogDescription>
            Pose la bobine sur la balance : le restant devient poids brut − tare. L’écart est enregistré dans
            le journal (annulable).
          </DialogDescription>
        </DialogHeader>
        <WeighForm
          spool={spool}
          defaultTareG={defaultTareFor(spool, catalog)}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
