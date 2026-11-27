/** Utilitaires couleur (aperçu des bobines, contraste WCAG). */

export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 6); // RRGGBBAA (format Bambu)
  if (/^[0-9a-f]{3}$/i.test(v))
    v = v
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-f]{6}$/i.test(v)) return null;
  return `#${v.toUpperCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Couleur de texte (noir ou blanc) lisible sur le fond donné. */
export function readableTextColor(bg: string | null | undefined): '#000000' | '#FFFFFF' {
  if (!bg || !normalizeHex(bg)) return '#000000';
  return contrastRatio(bg, '#000000') >= contrastRatio(bg, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/** Distance perceptuelle simple (« redmean ») entre deux couleurs, 0 = identiques. */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  const rmean = (ra[0] + rb[0]) / 2;
  const dr = ra[0] - rb[0];
  const dg = ra[1] - rb[1];
  const db = ra[2] - rb[2];
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}
