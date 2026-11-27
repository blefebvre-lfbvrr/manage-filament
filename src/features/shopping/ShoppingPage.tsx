import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCopy, Download, ExternalLink, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { downloadText, todayStamp } from '@/app/download';
import { useCatalog, useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getDb } from '@/db/db';
import {
  addShoppingItem,
  createSpools,
  removeShoppingItem,
  saveSettings,
  updateShoppingItem,
} from '@/db/repo';
import {
  itemToLine,
  shoppingSuggestions,
  shoppingText,
  shoppingTotal,
  type ShoppingLine,
} from '@/lib/alerts';
import { usualPrice } from '@/lib/catalog';
import { toCsv } from '@/lib/export';
import { formatMoney } from '@/lib/format';
import type { ShoppingItem } from '@/lib/schemas';
import { materialFromProductLine } from '@/lib/spool';
import { ColorSwatch } from '../inventory/SpoolBits';

const lineToInput = (l: ShoppingLine) => ({
  label: l.label,
  brand: l.brand,
  productLine: l.productLine,
  material: l.productLine ? materialFromProductLine(l.productLine) : null,
  colorName: l.colorName,
  colorHex: l.colorHex,
  catalogProductId: l.catalogProductId,
  catalogColorId: l.catalogColorId,
  isRefill: l.isRefill,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  productUrl: l.productUrl,
  source: l.source === 'alert' ? ('alert' as const) : l.source,
  sourceRef: l.key,
  note: l.reason,
});

export function ShoppingPage() {
  const spools = useSpools() ?? [];
  const catalog = useCatalog();
  const settings = useSettings();
  const rules = useLiveQuery(
    async () => (await getDb().alertRules.toArray()).filter((r) => !r.deletedAt),
    [],
    [],
  );
  const items = useLiveQuery(
    async () => (await getDb().shoppingItems.toArray()).filter((i) => !i.deletedAt),
    [],
    [],
  );
  const [addOpen, setAddOpen] = useState(false);
  const cur = settings.currency;

  const pending = items.filter((i) => !i.boughtAt);
  const bought = items
    .filter((i) => i.boughtAt)
    .sort((a, b) => (b.boughtAt ?? '').localeCompare(a.boughtAt ?? ''));
  const suggestions = useMemo(() => {
    if (!catalog) return [];
    const inList = new Set(pending.map((i) => i.sourceRef));
    return shoppingSuggestions(spools, rules, catalog, settings).filter((l) => !inList.has(l.key));
  }, [spools, rules, catalog, settings, pending]);
  const listLines = pending.map(itemToLine);
  const { total, unknown } = shoppingTotal(listLines);

  const buy = async (item: ShoppingItem) => {
    const product = catalog?.products.find((p) => p.id === item.catalogProductId);
    const brand = catalog?.brands.find((b) => b.id === product?.brandId);
    const created = await createSpools(
      {
        brand: item.brand ?? brand?.name ?? '',
        productLine: item.productLine ?? product?.name ?? item.label,
        material: product?.material ?? materialFromProductLine(item.productLine ?? item.label),
        catalogProductId: item.catalogProductId ?? null,
        catalogColorId: item.catalogColorId ?? null,
        colorName: item.colorName ?? '',
        colorHex: item.colorHex ?? null,
        finish: product?.finish ?? null,
        diameterMm: product?.diameterMm ?? settings.defaultDiameterMm,
        initialNetG: product?.netWeightG ?? 1000,
        tareG: product?.tareG ?? brand?.defaultTareG ?? null,
        isRefill: item.isRefill,
        hasRfid: brand?.name === 'Bambu Lab',
        price: item.unitPrice ?? null,
        purchaseDate: todayStamp(),
        status: 'sealed',
        settings: product
          ? {
              nozzleTempMin: product.nozzleTempMin,
              nozzleTempMax: product.nozzleTempMax,
              bedTemp: product.bedTemp,
              speed: null,
              notes: null,
            }
          : null,
        tags: [],
        photoIds: [],
        custom: {},
      },
      item.quantity,
    );
    await updateShoppingItem(item.id, { boughtAt: new Date().toISOString() });
    toast.success(
      `${created.length} bobine(s) ajoutée(s) au stock (${created.map((c) => c.code).join(', ')}).`,
    );
  };

  const exportCsv = () => {
    const rows = listLines.map((l) => ({
      Quantité: l.quantity,
      Article: l.label,
      'Prix unitaire estimé': l.unitPrice,
      Lien: l.productUrl,
      Motif: l.reason,
    }));
    downloadText(toCsv(rows), `filatrack-courses-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
  };

  return (
    <>
      <PageHeader
        title="Liste de courses"
        description="Générée à partir des bobines vides ou à changer et des stocks minimum. Les prix viennent de ton historique d’achat (sinon du catalogue)."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus aria-hidden /> Ajouter un article
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Suggestions ({suggestions.length})</CardTitle>
              <CardDescription>
                <label className="mt-1 inline-flex items-center gap-2">
                  <Checkbox
                    checked={settings.shoppingIncludeLow}
                    onCheckedChange={(v) => void saveSettings({ shoppingIncludeLow: v === true })}
                  />
                  Inclure les bobines « bientôt vides »
                </label>
              </CardDescription>
            </div>
            {suggestions.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  for (const l of suggestions) await addShoppingItem(lineToInput(l));
                  toast.success('Suggestions ajoutées à la liste.');
                }}
              >
                Tout ajouter
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {suggestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Rien à racheter pour l’instant. Ajoute des{' '}
                <Link to="/alerts" className="underline">
                  règles de stock minimum
                </Link>{' '}
                pour être prévenu plus tôt.
              </p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {suggestions.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 py-2">
                    <ColorSwatch decorative hex={l.colorHex} name={l.colorName ?? ''} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {l.quantity} × {l.label}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {l.reason}
                        {l.unitPrice != null && ` · ~${formatMoney(l.unitPrice, cur)} l’unité`}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void addShoppingItem(lineToInput(l))}
                      aria-label={`Ajouter ${l.label} à la liste`}
                    >
                      <Plus aria-hidden /> Liste
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Ma liste ({pending.length})</CardTitle>
              <CardDescription>
                Total estimé : <strong>{formatMoney(total, cur)}</strong>
                {unknown > 0 && ` (+ ${unknown} prix inconnu${unknown > 1 ? 's' : ''})`}
              </CardDescription>
            </div>
            {pending.length > 0 && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copier la liste"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shoppingText(listLines, cur));
                      toast.success('Liste copiée.');
                    } catch {
                      toast.error('Copie impossible dans ce navigateur.');
                    }
                  }}
                >
                  <ClipboardCopy aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Exporter la liste en CSV"
                  onClick={exportCsv}
                >
                  <Download aria-hidden />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-muted-foreground text-sm">Liste vide.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                    <ColorSwatch decorative hex={i.colorHex} name={i.colorName ?? ''} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{i.label}</span>
                      <span className="text-muted-foreground block text-xs">
                        {i.note}
                        {i.unitPrice != null && ` · ~${formatMoney(i.unitPrice, cur)} l’unité`}
                      </span>
                    </span>
                    <Input
                      aria-label={`Quantité de ${i.label}`}
                      type="number"
                      min={1}
                      className="h-8 w-16"
                      defaultValue={i.quantity}
                      key={`q${i.quantity}`}
                      onBlur={(e) => {
                        const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        if (q !== i.quantity) void updateShoppingItem(i.id, { quantity: q });
                      }}
                    />
                    {i.productUrl && (
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a
                          href={i.productUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Fiche produit de ${i.label}`}
                        >
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => void buy(i)}
                      aria-label={`Acheté : ajouter ${i.quantity} × ${i.label} au stock`}
                    >
                      <PackagePlus aria-hidden /> Acheté
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Retirer ${i.label}`}
                      onClick={() => void removeShoppingItem(i.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {bought.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Achetés récemment</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2 text-sm">
                {bought.slice(0, 12).map((i) => (
                  <li key={i.id}>
                    <Badge tone="muted">
                      {i.quantity} × {i.label}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function AddItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const catalog = useCatalog();
  const spools = useSpools(true) ?? [];
  const [productId, setProductId] = useState('');
  const [colorId, setColorId] = useState('');
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('1');
  const [refill, setRefill] = useState(false);
  const product = catalog?.products.find((p) => p.id === productId);
  const brand = catalog?.brands.find((b) => b.id === product?.brandId);
  const colors = (catalog?.colors ?? []).filter((c) => c.productId === productId);
  const color = colors.find((c) => c.id === colorId);
  const autoLabel = product
    ? [brand?.name, product.name, color?.name].filter(Boolean).join(' ') + (refill ? ' (recharge)' : '')
    : '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter à la liste de courses</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const finalLabel = label.trim() || autoLabel;
            if (!finalLabel) return toast.error('Choisis une gamme ou saisis un libellé.');
            await addShoppingItem({
              label: finalLabel,
              brand: brand?.name ?? null,
              productLine: product?.name ?? null,
              material: product?.material ?? null,
              colorName: color?.name ?? null,
              colorHex: color?.hex ?? null,
              catalogProductId: product?.id ?? null,
              catalogColorId: color?.id ?? null,
              isRefill: refill,
              quantity: Math.max(1, Math.floor(Number(qty) || 1)),
              unitPrice: usualPrice(product, spools, refill),
              productUrl: color?.productUrl ?? product?.productUrl ?? null,
              source: 'manual',
              sourceRef: null,
              note: null,
            });
            toast.success('Article ajouté.');
            setLabel('');
            onOpenChange(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gamme" htmlFor="sh-product">
              <NativeSelect
                id="sh-product"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setColorId('');
                }}
              >
                <option value="">— Hors catalogue —</option>
                {catalog?.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Couleur" htmlFor="sh-color">
              <NativeSelect
                id="sh-color"
                value={colorId}
                onChange={(e) => setColorId(e.target.value)}
                disabled={!colors.length}
              >
                <option value="">—</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantité" htmlFor="sh-qty">
              <Input id="sh-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={refill} onCheckedChange={(v) => setRefill(v === true)} /> Recharge
            </label>
          </div>
          <Field
            label="Libellé"
            htmlFor="sh-label"
            hint={autoLabel ? `Par défaut : ${autoLabel}` : 'Obligatoire hors catalogue'}
          >
            <Input
              id="sh-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={autoLabel}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Ajouter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
