import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useCatalog, useCustomFields, useLocations, useSettings, useSpools } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { createSpools, updateSpool, type SpoolInput } from '@/db/repo';
import { usualPrice } from '@/lib/catalog';
import { normalizeHex } from '@/lib/color';
import {
  SPOOL_STATUSES,
  type AmsSlot,
  type CustomFieldDef,
  type Spool,
  type SpoolStatus,
} from '@/lib/schemas';
import { materialFromProductLine, SPOOL_STATUS_LABELS } from '@/lib/spool';
import { ColorSwatch } from './SpoolBits';

interface FormState {
  brandId: string;
  brand: string;
  productId: string;
  productLine: string;
  material: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  finish: string;
  manufacturerRef: string;
  quantity: string;
  isRefill: boolean;
  hasRfid: boolean;
  status: SpoolStatus;
  amsSlot: string;
  location: string;
  initialNetG: string;
  priorConsumedG: string;
  tareG: string;
  diameterMm: string;
  price: string;
  shippingShare: string;
  shop: string;
  purchaseDate: string;
  orderNo: string;
  lot: string;
  openedAt: string;
  lastDriedAt: string;
  humidityNote: string;
  nozzleTempMin: string;
  nozzleTempMax: string;
  bedTemp: string;
  speed: string;
  settingsNotes: string;
  lowThresholdG: string;
  criticalThresholdG: string;
  code: string;
  tags: string;
  notes: string;
  custom: Record<string, unknown>;
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: string): number | null => {
  if (v.trim() === '') return null;
  const x = Number(v.replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const t = (v: string) => (v.trim() === '' ? null : v.trim());

function fromSpool(sp: Spool | undefined, defaultDiameter: number): FormState {
  return {
    brandId: '',
    brand: s(sp?.brand ?? 'Bambu Lab'),
    productId: s(sp?.catalogProductId),
    productLine: s(sp?.productLine),
    material: s(sp?.material),
    colorId: s(sp?.catalogColorId),
    colorName: s(sp?.colorName),
    colorHex: s(sp?.colorHex),
    finish: s(sp?.finish),
    manufacturerRef: s(sp?.manufacturerRef),
    quantity: '1',
    isRefill: sp?.isRefill ?? false,
    hasRfid: sp?.hasRfid ?? true,
    status: sp?.status ?? 'sealed',
    amsSlot: s(sp?.amsSlot),
    location: s(sp?.location),
    initialNetG: s(sp?.initialNetG ?? 1000),
    priorConsumedG: '',
    tareG: s(sp?.tareG),
    diameterMm: s(sp?.diameterMm ?? defaultDiameter),
    price: s(sp?.price),
    shippingShare: s(sp?.shippingShare),
    shop: s(sp?.shop),
    purchaseDate: s(sp?.purchaseDate),
    orderNo: s(sp?.orderNo),
    lot: s(sp?.lot),
    openedAt: s(sp?.openedAt),
    lastDriedAt: s(sp?.lastDriedAt),
    humidityNote: s(sp?.humidityNote),
    nozzleTempMin: s(sp?.settings?.nozzleTempMin),
    nozzleTempMax: s(sp?.settings?.nozzleTempMax),
    bedTemp: s(sp?.settings?.bedTemp),
    speed: s(sp?.settings?.speed),
    settingsNotes: s(sp?.settings?.notes),
    lowThresholdG: s(sp?.lowThresholdG),
    criticalThresholdG: s(sp?.criticalThresholdG),
    code: s(sp?.code),
    tags: (sp?.tags ?? []).join(', '),
    notes: s(sp?.notes),
    custom: { ...(sp?.custom ?? {}) },
  };
}

export function SpoolFormDialog({
  open,
  onOpenChange,
  spool,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  spool?: Spool;
  onSaved?: (ids: string[]) => void;
}) {
  const catalog = useCatalog();
  const settings = useSettings();
  const spools = useSpools(true);
  const locations = useLocations();
  const customDefs = useCustomFields('spool');
  const editing = Boolean(spool);
  const [f, setF] = useState<FormState>(() => fromSpool(spool, settings.defaultDiameterMm));
  const [more, setMore] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  useEffect(() => {
    if (!open) return;
    const next = fromSpool(spool, settings.defaultDiameterMm);
    if (catalog) {
      const b = catalog.brands.find((x) => x.name === next.brand) ?? (!spool ? catalog.brands[0] : undefined);
      next.brandId = b?.id ?? '';
      if (b && !spool) next.brand = b.name;
    }
    setF(next);
    setErrors({});
    setMore(Boolean(spool));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spool?.id, Boolean(catalog)]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const products = useMemo(
    () =>
      (catalog?.products ?? [])
        .filter((p) => !f.brandId || p.brandId === f.brandId)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [catalog, f.brandId],
  );
  const colors = useMemo(
    () => (catalog?.colors ?? []).filter((c) => c.productId === f.productId),
    [catalog, f.productId],
  );

  const applyProduct = (productId: string, isRefill = f.isRefill) => {
    const p = catalog?.products.find((x) => x.id === productId);
    if (!p) {
      setF((prev) => ({ ...prev, productId: '', colorId: '' }));
      return;
    }
    const brand = catalog?.brands.find((b) => b.id === p.brandId);
    const price = usualPrice(p, spools ?? [], isRefill);
    setF((prev) => ({
      ...prev,
      productId: p.id,
      productLine: p.name,
      material: p.material,
      finish: p.finish ?? '',
      initialNetG: String(p.netWeightG),
      diameterMm: String(p.diameterMm),
      tareG: s(p.tareG ?? brand?.defaultTareG),
      price: price === null ? prev.price : String(price),
      nozzleTempMin: s(p.nozzleTempMin),
      nozzleTempMax: s(p.nozzleTempMax),
      bedTemp: s(p.bedTemp),
      colorId: '',
    }));
  };

  const applyColor = (colorId: string) => {
    const c = catalog?.colors.find((x) => x.id === colorId);
    setF((prev) => ({
      ...prev,
      colorId,
      colorName: c?.name ?? prev.colorName,
      colorHex: c?.hex ?? prev.colorHex,
      manufacturerRef: c?.ref ?? prev.manufacturerRef,
    }));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.productLine.trim() && !f.material.trim()) e.productLine = 'Indique une gamme ou un matériau.';
    const net = n(f.initialNetG);
    if (net === null || net <= 0) e.initialNetG = 'Poids net requis (> 0 g).';
    const prior = n(f.priorConsumedG);
    if (f.priorConsumedG && (prior === null || prior < 0)) e.priorConsumedG = 'Valeur invalide.';
    if (net !== null && prior !== null && prior > net) e.priorConsumedG = 'Supérieur au poids net.';
    const qty = Number(f.quantity);
    if (!editing && (!Number.isInteger(qty) || qty < 1 || qty > 100)) e.quantity = 'Entre 1 et 100.';
    if (f.status === 'ams' && !f.amsSlot) e.amsSlot = 'Choisis un slot.';
    if (f.status === 'ams' && !editing && qty > 1)
      e.amsSlot = 'Un seul slot par bobine : mets la quantité à 1.';
    if (f.colorHex && !normalizeHex(f.colorHex)) e.colorHex = 'Format #RRGGBB.';
    for (const k of [
      'price',
      'shippingShare',
      'tareG',
      'diameterMm',
      'nozzleTempMin',
      'nozzleTempMax',
      'bedTemp',
      'lowThresholdG',
      'criticalThresholdG',
    ] as const) {
      if (f[k] && n(f[k]) === null) e[k] = 'Nombre invalide.';
    }
    if (editing && !f.code.trim()) e.code = 'Code requis.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      if (
        Object.keys(e).some(
          (k) => !['productLine', 'initialNetG', 'quantity', 'amsSlot', 'priorConsumedG'].includes(k),
        )
      )
        setMore(true);
      toast.error('Corrige les champs en rouge.');
      return;
    }
    const material = f.material.trim() || materialFromProductLine(f.productLine);
    const data: SpoolInput = {
      legacyId: spool?.legacyId ?? null,
      brand: f.brand.trim(),
      productLine: f.productLine.trim(),
      material,
      catalogProductId: f.productId || null,
      catalogColorId: f.colorId || null,
      colorName: f.colorName.trim(),
      colorHex: normalizeHex(f.colorHex),
      finish: t(f.finish),
      manufacturerRef: t(f.manufacturerRef),
      diameterMm: n(f.diameterMm) ?? 1.75,
      initialNetG: n(f.initialNetG)!,
      tareG: n(f.tareG),
      isRefill: f.isRefill,
      hasRfid: f.hasRfid,
      price: n(f.price),
      shippingShare: n(f.shippingShare),
      shop: t(f.shop),
      purchaseDate: t(f.purchaseDate),
      orderNo: t(f.orderNo),
      lot: t(f.lot),
      purchaseId: spool?.purchaseId ?? null,
      status: f.status,
      amsSlot: f.status === 'ams' && f.amsSlot ? (Number(f.amsSlot) as AmsSlot) : null,
      location: t(f.location),
      openedAt: t(f.openedAt),
      lastDriedAt: t(f.lastDriedAt),
      humidityNote: t(f.humidityNote),
      settings: {
        nozzleTempMin: n(f.nozzleTempMin),
        nozzleTempMax: n(f.nozzleTempMax),
        bedTemp: n(f.bedTemp),
        speed: t(f.speed),
        notes: t(f.settingsNotes),
      },
      lowThresholdG: n(f.lowThresholdG),
      criticalThresholdG: n(f.criticalThresholdG),
      needsWeighing: spool?.needsWeighing ?? false,
      tags: f.tags
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean),
      notes: t(f.notes),
      photoIds: spool?.photoIds ?? [],
      custom: f.custom,
    };
    setSaving(true);
    try {
      if (spool) {
        await updateSpool(spool.id, { ...data, code: f.code.trim() });
        toast.success(`Bobine ${f.code.trim()} enregistrée.`);
        onSaved?.([spool.id]);
      } else {
        const created = await createSpools(
          { ...data, priorConsumedG: n(f.priorConsumedG) ?? 0 },
          Number(f.quantity),
        );
        toast.success(
          created.length > 1
            ? `${created.length} bobines ajoutées (${created[0]!.code} → ${created.at(-1)!.code}).`
            : `Bobine ${created[0]!.code} ajoutée.`,
        );
        onSaved?.(created.map((c) => c.id));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k];
  const inv = (k: string) => (errors[k] ? true : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide aria-describedby={id('desc')}>
        <DialogHeader>
          <DialogTitle>{editing ? `Modifier ${spool!.code}` : 'Ajouter des bobines'}</DialogTitle>
          <DialogDescription id={id('desc')}>
            {editing
              ? 'Le restant se corrige depuis la fiche (journal des mouvements).'
              : 'Choisis une gamme et une couleur du catalogue : tout le reste se préremplit.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Catalogue</legend>
            <Field label="Marque" htmlFor={id('brand')}>
              <NativeSelect
                id={id('brand')}
                value={f.brandId}
                onChange={(e) => {
                  const b = catalog?.brands.find((x) => x.id === e.target.value);
                  setF((prev) => ({
                    ...prev,
                    brandId: e.target.value,
                    brand: b?.name ?? prev.brand,
                    productId: '',
                    colorId: '',
                  }));
                }}
              >
                <option value="">Autre / hors catalogue</option>
                {catalog?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Gamme" htmlFor={id('product')} error={err('productLine')}>
              {products.length ? (
                <NativeSelect
                  id={id('product')}
                  value={f.productId}
                  onChange={(e) => applyProduct(e.target.value)}
                  aria-invalid={inv('productLine')}
                >
                  <option value="">— Choisir —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id={id('product')}
                  value={f.productLine}
                  onChange={(e) => set('productLine', e.target.value)}
                  placeholder="ex. PLA Basic"
                  aria-invalid={inv('productLine')}
                />
              )}
            </Field>
            <Field label="Couleur du catalogue" htmlFor={id('color')}>
              <NativeSelect
                id={id('color')}
                value={f.colorId}
                onChange={(e) => applyColor(e.target.value)}
                disabled={!colors.length}
              >
                <option value="">{colors.length ? '— Choisir —' : 'Choisis d’abord une gamme'}</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.ref ? ` (${c.ref})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {!f.brandId && (
              <Field label="Nom de la marque" htmlFor={id('brandName')}>
                <Input id={id('brandName')} value={f.brand} onChange={(e) => set('brand', e.target.value)} />
              </Field>
            )}
            {!f.productId && products.length > 0 && (
              <Field label="Gamme (texte libre)" htmlFor={id('productLine')}>
                <Input
                  id={id('productLine')}
                  value={f.productLine}
                  onChange={(e) => set('productLine', e.target.value)}
                  placeholder="ex. PLA Basic"
                />
              </Field>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Nom de la couleur" htmlFor={id('colorName')} className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <ColorSwatch hex={f.colorHex} name={f.colorName} finish={f.finish} size="lg" />
                <Input
                  id={id('colorName')}
                  value={f.colorName}
                  onChange={(e) => set('colorName', e.target.value)}
                  placeholder="ex. Noir"
                />
              </div>
            </Field>
            <Field label="Code hex" htmlFor={id('hex')} error={err('colorHex')}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Choisir la couleur"
                  className="border-input bg-background h-10 w-12 shrink-0 cursor-pointer rounded-md border p-1"
                  value={normalizeHex(f.colorHex) ?? '#888888'}
                  onChange={(e) => set('colorHex', e.target.value.toUpperCase())}
                />
                <Input
                  id={id('hex')}
                  value={f.colorHex}
                  onChange={(e) => set('colorHex', e.target.value)}
                  placeholder="#000000"
                  aria-invalid={inv('colorHex')}
                />
              </div>
            </Field>
            <Field label="Matériau" htmlFor={id('material')}>
              <Input
                id={id('material')}
                value={f.material}
                onChange={(e) => set('material', e.target.value)}
                placeholder={materialFromProductLine(f.productLine) || 'PLA'}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {!editing && (
              <Field label="Quantité" htmlFor={id('qty')} error={err('quantity')} hint="Ajout multiple">
                <Input
                  id={id('qty')}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={f.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  aria-invalid={inv('quantity')}
                />
              </Field>
            )}
            <Field label="Statut" htmlFor={id('status')}>
              <NativeSelect
                id={id('status')}
                value={f.status}
                onChange={(e) => set('status', e.target.value as SpoolStatus)}
              >
                {SPOOL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {SPOOL_STATUS_LABELS[st]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {f.status === 'ams' && (
              <Field
                label="Slot AMS"
                htmlFor={id('slot')}
                error={err('amsSlot')}
                hint="L’occupant actuel sera déplacé"
              >
                <NativeSelect
                  id={id('slot')}
                  value={f.amsSlot}
                  onChange={(e) => set('amsSlot', e.target.value)}
                  aria-invalid={inv('amsSlot')}
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4].map((x) => (
                    <option key={x} value={x}>
                      Slot {x}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Emplacement" htmlFor={id('location')}>
              <Input
                id={id('location')}
                list={id('locations')}
                value={f.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="ex. Étagère"
              />
              <datalist id={id('locations')}>
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Poids net initial (g)" htmlFor={id('net')} error={err('initialNetG')}>
              <Input
                id={id('net')}
                inputMode="decimal"
                value={f.initialNetG}
                onChange={(e) => set('initialNetG', e.target.value)}
                aria-invalid={inv('initialNetG')}
              />
            </Field>
            {!editing && (
              <Field
                label="Déjà consommé (g)"
                htmlFor={id('prior')}
                error={err('priorConsumedG')}
                hint="Pour une bobine entamée"
              >
                <Input
                  id={id('prior')}
                  inputMode="decimal"
                  value={f.priorConsumedG}
                  onChange={(e) => set('priorConsumedG', e.target.value)}
                  placeholder="0"
                  aria-invalid={inv('priorConsumedG')}
                />
              </Field>
            )}
            <Field
              label="Prix (€)"
              htmlFor={id('price')}
              error={err('price')}
              hint="Prérempli avec le prix habituel"
            >
              <Input
                id={id('price')}
                inputMode="decimal"
                value={f.price}
                onChange={(e) => set('price', e.target.value)}
                aria-invalid={inv('price')}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={f.isRefill}
                  onCheckedChange={(v) => {
                    set('isRefill', v === true);
                    if (f.productId) applyProduct(f.productId, v === true);
                  }}
                />
                Recharge (refill)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.hasRfid} onCheckedChange={(v) => set('hasRfid', v === true)} />
                Puce RFID Bambu
              </label>
            </div>
          </div>

          <button
            type="button"
            className="text-primary flex items-center gap-2 self-start text-sm font-medium hover:underline"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
          >
            <ChevronDown className={`size-4 transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden />
            {more ? 'Moins de détails' : 'Plus de détails (achat, réglages, séchage, notes…)'}
          </button>

          {more && (
            <div className="flex flex-col gap-5">
              <fieldset className="grid gap-3 sm:grid-cols-4">
                <legend className="mb-2 text-sm font-semibold">Achat</legend>
                <Field label="Frais de port répartis (€)" htmlFor={id('ship')} error={err('shippingShare')}>
                  <Input
                    id={id('ship')}
                    inputMode="decimal"
                    value={f.shippingShare}
                    onChange={(e) => set('shippingShare', e.target.value)}
                  />
                </Field>
                <Field label="Magasin" htmlFor={id('shop')}>
                  <Input id={id('shop')} value={f.shop} onChange={(e) => set('shop', e.target.value)} />
                </Field>
                <Field label="Date d’achat" htmlFor={id('pdate')}>
                  <Input
                    id={id('pdate')}
                    type="date"
                    value={f.purchaseDate}
                    onChange={(e) => set('purchaseDate', e.target.value)}
                  />
                </Field>
                <Field label="N° de commande" htmlFor={id('order')}>
                  <Input
                    id={id('order')}
                    value={f.orderNo}
                    onChange={(e) => set('orderNo', e.target.value)}
                  />
                </Field>
                <Field label="Lot" htmlFor={id('lot')}>
                  <Input id={id('lot')} value={f.lot} onChange={(e) => set('lot', e.target.value)} />
                </Field>
                <Field label="Référence fabricant" htmlFor={id('ref')}>
                  <Input
                    id={id('ref')}
                    value={f.manufacturerRef}
                    onChange={(e) => set('manufacturerRef', e.target.value)}
                  />
                </Field>
                <Field label="Finition" htmlFor={id('finish')}>
                  <Input
                    id={id('finish')}
                    value={f.finish}
                    onChange={(e) => set('finish', e.target.value)}
                    placeholder="Mat, Soyeux…"
                  />
                </Field>
                <Field label="Diamètre (mm)" htmlFor={id('diam')} error={err('diameterMm')}>
                  <Input
                    id={id('diam')}
                    inputMode="decimal"
                    value={f.diameterMm}
                    onChange={(e) => set('diameterMm', e.target.value)}
                  />
                </Field>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-4">
                <legend className="mb-2 text-sm font-semibold">Poids, séchage et seuils</legend>
                <Field
                  label="Tare bobine vide (g)"
                  htmlFor={id('tare')}
                  error={err('tareG')}
                  hint="Pour le mode pesée"
                >
                  <Input
                    id={id('tare')}
                    inputMode="decimal"
                    value={f.tareG}
                    onChange={(e) => set('tareG', e.target.value)}
                  />
                </Field>
                <Field label="Ouverte le" htmlFor={id('opened')}>
                  <Input
                    id={id('opened')}
                    type="date"
                    value={f.openedAt}
                    onChange={(e) => set('openedAt', e.target.value)}
                  />
                </Field>
                <Field label="Dernier séchage" htmlFor={id('dried')}>
                  <Input
                    id={id('dried')}
                    type="date"
                    value={f.lastDriedAt}
                    onChange={(e) => set('lastDriedAt', e.target.value)}
                  />
                </Field>
                <Field label="Humidité notée" htmlFor={id('hum')}>
                  <Input
                    id={id('hum')}
                    value={f.humidityNote}
                    onChange={(e) => set('humidityNote', e.target.value)}
                    placeholder="ex. 35 % HR"
                  />
                </Field>
                <Field
                  label="Seuil « bientôt vide » (g)"
                  htmlFor={id('low')}
                  error={err('lowThresholdG')}
                  hint={`Global : ${settings.lowThresholdG} g`}
                >
                  <Input
                    id={id('low')}
                    inputMode="decimal"
                    value={f.lowThresholdG}
                    onChange={(e) => set('lowThresholdG', e.target.value)}
                  />
                </Field>
                <Field
                  label="Seuil « à changer » (g)"
                  htmlFor={id('crit')}
                  error={err('criticalThresholdG')}
                  hint={`Global : ${settings.criticalThresholdG} g`}
                >
                  <Input
                    id={id('crit')}
                    inputMode="decimal"
                    value={f.criticalThresholdG}
                    onChange={(e) => set('criticalThresholdG', e.target.value)}
                  />
                </Field>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-4">
                <legend className="mb-2 text-sm font-semibold">Réglages recommandés</legend>
                <Field label="Buse min (°C)" htmlFor={id('nmin')} error={err('nozzleTempMin')}>
                  <Input
                    id={id('nmin')}
                    inputMode="numeric"
                    value={f.nozzleTempMin}
                    onChange={(e) => set('nozzleTempMin', e.target.value)}
                  />
                </Field>
                <Field label="Buse max (°C)" htmlFor={id('nmax')} error={err('nozzleTempMax')}>
                  <Input
                    id={id('nmax')}
                    inputMode="numeric"
                    value={f.nozzleTempMax}
                    onChange={(e) => set('nozzleTempMax', e.target.value)}
                  />
                </Field>
                <Field label="Plateau (°C)" htmlFor={id('bed')} error={err('bedTemp')}>
                  <Input
                    id={id('bed')}
                    inputMode="numeric"
                    value={f.bedTemp}
                    onChange={(e) => set('bedTemp', e.target.value)}
                  />
                </Field>
                <Field label="Vitesse" htmlFor={id('speed')}>
                  <Input
                    id={id('speed')}
                    value={f.speed}
                    onChange={(e) => set('speed', e.target.value)}
                    placeholder="ex. ≤ 300 mm/s"
                  />
                </Field>
                <Field label="Notes de réglage" htmlFor={id('snotes')} className="sm:col-span-4">
                  <Input
                    id={id('snotes')}
                    value={f.settingsNotes}
                    onChange={(e) => set('settingsNotes', e.target.value)}
                  />
                </Field>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold">Divers</legend>
                {editing && (
                  <Field
                    label="Code court"
                    htmlFor={id('code')}
                    error={err('code')}
                    hint="Imprimé sur l’étiquette"
                  >
                    <Input
                      id={id('code')}
                      value={f.code}
                      onChange={(e) => set('code', e.target.value)}
                      aria-invalid={inv('code')}
                    />
                  </Field>
                )}
                <Field label="Tags (séparés par des virgules)" htmlFor={id('tags')}>
                  <Input id={id('tags')} value={f.tags} onChange={(e) => set('tags', e.target.value)} />
                </Field>
                <Field label="Notes" htmlFor={id('notes')} className="sm:col-span-2">
                  <Textarea id={id('notes')} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
                {customDefs.map((d) => (
                  <CustomFieldInput
                    key={d.id}
                    def={d}
                    id={id(`cf-${d.key}`)}
                    value={f.custom[d.key]}
                    onChange={(v) => setF((prev) => ({ ...prev, custom: { ...prev.custom, [d.key]: v } }))}
                  />
                ))}
              </fieldset>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {editing
                ? 'Enregistrer'
                : Number(f.quantity) > 1
                  ? `Ajouter ${f.quantity} bobines`
                  : 'Ajouter la bobine'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomFieldInput({
  def,
  id,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 pt-6">
        <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id}>{def.label}</Label>
      </div>
    );
  }
  if (def.type === 'list') {
    return (
      <Field label={def.label} htmlFor={id}>
        <NativeSelect id={id} value={s(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      </Field>
    );
  }
  return (
    <Field label={def.label} htmlFor={id}>
      <Input
        id={id}
        type={def.type === 'date' ? 'date' : 'text'}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={s(value)}
        onChange={(e) =>
          onChange(
            def.type === 'number' ? (n(e.target.value) ?? (e.target.value || null)) : e.target.value || null,
          )
        }
      />
    </Field>
  );
}
