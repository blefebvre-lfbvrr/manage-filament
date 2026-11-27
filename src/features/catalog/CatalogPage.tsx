import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCatalog } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getDb } from '@/db/db';
import { normalizeHex } from '@/lib/color';
import { newId, nowIso } from '@/lib/ids';
import type { CatalogBrand, CatalogColor, CatalogProduct } from '@/lib/schemas';
import { materialFromProductLine } from '@/lib/spool';
import { ColorSwatch } from '../inventory/SpoolBits';

const stamp = () => {
  const now = nowIso();
  return { createdAt: now, updatedAt: now, deletedAt: null };
};
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Champ modifiable en place, enregistré à la sortie du champ. */
function InlineField({
  label,
  value,
  onSave,
  numeric,
  type = 'text',
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  onSave: (v: string) => Promise<unknown>;
  numeric?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`text-muted-foreground flex min-w-0 flex-col gap-1 text-xs ${className ?? ''}`}>
      {label}
      <Input
        type={type}
        inputMode={numeric ? 'decimal' : undefined}
        defaultValue={value ?? ''}
        key={String(value ?? '')}
        className="h-8"
        onBlur={async (e) => {
          if (e.target.value === String(value ?? '')) return;
          if (numeric && e.target.value.trim() && Number.isNaN(num(e.target.value))) {
            toast.error('Nombre invalide.');
            return;
          }
          await onSave(e.target.value);
          toast.success('Catalogue mis à jour.');
        }}
      />
    </label>
  );
}

export function CatalogPage() {
  const catalog = useCatalog();
  const [brandId, setBrandId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [newProduct, setNewProduct] = useState(false);
  const [newBrand, setNewBrand] = useState(false);

  const brand = catalog?.brands.find((b) => b.id === (brandId || catalog.brands[0]?.id));
  const products = useMemo(
    () =>
      (catalog?.products ?? [])
        .filter((p) => p.brandId === brand?.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [catalog, brand],
  );
  const product = products.find((p) => p.id === productId) ?? products[0];
  const colors = (catalog?.colors ?? []).filter((c) => c.productId === product?.id);

  const updBrand = (b: CatalogBrand, patch: Partial<CatalogBrand>) =>
    getDb().brands.update(b.id, { ...patch, updatedAt: nowIso() });
  const updProduct = (p: CatalogProduct, patch: Partial<CatalogProduct>) =>
    getDb().products.update(p.id, { ...patch, updatedAt: nowIso() });
  const updColor = (c: CatalogColor, patch: Partial<CatalogColor>) =>
    getDb().colors.update(c.id, { ...patch, updatedAt: nowIso() });

  if (!catalog) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Référentiel des marques, gammes et couleurs utilisé pour l’ajout rapide. Prérempli avec les gammes Bambu Lab courantes : codes couleur, prix et tares sont indicatifs et modifiables."
        actions={
          <>
            <Button variant="outline" onClick={() => setNewBrand(true)}>
              <Plus aria-hidden /> Marque
            </Button>
            <Button onClick={() => setNewProduct(true)} disabled={!brand}>
              <Plus aria-hidden /> Gamme
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <Field label="Marque" htmlFor="cat-brand">
              <NativeSelect
                id="cat-brand"
                value={brand?.id ?? ''}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setProductId('');
                }}
              >
                {catalog.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {brand && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <InlineField
                  label="Tare par défaut (g)"
                  numeric
                  value={brand.defaultTareG}
                  onSave={(v) => updBrand(brand, { defaultTareG: num(v) })}
                />
                <InlineField
                  label="Site"
                  value={brand.website}
                  onSave={(v) => updBrand(brand, { website: v.trim() || null })}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs font-semibold">Gammes</p>
            <ul className="flex flex-col gap-1" aria-label="Gammes">
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === product?.id}
                    className={`hover:bg-accent w-full rounded-md px-3 py-2 text-left text-sm ${p.id === product?.id ? 'bg-accent font-semibold' : ''}`}
                    onClick={() => setProductId(p.id)}
                  >
                    {p.name} <span className="text-muted-foreground text-xs">· {p.material}</span>
                  </button>
                </li>
              ))}
              {!products.length && <li className="text-muted-foreground text-sm">Aucune gamme.</li>}
            </ul>
          </CardContent>
        </Card>

        {product && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>
                    {product.notes ?? 'Les nouvelles bobines de cette gamme reprennent ces valeurs.'}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  {product.productUrl && (
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={product.productUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Ouvrir la fiche produit"
                      >
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Supprimer la gamme ${product.name}`}
                    onClick={async () => {
                      await updProduct(product, { deletedAt: nowIso() });
                      setProductId('');
                      toast.success(
                        'Gamme supprimée du catalogue (les bobines existantes ne changent pas).',
                        {
                          action: {
                            label: 'Annuler',
                            onClick: () => void updProduct(product, { deletedAt: null }),
                          },
                        },
                      );
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InlineField
                  label="Nom"
                  value={product.name}
                  onSave={(v) => updProduct(product, { name: v.trim() || product.name })}
                />
                <InlineField
                  label="Matériau"
                  value={product.material}
                  onSave={(v) => updProduct(product, { material: v.trim() || product.material })}
                />
                <InlineField
                  label="Finition"
                  value={product.finish}
                  onSave={(v) => updProduct(product, { finish: v.trim() || null })}
                />
                <InlineField
                  label="Poids net (g)"
                  numeric
                  value={product.netWeightG}
                  onSave={(v) => updProduct(product, { netWeightG: num(v) ?? 1000 })}
                />
                <InlineField
                  label="Prix bobine (€)"
                  numeric
                  value={product.defaultPrice}
                  onSave={(v) => updProduct(product, { defaultPrice: num(v) })}
                />
                <InlineField
                  label="Prix recharge (€)"
                  numeric
                  value={product.refillPrice}
                  onSave={(v) => updProduct(product, { refillPrice: num(v) })}
                />
                <InlineField
                  label="Tare (g)"
                  numeric
                  value={product.tareG}
                  onSave={(v) => updProduct(product, { tareG: num(v) })}
                />
                <InlineField
                  label="Diamètre (mm)"
                  numeric
                  value={product.diameterMm}
                  onSave={(v) => updProduct(product, { diameterMm: num(v) ?? 1.75 })}
                />
                <InlineField
                  label="Buse min (°C)"
                  numeric
                  value={product.nozzleTempMin}
                  onSave={(v) => updProduct(product, { nozzleTempMin: num(v) })}
                />
                <InlineField
                  label="Buse max (°C)"
                  numeric
                  value={product.nozzleTempMax}
                  onSave={(v) => updProduct(product, { nozzleTempMax: num(v) })}
                />
                <InlineField
                  label="Plateau (°C)"
                  numeric
                  value={product.bedTemp}
                  onSave={(v) => updProduct(product, { bedTemp: num(v) })}
                />
                <InlineField
                  label="Séchage (°C / h)"
                  value={product.dryTempC ? `${product.dryTempC}/${product.dryHours ?? ''}` : ''}
                  onSave={(v) => {
                    const [tc, h] = v.split('/');
                    return updProduct(product, { dryTempC: num(tc ?? ''), dryHours: num(h ?? '') });
                  }}
                />
                <InlineField
                  className="col-span-2 sm:col-span-4"
                  label="Lien fiche produit (liste de courses)"
                  type="url"
                  value={product.productUrl}
                  onSave={(v) => updProduct(product, { productUrl: v.trim() || null })}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Couleurs ({colors.length})</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await getDb().colors.add({
                        ...stamp(),
                        id: newId(),
                        productId: product.id,
                        name: 'Nouvelle couleur',
                        hex: '#888888',
                        ref: null,
                        productUrl: null,
                      });
                    }}
                  >
                    <Plus aria-hidden /> Couleur
                  </Button>
                </div>
                <ul className="flex flex-col divide-y rounded-md border">
                  {colors.map((c) => (
                    <li
                      key={c.id}
                      className="grid grid-cols-[auto_1fr_auto] items-end gap-2 p-2 sm:grid-cols-[auto_2fr_1fr_1fr_auto]"
                    >
                      <div className="flex items-center gap-2 self-center">
                        <ColorSwatch decorative hex={c.hex} name={c.name} size="lg" />
                        <input
                          type="color"
                          aria-label={`Couleur de ${c.name}`}
                          className="border-input bg-background size-8 cursor-pointer rounded border p-0.5"
                          defaultValue={normalizeHex(c.hex) ?? '#888888'}
                          onBlur={(e) => void updColor(c, { hex: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <InlineField
                        label="Nom"
                        value={c.name}
                        onSave={(v) => updColor(c, { name: v.trim() || c.name })}
                      />
                      <InlineField
                        className="hidden sm:flex"
                        label="Hex"
                        value={c.hex}
                        onSave={async (v) => {
                          const hex = normalizeHex(v);
                          if (!hex) {
                            toast.error('Format #RRGGBB attendu.');
                            return;
                          }
                          await updColor(c, { hex });
                        }}
                      />
                      <InlineField
                        className="hidden sm:flex"
                        label="Réf."
                        value={c.ref}
                        onSave={(v) => updColor(c, { ref: v.trim() || null })}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Supprimer ${c.name}`}
                        onClick={() => void updColor(c, { deletedAt: nowIso() })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <NewProductDialog
        open={newProduct}
        onOpenChange={setNewProduct}
        brandId={brand?.id ?? ''}
        onCreated={setProductId}
      />
      <NewBrandDialog open={newBrand} onOpenChange={setNewBrand} onCreated={(id) => setBrandId(id)} />
    </>
  );
}

function NewProductDialog({
  open,
  onOpenChange,
  brandId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandId: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [material, setMaterial] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle gamme</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = newId();
            await getDb().products.add({
              ...stamp(),
              id,
              brandId,
              name: name.trim(),
              material: material.trim() || materialFromProductLine(name) || 'PLA',
              finish: null,
              diameterMm: 1.75,
              netWeightG: 1000,
              tareG: null,
              defaultPrice: null,
              refillPrice: null,
              nozzleTempMin: null,
              nozzleTempMax: null,
              bedTemp: null,
              dryTempC: null,
              dryHours: null,
              hygroscopic: false,
              productUrl: null,
              notes: null,
            });
            onCreated(id);
            setName('');
            setMaterial('');
            onOpenChange(false);
          }}
        >
          <Field label="Nom de la gamme" htmlFor="np-name">
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. PLA Galaxy"
              autoFocus
            />
          </Field>
          <Field label="Matériau" htmlFor="np-mat">
            <Input
              id="np-mat"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder={materialFromProductLine(name) || 'PLA'}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewBrandDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [tare, setTare] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle marque</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = newId();
            await getDb().brands.add({
              ...stamp(),
              id,
              name: name.trim(),
              defaultTareG: num(tare),
              website: null,
              notes: null,
            });
            onCreated(id);
            setName('');
            setTare('');
            onOpenChange(false);
          }}
        >
          <Field label="Nom" htmlFor="nb-name">
            <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Tare d’une bobine vide (g)" htmlFor="nb-tare">
            <Input id="nb-tare" inputMode="decimal" value={tare} onChange={(e) => setTare(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
