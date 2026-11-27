/** Recherche dans le catalogue (correspondance gamme / couleur). */
import type { CatalogBrand, CatalogColor, CatalogProduct, Spool } from './schemas';
import { looseKey } from './text';

const PRODUCT_ALIASES: Record<string, string> = {
  'pla silk': 'pla silk+',
  tpu: 'tpu 95a hf',
  'tpu 95a': 'tpu 95a hf',
  support: 'support for pla',
  petg: 'petg hf',
};

export function findProduct(
  name: string,
  products: CatalogProduct[],
  brandId?: string | null,
): CatalogProduct | undefined {
  const key = looseKey(name);
  if (!key) return undefined;
  const candidates = products.filter((p) => !p.deletedAt && (!brandId || p.brandId === brandId));
  const exact = candidates.find((p) => looseKey(p.name) === key);
  if (exact) return exact;
  const alias = PRODUCT_ALIASES[key];
  if (alias) return candidates.find((p) => looseKey(p.name) === looseKey(alias));
  return undefined;
}

export function findBrand(name: string, brands: CatalogBrand[]): CatalogBrand | undefined {
  const key = looseKey(name);
  if (!key) return undefined;
  return brands.find((b) => !b.deletedAt && looseKey(b.name) === key);
}

export function findColor(
  colors: CatalogColor[],
  opts: { productId?: string | null; name?: string | null; ref?: string | null },
): CatalogColor | undefined {
  const pool = colors.filter((c) => !c.deletedAt && (!opts.productId || c.productId === opts.productId));
  if (opts.ref) {
    const byRef = pool.find((c) => c.ref && c.ref === opts.ref);
    if (byRef) return byRef;
  }
  if (opts.name) {
    const key = looseKey(opts.name);
    return pool.find((c) => looseKey(c.name) === key);
  }
  return undefined;
}

/** Extrait une référence fabricant du type « Réf. 10101 » d'un texte libre. */
export function extractManufacturerRef(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /r[ée]f(?:[ée]rence)?\.?\s*[:#]?\s*([A-Z0-9-]{4,})/i.exec(text);
  return m?.[1] ?? null;
}

/** Prix habituel : dernier prix payé pour la même gamme (+ recharge ou non), sinon prix catalogue. */
export function usualPrice(
  product: CatalogProduct | undefined,
  spools: Pick<
    Spool,
    'catalogProductId' | 'productLine' | 'price' | 'isRefill' | 'createdAt' | 'deletedAt'
  >[],
  isRefill: boolean,
): number | null {
  const same = spools
    .filter(
      (s) =>
        !s.deletedAt &&
        s.price != null &&
        s.isRefill === isRefill &&
        product &&
        (s.catalogProductId === product.id || looseKey(s.productLine) === looseKey(product.name)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (same[0]?.price != null) return same[0].price;
  if (!product) return null;
  return (isRefill ? product.refillPrice : product.defaultPrice) ?? product.defaultPrice ?? null;
}
