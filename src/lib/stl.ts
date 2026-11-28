/**
 * Plaquette d'identification imprimable en 3D (STL binaire) : socle rectangulaire + texte en relief,
 * dessiné avec une police bitmap 5 × 7. Aucune dépendance. Les pixels voisins d'une même ligne
 * sont fusionnés en un seul pavé pour limiter le nombre de triangles.
 */

/** Police 5 × 7 : 7 lignes de 5 bits par caractère (bit de poids fort = colonne de gauche). */
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  '/': [1, 1, 2, 4, 8, 16, 16],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '%': [24, 25, 2, 4, 8, 19, 3],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '#': [10, 10, 31, 10, 31, 10, 10],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  "'": [4, 4, 8, 0, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** Majuscules sans accents ; les caractères inconnus deviennent des espaces. */
export function normalizeStlText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toUpperCase()
    .split('')
    .map((c) => (FONT[c] ? c : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/** Pixels allumés d'une ligne de texte, regroupés en segments horizontaux (en unités de pixels). */
export function textRuns(text: string): { row: number; col: number; len: number }[] {
  const t = normalizeStlText(text);
  const runs: { row: number; col: number; len: number }[] = [];
  for (let row = 0; row < 7; row++) {
    let col = 0;
    let open = -1;
    const flush = () => {
      if (open >= 0) runs.push({ row, col: open, len: col - open });
      open = -1;
    };
    for (const ch of t) {
      const bits = FONT[ch]![row]!;
      for (let b = 4; b >= 0; b--) {
        if ((bits >> b) & 1) {
          if (open < 0) open = col;
        } else flush();
        col++;
      }
      flush();
      col++; // espace entre caractères
    }
    flush();
  }
  return runs;
}

export const textWidthPx = (text: string) => Math.max(0, normalizeStlText(text).length * 6 - 1);

export interface PlaqueOptions {
  lines: string[];
  /** Hauteur des caractères de la première ligne (mm) ; les suivantes font 70 %. */
  charHeightMm?: number;
  baseThicknessMm?: number;
  reliefMm?: number;
  marginMm?: number;
  /** Largeur minimale du socle (mm). */
  minWidthMm?: number;
}

export function plaqueBoxes(o: PlaqueOptions): {
  boxes: Box[];
  widthMm: number;
  depthMm: number;
  heightMm: number;
} {
  const ch = o.charHeightMm ?? 6;
  const base = o.baseThicknessMm ?? 1.2;
  const relief = o.reliefMm ?? 0.8;
  const margin = o.marginMm ?? 3;
  const lines = o.lines.map(normalizeStlText).filter(Boolean);
  const px = lines.map((_, i) => (i === 0 ? ch : ch * 0.7) / 7);
  const lineGap = ch * 0.45;
  const textW = Math.max(0, ...lines.map((l, i) => textWidthPx(l) * px[i]!));
  const textH = lines.reduce((a, _, i) => a + 7 * px[i]!, 0) + Math.max(0, lines.length - 1) * lineGap;
  const width = Math.max(o.minWidthMm ?? 0, textW + 2 * margin);
  const depth = textH + 2 * margin;
  const boxes: Box[] = [{ x: 0, y: 0, z: 0, w: width, d: depth, h: base }];
  // Y vers le haut : la première ligne est en haut de la plaquette.
  let top = depth - margin;
  lines.forEach((l, i) => {
    const p = px[i]!;
    const x0 = (width - textWidthPx(l) * p) / 2;
    for (const r of textRuns(l)) {
      boxes.push({ x: x0 + r.col * p, y: top - (r.row + 1) * p, z: base, w: r.len * p, d: p, h: relief });
    }
    top -= 7 * p + lineGap;
  });
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { boxes, widthMm: r3(width), depthMm: r3(depth), heightMm: r3(base + relief) };
}

/** STL binaire : 12 triangles par pavé, normales sortantes. */
export function boxesToStl(boxes: Box[], name = 'FilaTrack'): ArrayBuffer {
  const tris = boxes.length * 12;
  const buf = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buf);
  const header = new TextEncoder().encode(name.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(header);
  view.setUint32(80, tris, true);
  let off = 84;
  const tri = (n: number[], a: number[], b: number[], c: number[]) => {
    for (const v of [n, a, b, c])
      for (const k of v) {
        view.setFloat32(off, k, true);
        off += 4;
      }
    view.setUint16(off, 0, true);
    off += 2;
  };
  for (const { x, y, z, w, d, h } of boxes) {
    const X = x + w;
    const Y = y + d;
    const Z = z + h;
    const p = (i: number, j: number, k: number) => [i ? X : x, j ? Y : y, k ? Z : z];
    const quad = (n: number[], a: number[], b: number[], c: number[], e: number[]) => {
      tri(n, a, b, c);
      tri(n, a, c, e);
    };
    quad([0, 0, -1], p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0));
    quad([0, 0, 1], p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1));
    quad([0, -1, 0], p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1));
    quad([0, 1, 0], p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0));
    quad([-1, 0, 0], p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0));
    quad([1, 0, 0], p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1));
  }
  return buf;
}
