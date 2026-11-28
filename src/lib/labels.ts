/** Étiquettes QR : modèles de planches, mise en page et lecture d'un code scanné. Fonctions pures. */
import QRCode from 'qrcode';
import type { Spool } from './schemas';

export interface LabelSheet {
  id: string;
  label: string;
  /** Format de page en mm (planche A4, ou étiquette seule pour une imprimante à rouleau). */
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  marginTop: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
}

export const LABEL_SHEETS: LabelSheet[] = [
  {
    id: 'a4-3x8',
    label: 'A4 · 24 étiquettes 70 × 37 mm (sans marge)',
    pageW: 210,
    pageH: 297,
    cols: 3,
    rows: 8,
    labelW: 70,
    labelH: 37,
    marginTop: 0.5,
    marginLeft: 0,
    gapX: 0,
    gapY: 0,
  },
  {
    id: 'a4-3x7',
    label: 'A4 · 21 étiquettes 63,5 × 38,1 mm (type L7160)',
    pageW: 210,
    pageH: 297,
    cols: 3,
    rows: 7,
    labelW: 63.5,
    labelH: 38.1,
    marginTop: 15.15,
    marginLeft: 7.21,
    gapX: 2.54,
    gapY: 0,
  },
  {
    id: 'a4-2x7',
    label: 'A4 · 14 étiquettes 99,1 × 38,1 mm (type L7163)',
    pageW: 210,
    pageH: 297,
    cols: 2,
    rows: 7,
    labelW: 99.1,
    labelH: 38.1,
    marginTop: 15.15,
    marginLeft: 4.65,
    gapX: 2.5,
    gapY: 0,
  },
  {
    id: 'a4-5x13',
    label: 'A4 · 65 étiquettes 38,1 × 21,2 mm (type L7651)',
    pageW: 210,
    pageH: 297,
    cols: 5,
    rows: 13,
    labelW: 38.1,
    labelH: 21.2,
    marginTop: 10.7,
    marginLeft: 4.65,
    gapX: 2.5,
    gapY: 0,
  },
  {
    id: 'roll-50x30',
    label: 'Rouleau · 50 × 30 mm (imprimante d’étiquettes)',
    pageW: 50,
    pageH: 30,
    cols: 1,
    rows: 1,
    labelW: 50,
    labelH: 30,
    marginTop: 0,
    marginLeft: 0,
    gapX: 0,
    gapY: 0,
  },
];

export function customSheet(o: Partial<LabelSheet>): LabelSheet {
  const labelW = o.labelW ?? 60;
  const labelH = o.labelH ?? 30;
  const single = !o.cols || !o.rows;
  return {
    id: 'custom',
    label: 'Personnalisé',
    pageW: single ? labelW : (o.pageW ?? 210),
    pageH: single ? labelH : (o.pageH ?? 297),
    cols: o.cols || 1,
    rows: o.rows || 1,
    labelW,
    labelH,
    marginTop: o.marginTop ?? 0,
    marginLeft: o.marginLeft ?? 0,
    gapX: o.gapX ?? 0,
    gapY: o.gapY ?? 0,
  };
}

/** Problèmes de mise en page (étiquettes qui dépassent de la page). */
export function sheetProblems(s: LabelSheet): string[] {
  const out: string[] = [];
  if (s.labelW <= 0 || s.labelH <= 0) out.push('Taille d’étiquette invalide.');
  const w = s.marginLeft + s.cols * s.labelW + (s.cols - 1) * s.gapX;
  const h = s.marginTop + s.rows * s.labelH + (s.rows - 1) * s.gapY;
  if (w > s.pageW + 0.01)
    out.push(`Les étiquettes dépassent la largeur de la page (${w.toFixed(1)} > ${s.pageW} mm).`);
  if (h > s.pageH + 0.01)
    out.push(`Les étiquettes dépassent la hauteur de la page (${h.toFixed(1)} > ${s.pageH} mm).`);
  return out;
}

export interface PlacedLabel<T> {
  item: T;
  page: number;
  x: number;
  y: number;
}

/**
 * Répartit les étiquettes sur les planches. `skip` : emplacements déjà utilisés sur la première
 * planche (pour finir une planche entamée), `copies` : exemplaires par élément.
 */
export function layoutLabels<T>(
  items: T[],
  s: LabelSheet,
  skip = 0,
  copies = 1,
): { pages: number; labels: PlacedLabel<T>[] } {
  const per = s.cols * s.rows;
  const start = Math.max(0, Math.min(per - 1, Math.floor(skip)));
  const list = items.flatMap((it) => Array.from({ length: Math.max(1, Math.floor(copies)) }, () => it));
  const labels = list.map((item, i) => {
    const slot = start + i;
    const page = Math.floor(slot / per);
    const k = slot % per;
    const col = k % s.cols;
    const row = Math.floor(k / s.cols);
    return {
      item,
      page,
      x: Math.round((s.marginLeft + col * (s.labelW + s.gapX)) * 100) / 100,
      y: Math.round((s.marginTop + row * (s.labelH + s.gapY)) * 100) / 100,
    };
  });
  return { pages: labels.length ? labels[labels.length - 1]!.page + 1 : 0, labels };
}

/** URL encodée dans le QR : ouvre directement la fiche de la bobine dans l'application. */
export function spoolUrl(spoolId: string, appUrl: string): string {
  return `${appUrl.replace(/#.*$/, '').replace(/\/?$/, '/')}#/spools/${encodeURIComponent(spoolId)}`;
}

/** Matrice du QR code sous forme de chemin SVG (1 unité = 1 module). */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  let d = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return { size, d };
}

/**
 * Retrouve la bobine d'un code scanné : URL d'une étiquette FilaTrack (#/spools/<id>),
 * identifiant, ou code court (B04, b4, PLA-001, pla1…).
 */
export function findScannedSpool(text: string, spools: Spool[]): Spool | null {
  const t = text.trim();
  if (!t) return null;
  const m = /#\/spools\/([^/?#\s]+)/.exec(t);
  const id = m ? decodeURIComponent(m[1]!) : t;
  const byId = spools.find((s) => s.id === id);
  if (byId) return byId;
  const norm = (c: string) => {
    const x = /^([a-z]+)[-_ ]?0*(\d+)$/i.exec(c.trim());
    return x ? `${x[1]!.toUpperCase()}${Number(x[2])}` : c.trim().toUpperCase();
  };
  const code = norm(t);
  return spools.find((s) => norm(s.code) === code && !s.deletedAt) ?? null;
}
