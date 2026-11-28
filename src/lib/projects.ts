/** Module Projets : avancement, consommation, coûts, prix, réservations. Fonctions pures. */
import { format } from 'date-fns';
import { normalizeHex } from './color';
import { roundG } from './movements';
import type {
  AppSettings,
  PartPlate,
  PrintJob,
  Project,
  ProjectPart,
  ProjectStatusDef,
  Spool,
} from './schemas';
import { DEFAULT_PROJECT_STATUSES } from './schemas';
import { looseKey, matchesQuery } from './text';
import { printCosts, toDate } from './stats';

type Settings = Pick<AppSettings, 'projects' | 'projectStatuses' | 'electricity'>;

export function statusDef(key: string, settings: Pick<AppSettings, 'projectStatuses'>): ProjectStatusDef {
  return (
    settings.projectStatuses.find((s) => s.key === key) ??
    DEFAULT_PROJECT_STATUSES.find((s) => s.key === key) ?? { key, label: key, reserves: false, closed: false }
  );
}

/** Le projet réserve-t-il du stock (statut « validé » / « en impression », non archivé) ? */
export function reservesStock(
  p: Pick<Project, 'status' | 'archived' | 'deletedAt'>,
  settings: Pick<AppSettings, 'projectStatuses'>,
): boolean {
  return !p.archived && !p.deletedAt && statusDef(p.status, settings).reserves;
}

/* ------------------------------ Pièces / plan ------------------------------ */

/** Clé d'un filament prévu : gamme (ou type) + couleur. */
export function filamentKey(f: { type: string; color?: string | null; productHint?: string | null }): string {
  return `${looseKey(f.productHint || f.type)}|${normalizeHex(f.color) ?? ''}`;
}

export interface PlannedFilament {
  key: string;
  type: string;
  color: string | null;
  productHint: string | null;
  grams: number;
  lengthM: number;
}

export interface ProjectPlan {
  filaments: PlannedFilament[];
  totalG: number;
  /** Plateaux à imprimer au total (plateaux × quantités). */
  totalPlates: number;
  totalTimeS: number;
}

export function partPlates(part: Pick<ProjectPart, 'plates' | 'quantity'>): number {
  return Math.max(1, part.plates.length) * part.quantity;
}

/** Consommation prévue d'après les .3mf × quantités (sans marge). */
export function projectPlan(parts: Pick<ProjectPart, 'plates' | 'quantity'>[]): ProjectPlan {
  const map = new Map<string, PlannedFilament>();
  let totalPlates = 0;
  let totalTimeS = 0;
  for (const part of parts) {
    totalPlates += partPlates(part);
    for (const plate of part.plates) {
      totalTimeS += (plate.predictionS ?? 0) * part.quantity;
      for (const f of plate.filaments) {
        const key = filamentKey(f);
        const acc = map.get(key) ?? {
          key,
          type: f.type,
          color: normalizeHex(f.color),
          productHint: f.productHint ?? null,
          grams: 0,
          lengthM: 0,
        };
        acc.grams += f.grams * part.quantity;
        acc.lengthM += (f.lengthM ?? 0) * part.quantity;
        map.set(key, acc);
      }
    }
  }
  const filaments = [...map.values()]
    .map((f) => ({ ...f, grams: roundG(f.grams), lengthM: Math.round(f.lengthM * 100) / 100 }))
    .sort((a, b) => b.grams - a.grams);
  return {
    filaments,
    totalG: roundG(filaments.reduce((a, f) => a + f.grams, 0)),
    totalPlates,
    totalTimeS: Math.round(totalTimeS),
  };
}

/** Convertit un fichier découpé (plateaux du slicer) en plateaux de pièce. */
export function platesFromSliced(
  plates: {
    index: number;
    name: string | null;
    predictionS: number | null;
    filaments: {
      id: number;
      type: string;
      color: string | null;
      productHint?: string | null;
      usedG: number;
      usedM: number | null;
    }[];
  }[],
): PartPlate[] {
  return plates.map((p) => ({
    index: p.index,
    name: p.name,
    predictionS: p.predictionS,
    filaments: p.filaments.map((f) => ({
      id: f.id,
      type: f.type,
      color: f.color,
      productHint: f.productHint ?? null,
      grams: f.usedG,
      lengthM: f.usedM,
    })),
  }));
}

/* ------------------------------- Avancement ------------------------------- */

export interface ProjectProgress {
  printedPlates: number;
  totalPlates: number;
  ratio: number;
  perPart: { partId: string; printed: number; total: number }[];
  failed: PrintJob[];
  done: PrintJob[];
  planned: PrintJob[];
}

/**
 * Avancement : chaque impression réussie rattachée compte pour un plateau
 * (sur sa pièce si elle est précisée, sinon sur le projet).
 */
export function projectProgress(project: Pick<Project, 'id' | 'parts'>, prints: PrintJob[]): ProjectProgress {
  const mine = prints.filter((p) => p.projectId === project.id && !p.deletedAt);
  const done = mine.filter((p) => p.status === 'success');
  const failed = mine.filter((p) => p.status === 'failed' || p.status === 'cancelled');
  const planned = mine.filter((p) => p.status === 'planned');
  const perPart = project.parts.map((part) => {
    const total = partPlates(part);
    return {
      partId: part.id,
      printed: Math.min(total, done.filter((p) => p.projectPartId === part.id).length),
      total,
    };
  });
  const totalPlates = perPart.reduce((a, p) => a + p.total, 0);
  const unassigned = done.filter(
    (p) => !p.projectPartId || !project.parts.some((x) => x.id === p.projectPartId),
  ).length;
  const printedPlates = totalPlates
    ? Math.min(totalPlates, perPart.reduce((a, p) => a + p.printed, 0) + unassigned)
    : done.length;
  return {
    printedPlates,
    totalPlates,
    ratio: totalPlates ? printedPlates / totalPlates : done.length ? 1 : 0,
    perPart,
    failed,
    done,
    planned,
  };
}

/* ---------------------------- Consommation réelle ---------------------------- */

export interface ActualUse {
  spoolId: string;
  grams: number;
  failedG: number;
  cost: number;
}

export function actualConsumption(
  projectId: string,
  prints: PrintJob[],
  spoolsById: Map<string, Spool>,
  settings: Pick<AppSettings, 'electricity'>,
): ActualUse[] {
  const map = new Map<string, ActualUse>();
  for (const p of prints) {
    if (p.projectId !== projectId || p.deletedAt || p.status === 'planned' || p.stockApplied === false)
      continue;
    const failed = p.status !== 'success';
    for (const u of p.usages) {
      if (!u.spoolId) continue;
      const acc = map.get(u.spoolId) ?? { spoolId: u.spoolId, grams: 0, failedG: 0, cost: 0 };
      acc.grams += u.grams;
      if (failed) acc.failedG += u.grams;
      const s = spoolsById.get(u.spoolId);
      acc.cost += s
        ? printCosts({ usages: [u], durationMin: 0, energyKwh: 0, status: p.status }, spoolsById, settings)
            .material
        : 0;
      map.set(u.spoolId, acc);
    }
  }
  return [...map.values()].map((a) => ({
    ...a,
    grams: roundG(a.grams),
    failedG: roundG(a.failedG),
    cost: Math.round(a.cost * 100) / 100,
  }));
}

/* --------------------------------- Coûts --------------------------------- */

export interface ProjectCost {
  material: number;
  /** Matière des impressions ratées / annulées (incluse dans material). */
  failedMaterial: number;
  electricity: number;
  machine: number;
  labor: number;
  total: number;
  printHours: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function projectCost(
  project: Pick<Project, 'id' | 'pricing'>,
  prints: PrintJob[],
  spoolsById: Map<string, Spool>,
  settings: Settings,
): ProjectCost {
  let material = 0;
  let failedMaterial = 0;
  let electricity = 0;
  let minutes = 0;
  for (const p of prints) {
    if (p.projectId !== project.id || p.deletedAt || p.status === 'planned') continue;
    const c = printCosts(p, spoolsById, settings);
    const applied = p.stockApplied !== false;
    if (applied) material += c.material;
    if (applied && p.status !== 'success') failedMaterial += c.material;
    electricity += c.energy;
    minutes += p.durationMin ?? 0;
  }
  const printHours = minutes / 60;
  const machine = printHours * settings.projects.machineHourlyRate;
  const labor = ((project.pricing.laborMinutes ?? 0) / 60) * settings.projects.laborHourlyRate;
  return {
    material: r2(material),
    failedMaterial: r2(failedMaterial),
    electricity: r2(electricity),
    machine: r2(machine),
    labor: r2(labor),
    total: r2(material + electricity + machine + labor),
    printHours: Math.round(printHours * 10) / 10,
  };
}

/** Estimation du coût d'après le plan (.3mf), avant impression. */
export function estimatedCost(
  plan: ProjectPlan,
  costPerGram: number | null,
  project: Pick<Project, 'pricing'>,
  settings: Settings,
): ProjectCost {
  const hours = plan.totalTimeS / 3600;
  const fail = 1 + settings.projects.failMarginPct / 100;
  const material = plan.totalG * (costPerGram ?? 0) * fail;
  const e = settings.electricity;
  const electricity = e.enabled ? hours * (e.avgPowerW / 1000) * e.pricePerKwh * fail : 0;
  const machine = hours * settings.projects.machineHourlyRate * fail;
  const labor = ((project.pricing.laborMinutes ?? 0) / 60) * settings.projects.laborHourlyRate;
  return {
    material: r2(material),
    failedMaterial: r2(material - material / fail),
    electricity: r2(electricity),
    machine: r2(machine),
    labor: r2(labor),
    total: r2(material + electricity + machine + labor),
    printHours: Math.round(hours * 10) / 10,
  };
}

/** Prix suggéré : coût total + marge, arrondi au pas supérieur (ex. 0,50 €). */
export function suggestedPrice(cost: number, marginPct: number, roundTo: number): number {
  const raw = cost * (1 + marginPct / 100);
  if (!roundTo) return r2(raw);
  return r2(Math.ceil(raw / roundTo - 1e-9) * roundTo);
}

export function realMargin(
  finalPrice: number | null | undefined,
  cost: number,
): { amount: number; pct: number | null } | null {
  if (finalPrice == null) return null;
  const amount = r2(finalPrice - cost);
  return { amount, pct: finalPrice ? amount / finalPrice : null };
}

/* ------------------------------- Réservations ------------------------------- */

/**
 * Grammes réservés par bobine, par les projets qui réservent du stock (hors `exceptProjectId`).
 * La réservation diminue au fur et à mesure que le projet consomme la bobine.
 */
export function reservedBySpool(
  projects: Project[],
  prints: PrintJob[],
  settings: Pick<AppSettings, 'projectStatuses'>,
  exceptProjectId?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of projects) {
    if (p.id === exceptProjectId || !reservesStock(p, settings)) continue;
    for (const r of p.reservations) {
      const used = prints
        .filter(
          (x) => x.projectId === p.id && !x.deletedAt && x.status !== 'planned' && x.stockApplied !== false,
        )
        .reduce(
          (a, x) => a + x.usages.filter((u) => u.spoolId === r.spoolId).reduce((b, u) => b + u.grams, 0),
          0,
        );
      const left = Math.max(0, r.grams - used);
      if (left > 0) out.set(r.spoolId, roundG((out.get(r.spoolId) ?? 0) + left));
    }
  }
  return out;
}

/** Bobines avec le stock réellement disponible (restant − réservé par les autres projets). */
export function withAvailable<T extends Pick<Spool, 'id' | 'remainingG'>>(
  spools: T[],
  reserved: Map<string, number>,
): (T & { availableG: number; reservedG: number })[] {
  return spools.map((s) => {
    const reservedG = reserved.get(s.id) ?? 0;
    return { ...s, reservedG, availableG: roundG(Math.max(0, s.remainingG - reservedG)) };
  });
}

/* ---------------------------- Rattachement auto ---------------------------- */

/**
 * Trouve le projet d'une impression d'après son nom de fichier :
 * préfixe « [CODE] » ou « CODE - », ou même nom qu'un .3mf déjà importé dans un projet.
 */
export function matchProject(
  name: string,
  projects: Project[],
): { project: Project; part?: ProjectPart; reason: string } | null {
  const active = projects.filter((p) => !p.deletedAt && !p.archived);
  const m = /^\s*\[([^\]]+)\]/.exec(name) ?? /^\s*([A-Za-z0-9_-]{2,20})\s+[-–]\s+/.exec(name);
  if (m) {
    const code = looseKey(m[1]);
    const p = active.find((x) => x.code && looseKey(x.code) === code);
    if (p) return { project: p, reason: `préfixe [${p.code}]` };
  }
  const base = looseKey(name.replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/i, ''));
  for (const p of active) {
    const part = p.parts.find(
      (x) => x.fileName && looseKey(x.fileName.replace(/\.gcode\.3mf$|\.3mf$/i, '')) === base,
    );
    if (part) return { project: p, part, reason: `fichier « ${part.fileName} » du projet` };
  }
  return null;
}

/* ---------------------------- Liste et tableau ---------------------------- */

export interface ProjectFilters {
  query: string;
  status: string;
  contactId: string;
  forWhom: '' | 'self' | 'others';
  period: '' | '30d' | '90d' | '12m';
  showArchived: boolean;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = {
  query: '',
  status: '',
  contactId: '',
  forWhom: '',
  period: '',
  showArchived: false,
};

export function filterProjects(
  projects: Project[],
  f: ProjectFilters,
  contactName: (id?: string | null) => string,
  now: Date,
): Project[] {
  const days = { '': 0, '30d': 30, '90d': 90, '12m': 365 }[f.period];
  return projects.filter((p) => {
    if (p.deletedAt) return false;
    if (!f.showArchived && p.archived) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.contactId && p.contactId !== f.contactId) return false;
    if (f.forWhom === 'self' && !p.forSelf) return false;
    if (f.forWhom === 'others' && p.forSelf) return false;
    if (days && (toDate(p.updatedAt)?.getTime() ?? 0) < now.getTime() - days * 86400_000) return false;
    return matchesQuery(
      `${p.name} ${p.code ?? ''} ${p.description ?? ''} ${p.tags.join(' ')} ${contactName(p.contactId)}`,
      f.query,
    );
  });
}

export type ProjectSort = 'updated' | 'name' | 'due' | 'status';

export function sortProjects(
  projects: Project[],
  sort: ProjectSort,
  settings: Pick<AppSettings, 'projectStatuses'>,
): Project[] {
  const order = new Map(settings.projectStatuses.map((s, i) => [s.key, i]));
  return [...projects].sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'fr');
      case 'due':
        return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      case 'status':
        return (
          (order.get(a.status) ?? 99) - (order.get(b.status) ?? 99) || a.name.localeCompare(b.name, 'fr')
        );
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
}

export interface MonthRevenue {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
  count: number;
}

/** Chiffre d'affaires et marge des projets pour des tiers, par mois (paiement, sinon livraison). */
export function revenueByMonth(
  projects: Project[],
  prints: PrintJob[],
  spoolsById: Map<string, Spool>,
  settings: Settings,
): MonthRevenue[] {
  const map = new Map<string, MonthRevenue>();
  for (const p of projects) {
    if (p.deletedAt || p.forSelf || p.pricing.finalPrice == null) continue;
    const d = toDate(p.pricing.paidAt) ?? toDate(p.deliveredAt);
    if (!d) continue;
    const month = format(d, 'yyyy-MM');
    const cost = projectCost(p, prints, spoolsById, settings).total;
    const acc = map.get(month) ?? { month, revenue: 0, cost: 0, margin: 0, count: 0 };
    acc.revenue += p.pricing.finalPrice;
    acc.cost += cost;
    acc.margin += p.pricing.finalPrice - cost;
    acc.count++;
    map.set(month, acc);
  }
  return [...map.values()]
    .map((m) => ({ ...m, revenue: r2(m.revenue), cost: r2(m.cost), margin: r2(m.margin) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
