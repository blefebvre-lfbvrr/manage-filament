import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { locationOf } from '@/lib/filters';
import type { AppSettings, Spool } from '@/lib/schemas';
import { spoolLevel as levelOf } from '@/lib/spool';
import { ColorSwatch, LevelBadge, StatusBadge, StockBar } from './SpoolBits';

export function SpoolCard({
  spool,
  settings,
  selected,
  onSelectedChange,
}: {
  spool: Spool;
  settings: AppSettings;
  selected: boolean;
  onSelectedChange: (v: boolean) => void;
}) {
  const loc = locationOf(spool);
  return (
    <Card
      className={cn(
        'focus-within:ring-ring relative flex h-full flex-col gap-3 overflow-hidden p-4 transition-shadow focus-within:ring-2 hover:shadow-md',
        selected && 'ring-primary ring-2',
        spool.status === 'archived' && 'opacity-60',
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: spool.colorHex ?? 'transparent' }}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <ColorSwatch hex={spool.colorHex} name={spool.colorName} finish={spool.finish} size="xl" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/spools/${spool.id}`}
            className="text-primary font-bold after:absolute after:inset-0 hover:underline"
          >
            {spool.code}
          </Link>
          <p className="truncate text-sm font-medium">{spool.productLine || spool.material}</p>
          <p className="text-muted-foreground truncate text-sm">{spool.colorName || 'Couleur ?'}</p>
        </div>
        <Checkbox
          className="relative z-10"
          aria-label={`Sélectionner ${spool.code}`}
          checked={selected}
          onCheckedChange={(v) => onSelectedChange(v === true)}
        />
      </div>
      <StockBar spool={spool} settings={settings} />
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <StatusBadge spool={spool} />
        <LevelBadge level={levelOf(spool, settings)} />
        {loc && spool.status !== 'ams' && spool.status !== 'external' && (
          <span className="text-muted-foreground truncate text-xs">{loc}</span>
        )}
        {spool.needsWeighing && (
          <span className="text-warn-foreground inline-flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3.5" aria-hidden /> À peser
          </span>
        )}
      </div>
    </Card>
  );
}
