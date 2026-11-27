import type { VisibilityState } from '@tanstack/react-table';

export const COLUMN_LABELS: Record<string, string> = {
  code: 'Code',
  productLine: 'Gamme',
  colorName: 'Couleur',
  brand: 'Marque',
  material: 'Matériau',
  status: 'Statut',
  location: 'Emplacement',
  remainingG: 'Restant',
  percent: '% restant',
  level: 'Niveau',
  initialNetG: 'Poids net',
  price: 'Prix',
  costPerKg: 'Coût / kg',
  value: 'Valeur restante',
  purchaseDate: 'Achat',
  openedAt: 'Ouverte le',
  lastDriedAt: 'Séchage',
  shop: 'Magasin',
  tags: 'Tags',
  notes: 'Notes',
};

export const DEFAULT_HIDDEN: VisibilityState = {
  material: false,
  percent: false,
  initialNetG: false,
  value: false,
  purchaseDate: false,
  openedAt: false,
  lastDriedAt: false,
  shop: false,
  tags: false,
};
