/** Construction des tableaux d'export (Excel multi-feuilles, CSV). Fonctions pures. */
import { MOVEMENT_LABELS } from './movements';
import type { PrintJob, Project, Spool, StockMovement } from './schemas';
import {
  costPerGram,
  effectiveThresholds,
  percentRemaining,
  SPOOL_STATUS_LABELS,
  STOCK_LEVEL_LABELS,
  stockLevel,
} from './spool';
import { locationOf } from './filters';
import { printCosts } from './stats';
import type { AppSettings } from './schemas';

export type Row = Record<string, string | number | boolean | null>;

const PRINT_STATUS_LABELS: Record<PrintJob['status'], string> = {
  planned: 'Planifiée',
  success: 'Réussie',
  failed: 'Ratée',
  cancelled: 'Annulée',
};
export { PRINT_STATUS_LABELS };

const r2 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d;

export function spoolCost(s: Spool, grams: number): number | null {
  const cpg = costPerGram(s);
  return cpg === null ? null : grams * cpg;
}

export function printCost(p: PrintJob, spoolsById: Map<string, Spool>): number {
  return p.usages.reduce((acc, u) => {
    const s = u.spoolId ? spoolsById.get(u.spoolId) : undefined;
    return acc + (s ? (spoolCost(s, u.grams) ?? 0) : 0);
  }, 0);
}

export function spoolRows(
  spools: Spool[],
  settings: Pick<AppSettings, 'lowThresholdG' | 'criticalThresholdG'>,
  customLabels: Record<string, string> = {},
): Row[] {
  return spools
    .filter((s) => !s.deletedAt)
    .map((s) => {
      const row: Row = {
        Code: s.code,
        'ID d’origine': s.legacyId ?? null,
        Marque: s.brand,
        Gamme: s.productLine,
        Matériau: s.material,
        Couleur: s.colorName,
        'Code couleur (hex)': s.colorHex ?? null,
        Finition: s.finish ?? null,
        'Référence fabricant': s.manufacturerRef ?? null,
        Statut: SPOOL_STATUS_LABELS[s.status],
        Emplacement: locationOf(s) || null,
        'Poids net initial (g)': s.initialNetG,
        'Restant (g)': r2(s.remainingG, 1),
        '% restant': r2(percentRemaining(s.remainingG, s.initialNetG), 4),
        Niveau: STOCK_LEVEL_LABELS[stockLevel(s.remainingG, effectiveThresholds(s, settings))],
        'Tare (g)': s.tareG ?? null,
        'Diamètre (mm)': s.diameterMm,
        'Prix (€)': s.price ?? null,
        'Frais de port (€)': s.shippingShare ?? null,
        'Coût au kg (€)': r2((costPerGram(s) ?? NaN) * 1000) ?? null,
        Magasin: s.shop ?? null,
        'Date d’achat': s.purchaseDate ?? null,
        'N° de commande': s.orderNo ?? null,
        Lot: s.lot ?? null,
        'Ouverte le': s.openedAt ?? null,
        'Dernier séchage': s.lastDriedAt ?? null,
        Recharge: s.isRefill ? 'oui' : 'non',
        'Puce RFID': s.hasRfid ? 'oui' : 'non',
        'Pesée recommandée': s.needsWeighing ? 'oui' : 'non',
        Tags: s.tags.join(', ') || null,
        Notes: s.notes ?? null,
      };
      if (Number.isNaN(row['Coût au kg (€)'] as number)) row['Coût au kg (€)'] = null;
      for (const [k, v] of Object.entries(s.custom ?? {})) {
        row[customLabels[k] ?? k] =
          v === null || v === undefined
            ? null
            : typeof v === 'object'
              ? JSON.stringify(v)
              : (v as string | number | boolean);
      }
      return row;
    });
}

export function printRows(
  prints: PrintJob[],
  spools: Spool[],
  projects: Project[],
  settings: Pick<AppSettings, 'electricity'> = {
    electricity: { enabled: false, avgPowerW: 0, pricePerKwh: 0 },
  },
): Row[] {
  const byId = new Map(spools.map((s) => [s.id, s]));
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  return prints
    .filter((p) => !p.deletedAt)
    .map((p) => {
      const main = p.usages.find((u) => u.role === 'main');
      const relay = p.usages.find((u) => u.role === 'relay');
      const code = (id: string | null | undefined) => (id ? (byId.get(id)?.code ?? '?') : null);
      return {
        Date: p.date ?? null,
        Pièce: p.name,
        Projet: p.projectId ? (projectsById.get(p.projectId) ?? null) : null,
        Plateau: p.plate ?? null,
        Résultat: PRINT_STATUS_LABELS[p.status],
        Bobine: code(main?.spoolId),
        'Relais (auto-refill)': code(relay?.spoolId),
        'Filament (g)':
          p.estimatedG ??
          r2(
            p.usages.reduce((a, u) => a + u.grams, 0),
            1,
          ),
        'Sur bobine (g)': main ? r2(main.grams, 1) : null,
        'Sur relais (g)': relay ? r2(relay.grams, 1) : null,
        'Autres bobines':
          p.usages
            .filter((u) => u !== main && u !== relay)
            .map((u) => `${code(u.spoolId)}:${u.grams}`)
            .join(', ') || null,
        'Durée (min)': p.durationMin ?? null,
        'Coût matière (€)': printCosts(p, byId, settings).material,
        'Coût électricité (€)': printCosts(p, byId, settings).energy,
        'Coût (€)': printCosts(p, byId, settings).total,
        'À vérifier': p.needsReview ? 'oui' : 'non',
        Notes: p.notes ?? null,
      };
    });
}

export function movementRows(movements: StockMovement[], spools: Spool[]): Row[] {
  const byId = new Map(spools.map((s) => [s.id, s.code]));
  return [...movements]
    .filter((m) => !m.deletedAt)
    .sort((a, b) => a.at.localeCompare(b.at) || a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({
      Date: m.at,
      Bobine: byId.get(m.spoolId) ?? m.spoolId,
      Type: MOVEMENT_LABELS[m.type],
      'Variation (g)': r2(m.deltaG, 1),
      Annulé: m.reversedById ? 'oui' : 'non',
      Note: m.note ?? null,
    }));
}

export function projectRows(projects: Project[]): Row[] {
  return projects
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      Projet: p.name,
      'Budget (€)': p.budget ?? null,
      Archivé: p.archived ? 'oui' : 'non',
      Notes: p.notes ?? null,
    }));
}

/** CSV compatible Excel français : séparateur « ; », BOM UTF-8, guillemets échappés. */
export function toCsv(rows: Row[], separator = ';'): string {
  if (!rows.length) return '\uFEFF';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return s.includes(separator) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(esc).join(separator),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(separator)),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}
