/**
 * Lecture d'un .3mf découpé par Bambu Studio / OrcaSlicer :
 * - Metadata/slice_info.config : plateaux, durée, poids et longueur par filament ;
 * - Metadata/project_settings.config : profils filament (gamme), densité, diamètre ;
 * - Metadata/model_settings.config et plate_N.json : nom des plateaux / objets.
 */
import { unzipSync } from 'fflate';
import { normalizeHex } from '../color';
import { gramsFromLength, productHint } from './bambu';
import { SlicerParseError, type SlicedFile, type SlicedPlate, type SlicerFilament } from './types';

const decoder = new TextDecoder();

/** Décompresse uniquement les métadonnées (le G-code embarqué peut peser des dizaines de Mo). */
export function read3mfEntries(data: Uint8Array): Record<string, string> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => f.name.startsWith('Metadata/') && /\.(config|json)$/i.test(f.name),
    });
  } catch {
    throw new SlicerParseError('Ce fichier n’est pas une archive .3mf valide.');
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, decoder.decode(v)]));
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = decodeEntities(m[2]!);
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function metadata(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/<metadata\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]!);
    if (a.key) out[a.key] = a.value ?? '';
  }
  return out;
}

const num = (v: string | undefined | null) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface ProjectSettings {
  filament_settings_id?: string[];
  filament_type?: string[];
  filament_colour?: string[];
  filament_density?: string[];
  filament_diameter?: string[];
  filament_ids?: string[];
}

function plateNames(entries: Record<string, string>): Map<number, string> {
  const names = new Map<number, string>();
  const model = entries['Metadata/model_settings.config'];
  if (model) {
    for (const m of model.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
      const md = metadata(m[1]!);
      const idx = num(md.plater_id);
      if (idx !== null && md.plater_name) names.set(idx, md.plater_name);
    }
  }
  for (const [path, text] of Object.entries(entries)) {
    const pm = /^Metadata\/plate_(\d+)\.json$/.exec(path);
    if (!pm || names.has(Number(pm[1]))) continue;
    try {
      const j = JSON.parse(text) as { bbox_objects?: { name?: string }[] };
      const objs = (j.bbox_objects ?? [])
        .map((o) => o.name)
        .filter((n): n is string => Boolean(n) && !/wipe_tower/i.test(n!));
      if (objs.length)
        names.set(Number(pm[1]), [...new Set(objs)].slice(0, 3).join(', ') + (objs.length > 3 ? '…' : ''));
    } catch {
      /* plate_N.json illisible : ignoré */
    }
  }
  return names;
}

export function parse3mf(entries: Record<string, string>): SlicedFile {
  const warnings: string[] = [];
  let settings: ProjectSettings = {};
  const ps = entries['Metadata/project_settings.config'];
  if (ps) {
    try {
      settings = JSON.parse(ps) as ProjectSettings;
    } catch {
      warnings.push('Réglages du projet illisibles : gammes non détectées.');
    }
  }
  const names = plateNames(entries);
  const info = entries['Metadata/slice_info.config'];
  const slicerVersion = info
    ? attrs(/<header_item[^>]*X-BBL-Client-Version[^>]*>/.exec(info)?.[0] ?? '').value
    : undefined;
  const plates: SlicedPlate[] = [];

  if (info) {
    for (const m of info.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
      const block = m[1]!;
      const md = metadata(block);
      const index = num(md.index) ?? plates.length + 1;
      const filaments: SlicerFilament[] = [];
      for (const fm of block.matchAll(/<filament\b([^>]*?)\/?>/g)) {
        const a = attrs(fm[1]!);
        const id = num(a.id) ?? filaments.length + 1;
        const i = id - 1;
        const usedM = num(a.used_m);
        let usedG = num(a.used_g) ?? 0;
        if (!usedG && usedM) {
          usedG = gramsFromLength(
            usedM,
            num(settings.filament_density?.[i]) ?? undefined,
            num(settings.filament_diameter?.[i]) ?? undefined,
          );
          warnings.push(`Plateau ${index}, filament ${id} : poids calculé à partir de la longueur.`);
        }
        const settingsId = settings.filament_settings_id?.[i] ?? null;
        filaments.push({
          id,
          type: a.type || settings.filament_type?.[i] || '',
          color: normalizeHex(a.color) ?? normalizeHex(settings.filament_colour?.[i]),
          usedG: Math.round(usedG * 100) / 100,
          usedM,
          trayInfoIdx: a.tray_info_idx || null,
          settingsId,
          productHint: productHint(settingsId, a.tray_info_idx),
        });
      }
      plates.push({
        index,
        name: names.get(index) ?? null,
        predictionS: num(md.prediction),
        weightG: num(md.weight),
        filaments: filaments.filter((f) => f.usedG > 0 || (f.usedM ?? 0) > 0),
      });
    }
  }
  const sliced = plates.some((p) => p.filaments.length > 0);
  if (!sliced) {
    warnings.push(
      'Ce .3mf ne contient pas de résultat de découpe (poids par filament). Dans Bambu Studio, tranche le plateau puis utilise « Exporter le fichier de plateau découpé » (.gcode.3mf), ou saisis l’impression à la main.',
    );
  }
  return {
    source: '3mf',
    slicer: slicerVersion ? `Bambu Studio ${slicerVersion}` : null,
    sliced,
    plates: plates.filter((p) => p.filaments.length > 0),
    warnings,
  };
}

export function parse3mfFile(data: Uint8Array): SlicedFile {
  return parse3mf(read3mfEntries(data));
}
