import { Badge } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { normalizeHex } from '@/lib/color';
import { formatGrams, formatPercent } from '@/lib/format';
import type { AppSettings, Spool } from '@/lib/schemas';
import {
  percentRemaining,
  SPOOL_STATUS_LABELS,
  STOCK_LEVEL_LABELS,
  spoolLevel as levelOf,
  type StockLevel,
} from '@/lib/spool';

export function ColorSwatch({
  hex,
  name,
  finish,
  className,
  size = 'md',
  decorative = false,
}: {
  /** Pastille purement visuelle (le texte voisin donne déjà la couleur). */
  decorative?: boolean;
  hex?: string | null;
  name?: string;
  finish?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const color = normalizeHex(hex);
  const translucent = /transl|transp|clear/i.test(`${finish ?? ''} ${name ?? ''}`);
  const sizes = { sm: 'size-4', md: 'size-6', lg: 'size-10', xl: 'size-16' };
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative ? undefined : name ? `Couleur ${name}${color ? ` (${color})` : ''}` : 'Couleur inconnue'
      }
      title={color ?? 'Couleur inconnue'}
      className={cn(
        'relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/15 dark:ring-white/25',
        sizes[size],
        (!color || translucent) && 'swatch-checker',
        className,
      )}
    >
      {color && (
        <span
          className="absolute inset-0"
          style={{ backgroundColor: color, opacity: translucent ? 0.7 : 1 }}
        />
      )}
    </span>
  );
}

const LEVEL_TONE: Record<StockLevel, 'ok' | 'warn' | 'danger' | 'muted'> = {
  ok: 'ok',
  low: 'warn',
  critical: 'danger',
  empty: 'muted',
};

export function LevelBadge({ level }: { level: StockLevel }) {
  return <Badge tone={LEVEL_TONE[level]}>{STOCK_LEVEL_LABELS[level]}</Badge>;
}

export function StatusBadge({ spool }: { spool: Pick<Spool, 'status' | 'amsSlot'> }) {
  const label =
    spool.status === 'ams' && spool.amsSlot ? `AMS ${spool.amsSlot}` : SPOOL_STATUS_LABELS[spool.status];
  const tone =
    spool.status === 'ams'
      ? 'info'
      : spool.status === 'empty' || spool.status === 'archived'
        ? 'muted'
        : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

const BAR: Record<StockLevel, string> = {
  ok: 'bg-ok',
  low: 'bg-warn',
  critical: 'bg-destructive',
  empty: 'bg-muted-foreground/40',
};

export function StockBar({
  spool,
  settings,
  showLabel = true,
  className,
}: {
  spool: Spool;
  settings: AppSettings;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = percentRemaining(spool.remainingG, spool.initialNetG) ?? 0;
  const level = levelOf(spool, settings);
  const width = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {showLabel && (
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span
            className={cn('font-semibold tabular-nums', spool.remainingG < 0 && 'text-danger-foreground')}
          >
            {formatGrams(spool.remainingG, settings.weightUnit)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">{formatPercent(pct)}</span>
        </div>
      )}
      <div
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
        role="meter"
        aria-label="Restant"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${formatGrams(spool.remainingG)} (${STOCK_LEVEL_LABELS[level]})`}
      >
        <div className={cn('h-full rounded-full', BAR[level])} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
