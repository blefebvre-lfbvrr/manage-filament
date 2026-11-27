/** Format de sauvegarde JSON complet et validation à la restauration. */
import { z } from 'zod';
import {
  alertRuleSchema,
  attachmentSchema,
  catalogBrandSchema,
  catalogColorSchema,
  catalogProductSchema,
  customFieldDefSchema,
  importMappingSchema,
  locationSchema,
  notificationSchema,
  printJobSchema,
  projectSchema,
  purchaseSchema,
  savedViewSchema,
  settingRowSchema,
  spoolSchema,
  stockMovementSchema,
  weighingSchema,
} from './schemas';

export const TABLE_SCHEMAS = {
  spools: spoolSchema,
  prints: printJobSchema,
  movements: stockMovementSchema,
  weighings: weighingSchema,
  projects: projectSchema,
  purchases: purchaseSchema,
  locations: locationSchema,
  brands: catalogBrandSchema,
  products: catalogProductSchema,
  colors: catalogColorSchema,
  customFieldDefs: customFieldDefSchema,
  savedViews: savedViewSchema,
  alertRules: alertRuleSchema,
  notifications: notificationSchema,
  importMappings: importMappingSchema,
  attachments: attachmentSchema,
  settings: settingRowSchema,
} as const;

export type TableName = keyof typeof TABLE_SCHEMAS;
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];

export const BACKUP_APP = 'filatrack';
export const BACKUP_FORMAT = 1;

export type BackupTables = { [K in TableName]: z.infer<(typeof TABLE_SCHEMAS)[K]>[] };

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
}

export function makeBackup(
  tables: Partial<BackupTables>,
  schemaVersion: number,
  exportedAt = new Date().toISOString(),
): Backup {
  const full = Object.fromEntries(TABLE_NAMES.map((t) => [t, tables[t] ?? []])) as BackupTables;
  return { app: BACKUP_APP, format: BACKUP_FORMAT, schemaVersion, exportedAt, tables: full };
}

export type BackupValidation =
  { ok: true; backup: Backup; counts: Record<TableName, number> } | { ok: false; errors: string[] };

export function validateBackup(data: unknown): BackupValidation {
  const envelope = z
    .object({
      app: z.literal(BACKUP_APP),
      format: z.number(),
      schemaVersion: z.number(),
      exportedAt: z.string(),
      tables: z.record(z.string(), z.array(z.unknown())),
    })
    .safeParse(data);
  if (!envelope.success)
    return { ok: false, errors: ['Ce fichier n’est pas une sauvegarde FilaTrack valide.'] };
  if (envelope.data.format > BACKUP_FORMAT) {
    return {
      ok: false,
      errors: ['Sauvegarde créée par une version plus récente de FilaTrack : mets l’application à jour.'],
    };
  }
  const errors: string[] = [];
  const tables = {} as Record<TableName, unknown[]>;
  for (const name of TABLE_NAMES) {
    const rows = envelope.data.tables[name] ?? [];
    const schema = TABLE_SCHEMAS[name] as z.ZodType;
    tables[name] = rows.map((row, i) => {
      const r = schema.safeParse(row);
      if (!r.success) {
        const issue = r.error.issues[0];
        errors.push(`${name}[${i}] : ${issue?.path.join('.') || 'ligne'} — ${issue?.message ?? 'invalide'}`);
        return row;
      }
      return r.data;
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  const counts = Object.fromEntries(TABLE_NAMES.map((t) => [t, tables[t].length])) as Record<
    TableName,
    number
  >;
  return { ok: true, backup: { ...envelope.data, app: BACKUP_APP, tables: tables as BackupTables }, counts };
}

/** Faut-il rappeler de faire une sauvegarde ? */
export function isBackupDue(
  lastBackupAt: string | null | undefined,
  reminderDays: number,
  now: Date,
  hasData: boolean,
): boolean {
  if (!hasData || reminderDays <= 0) return false;
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > reminderDays * 86400_000;
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `filatrack-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.json`;
}
