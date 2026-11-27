import { strToU8, zipSync } from 'fflate';
/**
 * Classeur de test reproduisant la STRUCTURE de l'Excel « Suivi filament » (feuilles,
 * en-têtes, formules, bloc de seuils, liste masquée) avec des données fictives.
 */
import { buildWorkbook } from '../lib/excel/read';

const f = (v: number | string, formula: string) => ({ t: typeof v === 'number' ? 'n' : 's', v, f: formula });

export function legacyWorkbook(): Uint8Array {
  const spools: unknown[][] = [
    ['Seuil « bientôt vide » (g)', 150],
    ['Seuil « à changer » (g)', 50],
    ['Prochaine impression prévue (g)', null],
    [],
    ['Mes bobines'],
    [
      'ID',
      'Matière',
      'Couleur',
      'Emplacement',
      'Restant (g)',
      '% restant',
      'Statut',
      'Assez pour la prochaine ?',
      'Poids net initial (g)',
      'Déjà consommé avant suivi (g)',
      'Consommé depuis suivi (g)',
      'Nb impressions',
      'Prix bobine (€)',
      'Coût consommé (€)',
      'Marque',
      'Ouverte le',
      'Notes',
      'Fournisseur favori',
    ],
    [
      'B01',
      'PLA Basic',
      'Noir',
      'AMS 1',
      f(700, 'I7-J7-K7'),
      f(0.7, 'E7/I7'),
      f('OK', 'IF()'),
      null,
      1000,
      null,
      f(300, 'SUMIFS()'),
      f(2, 'COUNTIF()'),
      25.99,
      f(7.8, 'x'),
      'Bambu Lab',
      '15/03/2026',
      'Réf. 10101',
      'Bambu',
    ],
    [
      'B02',
      'PLA Basic',
      'Gris',
      'Rangée',
      f(250, 'I8-J8-K8'),
      f(0.25, 'E8/I8'),
      f('OK', 'IF()'),
      null,
      1000,
      750,
      f(0, 'SUMIFS()'),
      f(0, 'COUNTIF()'),
      25.99,
      f(19.5, 'x'),
      null,
      null,
      'Entamée, environ 250 g (estimation, à confirmer par une pesée)',
      null,
    ],
    [
      'B03',
      'PETG HF',
      'Blanc',
      'AMS 2',
      f(950, 'I9-J9-K9'),
      f(0.95, 'E9/I9'),
      f('OK', 'IF()'),
      null,
      1000,
      null,
      f(50, 'SUMIFS()'),
      f(1, 'COUNTIF()'),
      22.99,
      f(1.15, 'x'),
      'Bambu Lab',
      null,
      'recharge sans bobine',
      null,
    ],
    [
      'B04',
      'ABS / ASA',
      'Rouge',
      'Terminée',
      f(-5, 'I10-J10-K10'),
      f(-0.005, 'E10/I10'),
      f('Vide', 'IF()'),
      null,
      1000,
      1005,
      f(0, 'SUMIFS()'),
      f(0, 'COUNTIF()'),
      20,
      f(20.1, 'x'),
      'Autre',
      null,
      null,
      null,
    ],
    [
      'B05',
      null,
      null,
      null,
      f('', 'IF()'),
      f('', 'IF()'),
      f('', 'IF()'),
      null,
      null,
      null,
      f('', 'IF()'),
      f('', 'IF()'),
      null,
      f('', 'IF()'),
      null,
      null,
      null,
      null,
    ],
  ];
  const prints: unknown[][] = [
    ['Filament consommé (g)', f(350, 'SUM()')],
    [],
    [],
    [],
    ['Journal des impressions'],
    [
      'Date',
      'Pièce',
      'Projet',
      'Bobine',
      'Relais (auto-refill)',
      'Filament (g)',
      'Durée (h)',
      'Résultat',
      'État / bobine',
      'Coût (€)',
      'Notes',
      'Sur bobine (g)',
      'Sur relais (g)',
    ],
    [
      '01/04/2026',
      'Support A',
      'Atelier',
      'B01',
      null,
      200,
      2.5,
      'Réussie',
      f('PLA Basic Noir', 'x'),
      f(5.2, 'x'),
      null,
      f(200, 'x'),
      f('', 'x'),
    ],
    [
      null,
      'Support B',
      'Atelier',
      'B01',
      'B03',
      150,
      null,
      null,
      f('PLA Basic Noir → B03', 'x'),
      f(3, 'x'),
      null,
      f(100, 'x'),
      f(50, 'x'),
    ],
    [
      null,
      'Test sans bobine',
      'Test / calibration',
      null,
      null,
      null,
      null,
      'Réussie',
      f('À imprimer', 'x'),
      null,
      null,
      null,
      null,
    ],
    [
      null,
      'Pièce à venir',
      'Atelier',
      null,
      null,
      80,
      null,
      null,
      f('À imprimer', 'x'),
      null,
      null,
      null,
      null,
    ],
    [null, 'Ratée', 'Atelier', 'B99', null, 12, null, 'Ratée', null, null, 'bobine inconnue', null, null],
  ];
  const help: unknown[][] = [
    ['Suivi filament — mode d’emploi'],
    [],
    [
      'Dans Bobines, remplis une ligne par bobine : matière, couleur, emplacement, poids net et prix. Les colonnes à saisir sont en bleu.',
    ],
  ];
  const lists: unknown[][] = [
    ['AMS 1', 'PLA Basic', 'Réussie', 'B01', 'B01', 'Atelier'],
    ['AMS 2', 'PLA Silk', 'Ratée', 'B02', 'B02', 'Cadeaux'],
    ['Support externe', 'ABS / ASA', 'Annulée', 'B03', 'B03', 'Test / calibration'],
    ['Rangée', 'Nylon maison', null, 'B04', 'B04', null],
    ['Terminée', null, null, null, null, null],
  ];
  return buildWorkbook([
    { name: 'Bobines', rows: spools },
    { name: 'Impressions', rows: prints },
    { name: 'Mode d’emploi', rows: help },
    { name: 'Dropdown options', rows: lists, hidden: true },
  ]);
}

/** .3mf « découpé » au format Bambu Studio (slice_info.config + project_settings.config). */
export function sliced3mf(): Uint8Array {
  const sliceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header><header_item key="X-BBL-Client-Version" value="02.03.00.70"/></header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="5025"/>
    <metadata key="weight" value="56.31"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="14.10" used_g="42.10" />
    <filament id="3" tray_info_idx="GFA00" type="PLA" color="#C12E1F" used_m="4.76" used_g="14.21" />
  </plate>
</config>`;
  const project = JSON.stringify({
    filament_settings_id: ['Bambu PLA Basic @BBL A1', 'Bambu PLA Basic @BBL A1', 'Bambu PLA Basic @BBL A1'],
    filament_type: ['PLA', 'PLA', 'PLA'],
  });
  const model =
    '<config><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Boîtes"/></plate></config>';
  return zipSync({
    '3D/3dmodel.model': strToU8('<model/>'),
    'Metadata/slice_info.config': strToU8(sliceInfo),
    'Metadata/project_settings.config': strToU8(project),
    'Metadata/model_settings.config': strToU8(model),
  });
}
