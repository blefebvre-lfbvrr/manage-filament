import { Table2, BarChart3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { normalizeHex } from '@/lib/color';

const AXIS = { fontSize: 12, fill: 'var(--muted-foreground)' };

/** Carte de graphique avec bascule vers une vue tableau (accessibilité). */
export function ChartCard({
  title,
  description,
  children,
  table,
  empty,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  table: { headers: string[]; rows: (string | number)[][] };
  empty?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {!empty && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={asTable}
              aria-label={asTable ? `${title} : afficher le graphique` : `${title} : afficher le tableau`}
              onClick={() => setAsTable((v) => !v)}
            >
              {asTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Pas encore de données sur cette période.
          </p>
        ) : asTable ? (
          <div className="relative max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="text-muted-foreground text-left">
                <tr>
                  {table.headers.map((h, i) => (
                    <th key={h} scope="col" className={`py-1 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td key={j} className={`py-1 pr-3 ${j > 0 ? 'text-right tabular-nums' : ''}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div aria-hidden="true">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-muted-foreground tabular-nums">
          {l}
        </p>
      ))}
    </div>
  );
}

export interface ColumnDatum {
  label: string;
  value: number;
}

/** Colonnes dans le temps (une série). */
export function ColumnChart<T extends ColumnDatum>({
  data,
  format,
  tooltipLines,
  height = 220,
}: {
  data: T[];
  format: (v: number) => string;
  tooltipLines: (d: T) => string[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => format(v)}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as T | undefined;
            return p.active && d ? <TooltipBox title={d.label} lines={tooltipLines(d)} /> : null;
          }}
        />
        <Bar
          dataKey="value"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface RowDatum {
  label: string;
  value: number;
  hex?: string | null;
}

/**
 * Barres horizontales. Avec `realColors`, chaque barre prend la couleur réelle du filament
 * (contour fin pour que le blanc reste visible) ; le nom est toujours écrit sur l'axe.
 */
export function RowChart<T extends RowDatum>({
  data,
  format,
  tooltipLines,
  realColors = false,
  labelWidth = 120,
}: {
  data: T[];
  format: (v: number) => string;
  tooltipLines: (d: T) => string[];
  realColors?: boolean;
  labelWidth?: number;
}) {
  const height = Math.max(120, data.length * 32 + 24);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
        barCategoryGap={4}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => format(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={labelWidth}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as T | undefined;
            return p.active && d ? <TooltipBox title={d.label} lines={tooltipLines(d)} /> : null;
          }}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          isAnimationActive={false}
          fill="var(--chart-1)"
        >
          {realColors &&
            data.map((d) => {
              const hex = normalizeHex(d.hex);
              return (
                <Cell
                  key={d.label}
                  fill={hex ?? 'var(--muted-foreground)'}
                  stroke="var(--foreground)"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              );
            })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
