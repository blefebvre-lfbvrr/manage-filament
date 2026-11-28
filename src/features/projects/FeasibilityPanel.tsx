import { CheckCircle2, ExternalLink, Lock, ShoppingCart, TriangleAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useCatalog, usePrints, useProjects, useSettings, useSpools } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { addShoppingItem, setReservations } from '@/db/repo';
import {
  analyzeFeasibility,
  needLabel,
  summarize,
  timeEstimate,
  type FeasibilityStatus,
  type FilamentFeasibility,
} from '@/lib/feasibility';
import { formatDate, formatGrams, formatMoney } from '@/lib/format';
import { formatDuration } from '@/lib/prints';
import { reservedBySpool, withAvailable, type PlannedFilament } from '@/lib/projects';
import { materialFromProductLine } from '@/lib/spool';
import { ColorSwatch } from '../inventory/SpoolBits';

const STATUS: Record<
  FeasibilityStatus,
  { icon: typeof CheckCircle2; label: string; cls: string; tone: 'ok' | 'warn' | 'danger' }
> = {
  ok: { icon: CheckCircle2, label: 'Suffisant', cls: 'text-ok-foreground', tone: 'ok' },
  tight: { icon: TriangleAlert, label: 'Juste (sous la marge)', cls: 'text-warn-foreground', tone: 'warn' },
  order: { icon: XCircle, label: 'À commander', cls: 'text-danger-foreground', tone: 'danger' },
};

/**
 * Faisabilité filament par filament. `projectId` : les réservations de ce projet ne sont pas
 * déduites du disponible, et le bouton « Réserver » est proposé.
 */
export function FeasibilityPanel({
  needs,
  totalTimeS,
  projectId,
  title = 'Faisabilité',
}: {
  needs: PlannedFilament[];
  totalTimeS: number;
  projectId?: string;
  title?: string;
}) {
  const spools = useSpools() ?? [];
  const prints = usePrints() ?? [];
  const projects = useProjects() ?? [];
  const settings = useSettings();
  const catalog = useCatalog();
  const [accepted, setAccepted] = useState<Record<string, string[]>>({});
  const cur = settings.currency;

  const rows = useMemo(() => {
    const reserved = reservedBySpool(projects, prints, settings, projectId);
    return analyzeFeasibility({
      needs,
      spools: withAvailable(spools, reserved),
      settings,
      catalog,
      accepted,
    });
  }, [needs, spools, prints, projects, settings, projectId, catalog, accepted]);
  const sum = summarize(rows);
  const time = timeEstimate(totalTimeS, settings, new Date());
  const toggle = (key: string, id: string) =>
    setAccepted((a) => ({
      ...a,
      [key]: (a[key] ?? []).includes(id) ? a[key]!.filter((x) => x !== id) : [...(a[key] ?? []), id],
    }));

  const addOrder = async (r: FilamentFeasibility) => {
    if (!r.order) return;
    await addShoppingItem({
      label: r.order.label,
      brand:
        catalog?.brands.find(
          (b) => b.id === catalog.products.find((p) => p.id === r.order!.productId)?.brandId,
        )?.name ?? null,
      productLine: r.need.productHint ?? r.need.type,
      material: materialFromProductLine(r.need.productHint ?? r.need.type),
      colorName: r.order.colorName,
      colorHex: r.order.colorHex,
      catalogProductId: r.order.productId,
      catalogColorId: r.order.colorId,
      isRefill: r.order.isRefill,
      quantity: r.order.quantity,
      unitPrice: r.order.unitPrice,
      productUrl: r.order.productUrl,
      source: projectId ? 'project' : 'manual',
      sourceRef: projectId ?? null,
      note: `${formatGrams(r.missingG)} manquants${projectId ? ' (projet)' : ''}`,
    });
  };

  const reserve = async () => {
    if (!projectId) return;
    // On réserve, bobine par bobine, la part du besoin (sans marge) couverte par les bobines retenues.
    const res = new Map<string, number>();
    for (const r of rows) {
      let left = r.need.grams;
      for (const c of r.chosen) {
        const g = Math.min(left, c.availableG);
        if (g > 0) res.set(c.spool.id, (res.get(c.spool.id) ?? 0) + g);
        left -= g;
      }
    }
    await setReservations(
      projectId,
      [...res].map(([spoolId, grams]) => ({ spoolId, grams: Math.round(grams * 10) / 10 })),
    );
    toast.success(`${res.size} bobine(s) réservée(s) pour ce projet.`);
  };

  const S = STATUS[sum.status];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            {title} <Badge tone={S.tone}>{S.label}</Badge>
          </CardTitle>
          <CardDescription>
            Besoin = plan × quantités + {settings.projects.safetyMarginPct} % de sécurité +{' '}
            {settings.projects.failMarginPct} % pour les ratés. Stock disponible = restant − réservé par les
            autres projets.
          </CardDescription>
          {totalTimeS > 0 && (
            <p className="mt-1 text-sm">
              Durée totale : <strong>{formatDuration(totalTimeS / 60)}</strong> · fin possible le{' '}
              <strong>{formatDate(time.endDate.toISOString(), settings.dateFormat)}</strong> (à{' '}
              {settings.projects.printHoursPerDay} h d’impression par jour)
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {projectId && rows.some((r) => r.chosen.length) && (
            <Button variant="outline" size="sm" onClick={() => void reserve()}>
              <Lock aria-hidden /> Réserver les bobines
            </Button>
          )}
          {rows.some((r) => r.order && r.status === 'order') && (
            <Button
              size="sm"
              onClick={async () => {
                for (const r of rows) if (r.order && r.status === 'order') await addOrder(r);
                toast.success('Commande ajoutée à la liste de courses.');
              }}
            >
              <ShoppingCart aria-hidden /> Tout ajouter aux courses
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Aucun filament à analyser : importe un .3mf découpé.
          </p>
        )}
        {rows.map((r) => {
          const st = STATUS[r.status];
          const Icon = st.icon;
          return (
            <section
              key={r.need.key}
              className="rounded-lg border p-3"
              aria-label={needLabel(r.need, catalog)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={cn('size-5', st.cls)} aria-hidden />
                <ColorSwatch hex={r.need.color} name={r.need.productHint ?? r.need.type} />
                <span className="font-medium">{needLabel(r.need, catalog)}</span>
                <span className="text-muted-foreground text-sm">
                  besoin {formatGrams(r.need.grams)} → {formatGrams(r.neededG)} avec marges · disponible{' '}
                  {formatGrams(r.availableG)}
                </span>
                <Badge tone={st.tone} className="ml-auto">
                  {st.label}
                  {r.missingG > 0 && ` · manque ${formatGrams(r.missingG)}`}
                </Badge>
              </div>
              {r.needsSwap && (
                <p className="text-warn-foreground mt-1 text-sm">
                  Aucune bobine seule ne suffit, mais elles suffisent ensemble : prévois un changement de
                  bobine (ou le relais AMS) en cours d’impression.
                </p>
              )}
              {r.exact.length > 0 && (
                <p className="mt-2 text-sm">
                  Bobines identiques :{' '}
                  {r.exact.map((o) => (
                    <Link
                      key={o.spool.id}
                      to={`/spools/${o.spool.id}`}
                      className="mr-2 inline-flex items-center gap-1 underline"
                    >
                      {o.spool.code} ({formatGrams(o.availableG)})
                    </Link>
                  ))}
                </p>
              )}
              {r.alternatives.length > 0 && r.status !== 'ok' && (
                <div className="mt-2">
                  <p className="text-muted-foreground text-sm">
                    Alternatives (même matériau, couleur la plus proche) :
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {r.alternatives.map((a) => {
                      const on = (accepted[r.need.key] ?? []).includes(a.spool.id);
                      return (
                        <li key={a.spool.id}>
                          <Button
                            variant={on ? 'secondary' : 'outline'}
                            size="sm"
                            aria-pressed={on}
                            onClick={() => toggle(r.need.key, a.spool.id)}
                          >
                            <ColorSwatch
                              decorative
                              hex={a.spool.colorHex}
                              name={a.spool.colorName}
                              size="sm"
                            />
                            {a.spool.code} {a.spool.productLine} {a.spool.colorName} ·{' '}
                            {formatGrams(a.availableG)}
                            {a.colorGap !== null && ` · écart ${a.colorGap}`}
                            {on ? ' ✓' : ''}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {r.order && r.status !== 'ok' && (
                <div className="bg-muted mt-2 flex flex-wrap items-center gap-2 rounded-md p-2 text-sm">
                  <ShoppingCart className="size-4" aria-hidden />
                  <span className="flex-1">
                    Commander{' '}
                    <strong>
                      {r.order.quantity} × {r.order.label}
                    </strong>{' '}
                    ({formatGrams(r.order.netWeightG)})
                    {r.order.unitPrice != null &&
                      ` · ~${formatMoney(r.order.unitPrice * r.order.quantity, cur)}`}
                  </span>
                  {r.order.productUrl && (
                    <a
                      href={r.order.productUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 underline"
                    >
                      Fiche <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await addOrder(r);
                      toast.success('Ajouté à la liste de courses.');
                    }}
                  >
                    Ajouter aux courses
                  </Button>
                </div>
              )}
            </section>
          );
        })}
        {sum.status === 'order' && (
          <p className="text-sm">
            Commande estimée : <strong>{formatMoney(sum.orderTotal, cur)}</strong>
            {sum.unknownPrices > 0 &&
              ` (+ ${sum.unknownPrices} prix inconnu${sum.unknownPrices > 1 ? 's' : ''})`}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
