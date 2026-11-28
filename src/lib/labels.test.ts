import { buildDemoData } from './demo';
import {
  customSheet,
  findScannedSpool,
  LABEL_SHEETS,
  layoutLabels,
  qrPath,
  sheetProblems,
  spoolUrl,
} from './labels';
import { boxesToStl, normalizeStlText, plaqueBoxes, textRuns, textWidthPx } from './stl';

const spools = buildDemoData().spools;

describe('étiquettes', () => {
  it('les planches prédéfinies tiennent dans la page', () => {
    for (const s of LABEL_SHEETS) expect(sheetProblems(s), s.id).toEqual([]);
    expect(sheetProblems(customSheet({ labelW: 80, labelH: 30, cols: 3, rows: 2 }))[0]).toMatch(/largeur/);
    expect(customSheet({ labelW: 40, labelH: 25 })).toMatchObject({ pageW: 40, pageH: 25, cols: 1 });
  });
  it('mise en page avec emplacements déjà utilisés et copies', () => {
    const s = LABEL_SHEETS.find((x) => x.id === 'a4-3x8')!;
    const r = layoutLabels(['a', 'b', 'c'], s, 22, 2);
    expect(r.pages).toBe(2);
    expect(r.labels.map((l) => [l.page, l.x, l.y])).toEqual([
      [0, 70, 259.5],
      [0, 140, 259.5],
      [1, 0, 0.5],
      [1, 70, 0.5],
      [1, 140, 0.5],
      [1, 0, 37.5],
    ]);
    expect(layoutLabels([], s).pages).toBe(0);
  });
  it('QR code et URL', () => {
    const url = spoolUrl('abc', 'https://x.github.io/manage-filament/#/labels');
    expect(url).toBe('https://x.github.io/manage-filament/#/spools/abc');
    const q = qrPath(url);
    expect(q.size).toBeGreaterThanOrEqual(25);
    expect(q.d).toMatch(/^M0 0h7/);
  });
  it('retrouve la bobine scannée', () => {
    const s = spools[3]!;
    expect(findScannedSpool(spoolUrl(s.id, 'https://a/b/'), spools)?.id).toBe(s.id);
    expect(findScannedSpool(s.id, spools)?.id).toBe(s.id);
    expect(findScannedSpool(s.code.toLowerCase(), spools)?.id).toBe(s.id);
    expect(findScannedSpool('petg1', spools)?.id).toBe(s.id);
    expect(findScannedSpool('B04', [{ ...s, code: 'B4' }])?.id).toBe(s.id);
    expect(findScannedSpool('inconnu', spools)).toBeNull();
    expect(findScannedSpool('  ', spools)).toBeNull();
  });
});

describe('plaquette STL', () => {
  it('texte normalisé et pixels', () => {
    expect(normalizeStlText('Blanc de jade — PLA Matté')).toBe('BLANC DE JADE PLA MATTE');
    expect(textWidthPx('AB')).toBe(11);
    // « I » : barre du haut 3 px, puis colonne centrale.
    expect(textRuns('I')).toEqual([
      { row: 0, col: 1, len: 3 },
      ...[1, 2, 3, 4, 5].map((row) => ({ row, col: 2, len: 1 })),
      { row: 6, col: 1, len: 3 },
    ]);
  });
  it('socle + relief, STL binaire valide', () => {
    const p = plaqueBoxes({ lines: ['B04', 'PLA Basic Noir'], minWidthMm: 40 });
    expect(p.heightMm).toBe(2);
    expect(p.widthMm).toBeGreaterThanOrEqual(40);
    const [base, ...text] = p.boxes;
    expect(base).toMatchObject({ x: 0, y: 0, z: 0, h: 1.2 });
    for (const b of text) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(p.widthMm + 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.d).toBeLessThanOrEqual(p.depthMm + 1e-6);
      expect(b.z).toBe(1.2);
    }
    const stl = boxesToStl(p.boxes);
    const view = new DataView(stl);
    expect(view.getUint32(80, true)).toBe(p.boxes.length * 12);
    expect(stl.byteLength).toBe(84 + p.boxes.length * 12 * 50);
    // Première normale : face du dessous du socle.
    expect([view.getFloat32(84, true), view.getFloat32(88, true), view.getFloat32(92, true)]).toEqual([
      0, 0, -1,
    ]);
  });
});
