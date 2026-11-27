/** Données extraites d'un fichier découpé (.3mf Bambu Studio / OrcaSlicer ou .gcode). */
export interface SlicerFilament {
  /** Numéro du filament dans le projet (1 = premier filament, souvent le slot AMS 1). */
  id: number;
  /** Type annoncé par le slicer : PLA, PETG… */
  type: string;
  color: string | null;
  usedG: number;
  usedM: number | null;
  /** Identifiant de profil Bambu (ex. GFA00). */
  trayInfoIdx?: string | null;
  /** Nom du profil filament (ex. « Bambu PLA Basic @BBL A1 »). */
  settingsId?: string | null;
  /** Gamme déduite du profil (ex. « PLA Basic »). */
  productHint?: string | null;
}

export interface SlicedPlate {
  index: number;
  name: string | null;
  /** Durée estimée (secondes). */
  predictionS: number | null;
  /** Poids total annoncé (g). */
  weightG: number | null;
  filaments: SlicerFilament[];
}

export interface SlicedFile {
  source: '3mf' | 'gcode';
  slicer: string | null;
  /** Faux si le fichier ne contient pas de résultat de découpe (projet non tranché). */
  sliced: boolean;
  plates: SlicedPlate[];
  warnings: string[];
}

export class SlicerParseError extends Error {}
