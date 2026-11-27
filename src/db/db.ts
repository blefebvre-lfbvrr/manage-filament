/**
 * Base IndexedDB (Dexie). Toute évolution du schéma DOIT passer par une nouvelle
 * version déclarée ci-dessous (jamais modifier une version existante), avec si besoin
 * une fonction `upgrade` qui migre les données. Voir docs/data-model.md.
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  AlertRule,
  AppNotification,
  Attachment,
  CatalogBrand,
  CatalogColor,
  CatalogProduct,
  CustomFieldDef,
  ImportMapping,
  ShoppingItem,
  Location,
  PrintJob,
  Project,
  Purchase,
  SavedView,
  SettingRow,
  Spool,
  StockMovement,
  Weighing,
} from '@/lib/schemas';

export const DB_VERSION = 2;

export type DataMode = 'real' | 'demo';
export const DB_NAMES: Record<DataMode, string> = { real: 'filatrack', demo: 'filatrack-demo' };

export class FilaTrackDB extends Dexie {
  spools!: EntityTable<Spool, 'id'>;
  prints!: EntityTable<PrintJob, 'id'>;
  movements!: EntityTable<StockMovement, 'id'>;
  weighings!: EntityTable<Weighing, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  brands!: EntityTable<CatalogBrand, 'id'>;
  products!: EntityTable<CatalogProduct, 'id'>;
  colors!: EntityTable<CatalogColor, 'id'>;
  customFieldDefs!: EntityTable<CustomFieldDef, 'id'>;
  savedViews!: EntityTable<SavedView, 'id'>;
  alertRules!: EntityTable<AlertRule, 'id'>;
  notifications!: EntityTable<AppNotification, 'id'>;
  importMappings!: EntityTable<ImportMapping, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string) {
    super(name);
    // Version 1 — schéma initial (phase 1).
    this.version(1).stores({
      spools:
        'id, &code, legacyId, status, material, brand, productLine, catalogProductId, updatedAt, deletedAt',
      prints: 'id, status, date, projectId, legacyRow, updatedAt, deletedAt',
      movements: 'id, spoolId, type, at, refId, [spoolId+at], updatedAt',
      weighings: 'id, spoolId, at',
      projects: 'id, name, updatedAt',
      purchases: 'id, date',
      locations: 'id, &name',
      brands: 'id, name',
      products: 'id, brandId, name, material',
      colors: 'id, productId, name, ref',
      customFieldDefs: 'id, entity, key',
      savedViews: 'id, entity',
      alertRules: 'id, scope',
      notifications: 'id, kind, readAt, createdAt',
      importMappings: 'id, &signature',
      attachments: 'id',
      settings: 'key',
    });
    // Version 2 — phase 4 : liste de courses ; index des notifications par lecture.
    this.version(2).stores({
      shoppingItems: 'id, boughtAt, source, createdAt',
    });
    // Exemple pour une future version :
    // this.version(2).stores({ spools: '..., nouvelIndex' }).upgrade(tx => tx.table('spools').toCollection().modify(s => { ... }));
  }
}

const MODE_KEY = 'filatrack:mode';

export function getDataMode(): DataMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

export function setDataMode(mode: DataMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* stockage indisponible : on reste sur la base courante */
  }
}

let instance: FilaTrackDB | null = null;

export function getDb(): FilaTrackDB {
  if (!instance) instance = new FilaTrackDB(DB_NAMES[getDataMode()]);
  return instance;
}

/** Pour les tests : remplace la base courante. */
export function setDbForTests(db: FilaTrackDB | null) {
  instance = db;
}
