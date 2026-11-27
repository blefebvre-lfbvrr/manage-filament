/**
 * Catalogue de départ : gammes Bambu Lab courantes et leurs couleurs.
 *
 * ⚠️ Valeurs indicatives (codes hex approchés, prix et tares à vérifier) :
 * tout est modifiable dans l'écran Catalogue. Les références fabricant ne sont
 * renseignées que lorsqu'elles sont connues avec certitude.
 */
import type { CatalogBrand, CatalogColor, CatalogProduct } from './schemas';
import { looseKey } from './text';

const SEED_DATE = '2026-01-01T00:00:00.000Z';
const base = { createdAt: SEED_DATE, updatedAt: SEED_DATE, deletedAt: null };

interface ProductSeed {
  slug: string;
  name: string;
  material: string;
  finish?: string;
  price?: number;
  refillPrice?: number;
  nozzle: [number, number];
  bed: number;
  dry?: [number, number];
  hygroscopic?: boolean;
  url?: string;
  colors: [name: string, hex: string, ref?: string][];
}

const STORE = 'https://eu.store.bambulab.com/fr/collections/bambu-lab-3d-printer-filament';

const BAMBU_PRODUCTS: ProductSeed[] = [
  {
    slug: 'pla-basic',
    name: 'PLA Basic',
    material: 'PLA',
    price: 25.99,
    refillPrice: 22.99,
    nozzle: [190, 230],
    bed: 55,
    dry: [55, 8],
    url: STORE,
    colors: [
      ['Blanc de jade', '#FFFFFF', '10100'],
      ['Noir', '#000000', '10101'],
      ['Argent', '#A6A9AA'],
      ['Gris', '#8E9089', '10103'],
      ['Gris clair', '#D1D3D5'],
      ['Gris foncé', '#545454'],
      ['Rouge', '#C12E1F', '10200'],
      ['Bordeaux', '#9D2235'],
      ['Rose', '#F55A74'],
      ['Magenta', '#EC008C'],
      ['Beige', '#F7E6DE'],
      ['Orange', '#FF6A13'],
      ['Orange citrouille', '#FF9016', '10301'],
      ['Jaune', '#F4EE2A'],
      ['Jaune tournesol', '#FEC600'],
      ['Or', '#E4BD68'],
      ['Vert Bambu', '#00AE42'],
      ['Vert gui', '#3F8E43', '10502'],
      ['Vert vif', '#BECF00'],
      ['Turquoise', '#00B1B7'],
      ['Cyan', '#0086D6'],
      ['Bleu', '#0A2989'],
      ['Bleu cobalt', '#0056B8'],
      ['Bleu gris', '#5B6579'],
      ['Violet', '#5E43B7'],
      ['Violet indigo', '#482960'],
      ['Marron', '#9D432C'],
      ['Brun cacao', '#6F5034'],
    ],
  },
  {
    slug: 'pla-matte',
    name: 'PLA Matte',
    material: 'PLA',
    finish: 'Mat',
    price: 25.99,
    refillPrice: 22.99,
    nozzle: [190, 230],
    bed: 55,
    dry: [55, 8],
    url: STORE,
    colors: [
      ['Blanc ivoire', '#FFFFFF'],
      ['Charbon', '#000000'],
      ['Gris cendre', '#9B9EA0'],
      ['Gris Nardo', '#757575'],
      ['Rouge écarlate', '#DE4343'],
      ['Rose sakura', '#E8AFCF'],
      ['Orange mandarine', '#F99963'],
      ['Jaune citron', '#F7D959'],
      ['Beige désert', '#E8DBB7'],
      ['Brun latte', '#D3B7A7'],
      ['Vert herbe', '#61C680'],
      ['Vert foncé', '#68724D'],
      ['Bleu glacier', '#A3D8E1'],
      ['Bleu marine', '#0078BF'],
      ['Bleu foncé', '#042F56'],
      ['Violet lilas', '#AE96D4'],
    ],
  },
  {
    slug: 'pla-silk',
    name: 'PLA Silk+',
    material: 'PLA',
    finish: 'Soyeux',
    price: 29.99,
    nozzle: [210, 230],
    bed: 55,
    dry: [55, 8],
    url: STORE,
    colors: [
      ['Or', '#F4A925'],
      ['Argent', '#C8C8C8'],
      ['Cuivre', '#B87333'],
      ['Blanc', '#F5F5F5'],
      ['Rose', '#F7ADA6'],
      ['Bleu', '#008BDA'],
      ['Violet', '#8671CB'],
    ],
  },
  {
    slug: 'petg-hf',
    name: 'PETG HF',
    material: 'PETG',
    price: 25.99,
    refillPrice: 22.99,
    nozzle: [230, 260],
    bed: 70,
    dry: [65, 8],
    hygroscopic: true,
    url: STORE,
    colors: [
      ['Noir', '#000000'],
      ['Blanc', '#FFFFFF'],
      ['Gris', '#ADB1B2'],
      ['Gris foncé', '#515151'],
      ['Rouge', '#EB3A3A'],
      ['Orange', '#F48438'],
      ['Jaune', '#FFD00B'],
      ['Crème', '#F9DFB9'],
      ['Vert', '#00AE42'],
      ['Bleu', '#002E96'],
    ],
  },
  {
    slug: 'petg-translucent',
    name: 'PETG Translucent',
    material: 'PETG',
    finish: 'Translucide',
    price: 25.99,
    nozzle: [230, 260],
    bed: 70,
    dry: [65, 8],
    hygroscopic: true,
    url: STORE,
    colors: [
      ['Transparent', '#FFFFFF'],
      ['Gris translucide', '#8E8E8E'],
      ['Sarcelle', '#2E9C94', '32501'],
      ['Bleu clair translucide', '#61B0FF'],
      ['Violet translucide', '#D6ABFF'],
      ['Rose translucide', '#F9C1BD'],
      ['Orange translucide', '#FF911A'],
      ['Brun translucide', '#C9A381'],
    ],
  },
  {
    slug: 'abs',
    name: 'ABS',
    material: 'ABS',
    price: 22.99,
    nozzle: [240, 270],
    bed: 90,
    dry: [80, 8],
    hygroscopic: true,
    url: STORE,
    colors: [
      ['Noir', '#000000'],
      ['Blanc', '#FFFFFF'],
      ['Gris', '#87909A'],
      ['Rouge', '#D32941'],
      ['Bleu', '#0A2CA5'],
    ],
  },
  {
    slug: 'asa',
    name: 'ASA',
    material: 'ASA',
    price: 29.99,
    nozzle: [240, 270],
    bed: 90,
    dry: [80, 8],
    hygroscopic: true,
    url: STORE,
    colors: [
      ['Noir', '#000000'],
      ['Blanc', '#FFFFFF'],
      ['Gris', '#8A949E'],
    ],
  },
  {
    slug: 'tpu-95a-hf',
    name: 'TPU 95A HF',
    material: 'TPU',
    finish: 'Flexible',
    price: 34.99,
    nozzle: [220, 240],
    bed: 35,
    dry: [70, 8],
    hygroscopic: true,
    url: STORE,
    colors: [
      ['Noir', '#000000'],
      ['Blanc', '#FFFFFF'],
      ['Gris', '#939393'],
      ['Rouge', '#C8102E'],
      ['Bleu', '#0072CE'],
    ],
  },
  {
    slug: 'support-for-pla',
    name: 'Support for PLA',
    material: 'Support',
    price: 34.99,
    nozzle: [190, 220],
    bed: 55,
    dry: [55, 8],
    hygroscopic: true,
    url: STORE,
    colors: [['Blanc', '#FFFFFF']],
  },
];

export const BAMBU_BRAND_ID = 'brand-bambu-lab';

/** Tare indicative d'une bobine plastique réutilisable Bambu Lab vide (à vérifier avec une pesée). */
export const BAMBU_DEFAULT_TARE_G = 250;

export interface CatalogSeed {
  brands: CatalogBrand[];
  products: CatalogProduct[];
  colors: CatalogColor[];
}

export function buildCatalogSeed(): CatalogSeed {
  const brands: CatalogBrand[] = [
    {
      ...base,
      id: BAMBU_BRAND_ID,
      name: 'Bambu Lab',
      defaultTareG: BAMBU_DEFAULT_TARE_G,
      website: 'https://eu.store.bambulab.com/fr',
      notes: 'Tare indicative de la bobine réutilisable : pèse une bobine vide pour l’ajuster.',
    },
  ];
  const products: CatalogProduct[] = [];
  const colors: CatalogColor[] = [];
  for (const p of BAMBU_PRODUCTS) {
    const productId = `prod-bambu-${p.slug}`;
    products.push({
      ...base,
      id: productId,
      brandId: BAMBU_BRAND_ID,
      name: p.name,
      material: p.material,
      finish: p.finish ?? null,
      diameterMm: 1.75,
      netWeightG: 1000,
      tareG: BAMBU_DEFAULT_TARE_G,
      defaultPrice: p.price ?? null,
      refillPrice: p.refillPrice ?? null,
      nozzleTempMin: p.nozzle[0],
      nozzleTempMax: p.nozzle[1],
      bedTemp: p.bed,
      dryTempC: p.dry?.[0] ?? null,
      dryHours: p.dry?.[1] ?? null,
      hygroscopic: p.hygroscopic ?? false,
      productUrl: p.url ?? null,
      notes: null,
    });
    for (const [name, hex, ref] of p.colors) {
      colors.push({
        ...base,
        id: `color-bambu-${p.slug}-${looseKey(name).replace(/ /g, '-')}`,
        productId,
        name,
        hex,
        ref: ref ?? null,
        productUrl: null,
      });
    }
  }
  return { brands, products, colors };
}
