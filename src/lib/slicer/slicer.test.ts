import { strToU8, zipSync } from 'fflate';
import { buildDemoData } from '../demo';
import type { Spool } from '../schemas';
import {
  gramsFromLength,
  parseDurationText,
  productFromSettingsId,
  productFromTrayIdx,
  sameProduct,
} from './bambu';
import { parseGcodeMeta } from './gcode';
import { autoMatch, autoMatchAll, normalizeSlicerType, rankCandidates } from './match';
import { parse3mfFile, read3mfEntries } from './threemf';
import { SlicerParseError } from './types';

const SLICE_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="02.03.00.70"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="5025"/>
    <metadata key="weight" value="56.31"/>
    <object identify_id="123" name="Boîte" skipped="false" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="14.10" used_g="42.10" />
    <filament id="3" tray_info_idx="GFA00" type="PLA" color="#C12E1F" used_m="4.76" used_g="14.21" />
    <filament id="4" tray_info_idx="GFG02" type="PETG" color="#FFFFFF" used_m="0" used_g="0" />
    <warning msg="bed_temperature_too_high_than_filament" level="1" error_code ="1000C001"  />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="1800"/>
    <filament id="1" type="PLA" color="#000000FF" used_m="2" used_g="0" />
  </plate>
</config>`;

const PROJECT = JSON.stringify({
  filament_settings_id: [
    'Bambu PLA Basic @BBL A1',
    'Bambu PLA Matte @BBL A1',
    'Bambu PLA Basic @BBL A1',
    'Bambu PETG HF @BBL A1',
  ],
  filament_type: ['PLA', 'PLA', 'PLA', 'PETG'],
  filament_colour: ['#000000', '#FFFFFF', '#C12E1F', '#FFFFFF'],
  filament_density: ['1.26', '1.32', '1.26', '1.25'],
  filament_diameter: ['1.75', '1.75', '1.75', '1.75'],
});

const MODEL_SETTINGS = `<config><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Tiroirs &amp; couvercles"/></plate></config>`;

function make3mf(files: Record<string, string>) {
  return zipSync(
    Object.fromEntries(
      Object.entries({ '3D/3dmodel.model': '<model/>', ...files }).map(([k, v]) => [k, strToU8(v)]),
    ),
  );
}

describe('lecture .3mf', () => {
  it('plateaux, durée, poids et gammes', () => {
    const f = parse3mfFile(
      make3mf({
        'Metadata/slice_info.config': SLICE_INFO,
        'Metadata/project_settings.config': PROJECT,
        'Metadata/model_settings.config': MODEL_SETTINGS,
        'Metadata/plate_2.json': JSON.stringify({ bbox_objects: [{ name: 'Clip' }, { name: 'wipe_tower' }] }),
        'Metadata/plate_1.gcode': 'G1 X0',
      }),
    );
    expect(f.sliced).toBe(true);
    expect(f.slicer).toBe('Bambu Studio 02.03.00.70');
    expect(f.plates).toHaveLength(2);
    const [p1, p2] = f.plates;
    expect(p1).toMatchObject({ index: 1, name: 'Tiroirs & couvercles', predictionS: 5025, weightG: 56.31 });
    expect(p1!.filaments.map((x) => [x.id, x.type, x.color, x.usedG, x.productHint])).toEqual([
      [1, 'PLA', '#000000', 42.1, 'PLA Basic'],
      [3, 'PLA', '#C12E1F', 14.21, 'PLA Basic'],
    ]);
    // Poids absent : calculé depuis la longueur et la densité.
    expect(p2!.name).toBe('Clip');
    expect(p2!.filaments[0]!.usedG).toBeCloseTo(6.06, 1);
    expect(f.warnings.some((w) => w.includes('longueur'))).toBe(true);
  });

  it('projet non découpé', () => {
    const f = parse3mfFile(make3mf({ 'Metadata/project_settings.config': PROJECT }));
    expect(f.sliced).toBe(false);
    expect(f.warnings[0]).toContain('Exporter le fichier de plateau découpé');
  });

  it('archive invalide ou réglages illisibles', () => {
    expect(() => read3mfEntries(strToU8('pas un zip'))).toThrow(SlicerParseError);
    const f = parse3mfFile(
      make3mf({ 'Metadata/slice_info.config': SLICE_INFO, 'Metadata/project_settings.config': '{oops' }),
    );
    expect(f.warnings[0]).toContain('illisibles');
    expect(f.plates[0]!.filaments[0]!.productHint).toBe('PLA Basic');
  });
});

describe('lecture .gcode', () => {
  it('Bambu Studio', () => {
    const g = `; HEADER_BLOCK_START
; BambuStudio 02.03.00.70
; model printing time: 1h 20m 5s; total estimated time: 1h 25m 10s
; total layer number: 120
; total filament length [mm] : 14100.12,4760.00
; total filament weight [g] : 42.10,14.21
; HEADER_BLOCK_END
G1 X1
; CONFIG_BLOCK_START
; filament_type = PLA;PLA
; filament_colour = #000000;#C12E1F
; filament_settings_id = "Bambu PLA Basic @BBL A1";"Bambu PLA Basic @BBL A1"
; CONFIG_BLOCK_END`;
    const f = parseGcodeMeta(g);
    expect(f.slicer).toBe('BambuStudio 02.03.00.70');
    expect(f.plates[0]!.predictionS).toBe(5110);
    expect(
      f.plates[0]!.filaments.map((x) => [x.id, x.type, x.color, x.usedG, x.usedM, x.productHint]),
    ).toEqual([
      [1, 'PLA', '#000000', 42.1, 14.1, 'PLA Basic'],
      [2, 'PLA', '#C12E1F', 14.21, 4.76, 'PLA Basic'],
    ]);
    expect(f.plates[0]!.weightG).toBe(56.31);
  });

  it('OrcaSlicer (pied de fichier)', () => {
    const g = `; generated by OrcaSlicer 2.1.1 on 2026-11-01 at 10:00:00 UTC
G1 X1
; filament used [mm] = 1234.50, 0.00
; filament used [g] = 3.72, 0.00
; total filament used [g] = 3.72
; estimated printing time (normal mode) = 12m 30s
; filament_type = PETG;PLA
; filament_colour = #FFFFFF;#000000`;
    const f = parseGcodeMeta(g);
    expect(f.slicer).toBe('OrcaSlicer 2.1.1');
    expect(f.plates[0]!.predictionS).toBe(750);
    expect(f.plates[0]!.filaments).toEqual([
      expect.objectContaining({ id: 1, type: 'PETG', usedG: 3.72, color: '#FFFFFF' }),
    ]);
  });

  it('poids total seul, ou aucune info', () => {
    const f = parseGcodeMeta('; total filament used [g] = 10.5\n; filament_type = PLA;PETG');
    expect(f.plates[0]!.filaments[0]!.usedG).toBe(10.5);
    expect(f.warnings[0]).toContain('poids total');
    expect(() => parseGcodeMeta('G1 X0\nG1 Y0')).toThrow(SlicerParseError);
  });
});

describe('utilitaires Bambu', () => {
  it('profils et durées', () => {
    expect(productFromSettingsId('Bambu PLA Basic @BBL A1')).toBe('PLA Basic');
    expect(productFromSettingsId('"Bambu Lab PETG HF @BBL A1M"')).toBe('PETG HF');
    expect(productFromSettingsId('Generic PLA @BBL A1')).toBeNull();
    expect(productFromSettingsId(null)).toBeNull();
    expect(productFromTrayIdx('gfa01')).toBe('PLA Matte');
    expect(productFromTrayIdx('XYZ')).toBeNull();
    expect(sameProduct('PLA Silk+', 'PLA Silk')).toBe(true);
    expect(sameProduct('PLA Basic', 'PLA Matte')).toBe(false);
    expect(parseDurationText('1d 2h 3m 4s')).toBe(93784);
    expect(parseDurationText('n/a')).toBeNull();
    expect(gramsFromLength(1)).toBeCloseTo(2.98, 1);
  });
});

describe('rattachement aux bobines', () => {
  const spools = buildDemoData().spools;
  const black = { id: 1, type: 'PLA', color: '#000000', usedG: 40, usedM: 13, productHint: 'PLA Basic' };

  it('privilégie type, gamme, couleur puis slot AMS', () => {
    const ranked = rankCandidates(black, spools);
    expect(ranked[0]!.spool.code).toBe('PLA-001'); // PLA Basic Noir dans l’AMS slot 1
    expect(ranked[0]!.reasons).toEqual(expect.arrayContaining(['même couleur', 'slot AMS 1']));
    expect(ranked.every((c) => c.spool.material === 'PLA')).toBe(true);
    expect(autoMatch(black, spools)?.spool.code).toBe('PLA-001');
  });

  it('pas de rattachement automatique douteux', () => {
    expect(autoMatch({ ...black, type: 'ASA', productHint: null }, spools)).toBeNull();
    expect(autoMatch({ ...black, color: '#FF00FF', productHint: null, id: 9 }, spools)).toBeNull();
  });

  it('bobines distinctes pour des filaments identiques', () => {
    const res = autoMatchAll([black, { ...black, id: 2 }], spools);
    expect(res[0]?.spool.code).toBe('PLA-001');
    expect(res[1]?.spool.id).not.toBe(res[0]?.spool.id);
  });

  it('pénalise les bobines vides et les stocks insuffisants', () => {
    const s: Spool[] = [
      { ...spools[0]!, id: 'a', status: 'empty', remainingG: 0 },
      { ...spools[0]!, id: 'b', status: 'opened', amsSlot: null, remainingG: 10 },
    ];
    const r = rankCandidates(black, s);
    expect(r[0]!.spool.id).toBe('b');
    expect(r[0]!.reasons).toContain('stock insuffisant');
    expect(r[1]!.reasons).toContain('bobine vide');
  });

  it('types slicer', () => {
    expect(normalizeSlicerType('PLA-S')).toBe('Support');
    expect(normalizeSlicerType('PETG-CF')).toBe('PETG');
    expect(normalizeSlicerType('pla')).toBe('PLA');
  });
});
