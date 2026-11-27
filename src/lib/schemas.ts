/**
 * Modèle de données FilaTrack.
 * Les schémas zod sont la source unique de vérité : les types TypeScript en sont dérivés
 * et ils servent à valider les sauvegardes JSON et les imports.
 */
import { z } from 'zod';

const isoDate = z.string().min(1);
const optStr = z.string().optional().nullable();
const optNum = z.number().finite().optional().nullable();

export const baseEntity = z.object({
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  /** Suppression logique (permet l'annulation et la synchronisation). */
  deletedAt: optStr,
});

export const customValues = z.record(z.string(), z.unknown());

/* ------------------------------------------------------------------ */
/* Bobine                                                               */
/* ------------------------------------------------------------------ */

export const SPOOL_STATUSES = ['sealed', 'opened', 'ams', 'external', 'empty', 'archived'] as const;
export const spoolStatus = z.enum(SPOOL_STATUSES);
export type SpoolStatus = z.infer<typeof spoolStatus>;

export const amsSlot = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type AmsSlot = z.infer<typeof amsSlot>;

export const printSettings = z.object({
  nozzleTempMin: optNum,
  nozzleTempMax: optNum,
  bedTemp: optNum,
  speed: optStr,
  notes: optStr,
});

export const spoolSchema = baseEntity.extend({
  /** Code court lisible, utilisé sur les étiquettes (ex. PLA-001 ou B04). */
  code: z.string().min(1),
  /** Identifiant d'origine (ex. ID de l'Excel). */
  legacyId: optStr,
  brand: z.string().default(''),
  /** Gamme commerciale : PLA Basic, PETG HF… */
  productLine: z.string().default(''),
  /** Matériau générique : PLA, PETG, TPU… */
  material: z.string().default(''),
  catalogProductId: optStr,
  catalogColorId: optStr,
  colorName: z.string().default(''),
  colorHex: optStr,
  finish: optStr,
  /** Référence fabricant (ex. 10101 chez Bambu Lab). */
  manufacturerRef: optStr,
  diameterMm: z.number().positive().default(1.75),
  initialNetG: z.number().nonnegative(),
  /** Poids de la bobine vide (g). */
  tareG: optNum,
  /** Restant (g) : cache recalculé à partir du journal des mouvements. */
  remainingG: z.number(),
  isRefill: z.boolean().default(false),
  hasRfid: z.boolean().default(false),
  price: optNum,
  shippingShare: optNum,
  shop: optStr,
  purchaseDate: optStr,
  orderNo: optStr,
  lot: optStr,
  purchaseId: optStr,
  status: spoolStatus,
  amsSlot: amsSlot.optional().nullable(),
  location: optStr,
  openedAt: optStr,
  lastDriedAt: optStr,
  humidityNote: optStr,
  settings: printSettings.optional().nullable(),
  /** Seuils propres à la bobine (sinon seuils globaux). */
  lowThresholdG: optNum,
  criticalThresholdG: optNum,
  /** Une pesée est recommandée (valeur estimée, incohérence…). */
  needsWeighing: z.boolean().optional(),
  tags: z.array(z.string()).default([]),
  notes: optStr,
  photoIds: z.array(z.string()).default([]),
  custom: customValues.default({}),
});
export type Spool = z.infer<typeof spoolSchema>;

/* ------------------------------------------------------------------ */
/* Impression                                                           */
/* ------------------------------------------------------------------ */

export const PRINT_STATUSES = ['planned', 'success', 'failed', 'cancelled'] as const;
export const printStatus = z.enum(PRINT_STATUSES);
export type PrintStatus = z.infer<typeof printStatus>;

export const filamentUsage = z.object({
  spoolId: z.string().nullable(),
  grams: z.number().nonnegative(),
  /** Grammes prévus par le slicer (avant prorata d'une impression ratée). */
  plannedG: optNum,
  lengthM: optNum,
  /** main = bobine principale, relay = relais auto-refill de l'AMS. */
  role: z.enum(['main', 'relay']).default('main'),
  amsSlot: amsSlot.optional().nullable(),
  /** Infos du slicer (type + couleur) pour le rattachement. */
  slicerType: optStr,
  slicerColor: optStr,
});
export type FilamentUsage = z.infer<typeof filamentUsage>;

export const printJobSchema = baseEntity.extend({
  name: z.string().min(1),
  date: optStr,
  durationMin: optNum,
  projectId: optStr,
  plate: optStr,
  status: printStatus,
  failedAtPercent: optNum,
  /** Poids total annoncé par le slicer (g). */
  estimatedG: optNum,
  usages: z.array(filamentUsage).default([]),
  energyKwh: optNum,
  sourceFileId: optStr,
  photoIds: z.array(z.string()).default([]),
  notes: optStr,
  /** Position dans l'Excel d'origine (ordre chronologique supposé). */
  legacyRow: optNum,
  needsReview: z.boolean().optional(),
  reviewNote: optStr,
  /** La consommation de cette impression est actuellement déduite du stock. */
  stockApplied: z.boolean().optional(),
  custom: customValues.default({}),
});
export type PrintJob = z.infer<typeof printJobSchema>;

/* ------------------------------------------------------------------ */
/* Journal des mouvements de stock                                      */
/* ------------------------------------------------------------------ */

export const MOVEMENT_TYPES = [
  'initial',
  'prior_consumption',
  'print',
  'weighing',
  'correction',
  'undo',
] as const;
export const movementType = z.enum(MOVEMENT_TYPES);
export type MovementType = z.infer<typeof movementType>;

export const stockMovementSchema = baseEntity.extend({
  spoolId: z.string().min(1),
  type: movementType,
  /** Variation du restant en grammes (négatif = consommation). */
  deltaG: z.number(),
  at: isoDate,
  refKind: z.enum(['print', 'weighing', 'import', 'manual', 'movement']).optional().nullable(),
  refId: optStr,
  /** Mouvement annulé par celui-ci. */
  reversesId: optStr,
  /** Mouvement qui annule celui-ci. */
  reversedById: optStr,
  note: optStr,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

/* ------------------------------------------------------------------ */
/* Autres entités                                                       */
/* ------------------------------------------------------------------ */

export const weighingSchema = baseEntity.extend({
  spoolId: z.string().min(1),
  grossG: z.number(),
  tareG: z.number(),
  netG: z.number(),
  at: isoDate,
  note: optStr,
});
export type Weighing = z.infer<typeof weighingSchema>;

export const projectSchema = baseEntity.extend({
  name: z.string().min(1),
  color: optStr,
  budget: optNum,
  archived: z.boolean().default(false),
  notes: optStr,
});
export type Project = z.infer<typeof projectSchema>;

export const purchaseSchema = baseEntity.extend({
  shop: optStr,
  orderNo: optStr,
  date: optStr,
  shipping: optNum,
  total: optNum,
  spoolIds: z.array(z.string()).default([]),
  notes: optStr,
});
export type Purchase = z.infer<typeof purchaseSchema>;

export const locationSchema = baseEntity.extend({ name: z.string().min(1), notes: optStr });
export type Location = z.infer<typeof locationSchema>;

export const catalogBrandSchema = baseEntity.extend({
  name: z.string().min(1),
  /** Tare d'une bobine vide de la marque (g). */
  defaultTareG: optNum,
  website: optStr,
  notes: optStr,
});
export type CatalogBrand = z.infer<typeof catalogBrandSchema>;

export const catalogProductSchema = baseEntity.extend({
  brandId: z.string().min(1),
  /** Nom de la gamme : PLA Basic, PETG HF… */
  name: z.string().min(1),
  material: z.string().min(1),
  finish: optStr,
  diameterMm: z.number().positive().default(1.75),
  netWeightG: z.number().positive().default(1000),
  tareG: optNum,
  defaultPrice: optNum,
  refillPrice: optNum,
  nozzleTempMin: optNum,
  nozzleTempMax: optNum,
  bedTemp: optNum,
  dryTempC: optNum,
  dryHours: optNum,
  hygroscopic: z.boolean().default(false),
  productUrl: optStr,
  notes: optStr,
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

export const catalogColorSchema = baseEntity.extend({
  productId: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().min(1),
  ref: optStr,
  productUrl: optStr,
});
export type CatalogColor = z.infer<typeof catalogColorSchema>;

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'list', 'checkbox'] as const;
export const customFieldDefSchema = baseEntity.extend({
  entity: z.enum(['spool', 'print']),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string()).default([]),
  order: z.number().default(0),
});
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const savedViewSchema = baseEntity.extend({
  name: z.string().min(1),
  entity: z.enum(['spool', 'print']),
  state: z.record(z.string(), z.unknown()),
});
export type SavedView = z.infer<typeof savedViewSchema>;

export const alertRuleSchema = baseEntity.extend({
  scope: z.enum(['spool', 'material', 'productLine', 'color', 'productColor']),
  value: z.string().default(''),
  minSpools: optNum,
  minGrams: optNum,
  enabled: z.boolean().default(true),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

export const notificationSchema = baseEntity.extend({
  kind: z.string(),
  title: z.string(),
  body: optStr,
  link: optStr,
  /** Lue / masquée par l'utilisateur. */
  readAt: optStr,
  /** Notification navigateur déjà envoyée pour cette alerte. */
  notifiedAt: optStr,
});
export type AppNotification = z.infer<typeof notificationSchema>;

/** Ligne de la liste de courses (ajoutée à la main ou depuis un projet). */
export const shoppingItemSchema = baseEntity.extend({
  label: z.string().min(1),
  brand: optStr,
  productLine: optStr,
  material: optStr,
  colorName: optStr,
  colorHex: optStr,
  catalogProductId: optStr,
  catalogColorId: optStr,
  isRefill: z.boolean().default(false),
  quantity: z.number().int().positive().default(1),
  unitPrice: optNum,
  productUrl: optStr,
  source: z.enum(['manual', 'alert', 'project']).default('manual'),
  sourceRef: optStr,
  note: optStr,
  boughtAt: optStr,
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export const importMappingSchema = baseEntity.extend({
  name: z.string(),
  kind: z.enum(['spools', 'prints']),
  signature: z.string(),
  columns: z.record(z.string(), z.string()),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

export const attachmentSchema = baseEntity.extend({
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  /** Contenu encodé en data URL dans les sauvegardes, Blob en base. */
  data: z.unknown(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/* ------------------------------------------------------------------ */
/* Paramètres                                                           */
/* ------------------------------------------------------------------ */

export const appSettingsSchema = z.object({
  lowThresholdG: z.number().nonnegative().default(150),
  criticalThresholdG: z.number().nonnegative().default(50),
  nextPrintG: optNum,
  currency: z.string().default('EUR'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  dateFormat: z.string().default('dd/MM/yyyy'),
  weightUnit: z.enum(['g', 'kg']).default('g'),
  defaultDiameterMm: z.number().default(1.75),
  electricity: z
    .object({
      enabled: z.boolean().default(false),
      avgPowerW: z.number().default(95),
      pricePerKwh: z.number().default(0.2),
    })
    .default({ enabled: false, avgPowerW: 95, pricePerKwh: 0.2 }),
  /** Disposition du tableau de bord (ordre et widgets masqués). */
  dashboard: z
    .object({ order: z.array(z.string()).default([]), hidden: z.array(z.string()).default([]) })
    .default({ order: [], hidden: [] }),
  /** Fenêtre (jours) pour la consommation moyenne utilisée par les prévisions de rupture. */
  forecastWindowDays: z.number().int().positive().default(60),
  /** Rappel de séchage des matériaux hygroscopiques ouverts (jours, 0 = désactivé). */
  dryingReminderDays: z.number().int().nonnegative().default(30),
  /** Inclure les bobines « bientôt vides » (pas seulement « à changer » / vides) dans la liste de courses. */
  shoppingIncludeLow: z.boolean().default(false),
  /** Notifications système du navigateur (en plus du centre de notifications). */
  browserNotifications: z.boolean().default(false),
  backupReminderDays: z.number().int().nonnegative().default(14),
  lastBackupAt: optStr,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = appSettingsSchema.parse({});

export const settingRowSchema = z.object({ key: z.string(), value: z.unknown() });
export type SettingRow = z.infer<typeof settingRowSchema>;
