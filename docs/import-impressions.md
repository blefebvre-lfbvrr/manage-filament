# Import des impressions (.3mf / .gcode)

Logique pure dans [`src/lib/slicer/`](../src/lib/slicer). Tests : [`slicer.test.ts`](../src/lib/slicer/slicer.test.ts).

## Quel fichier utiliser ?

| Fichier                                                                                                       | Contenu utile                                                              | Remarque                                            |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| **.gcode.3mf** (Bambu Studio : _Exporter le fichier de plateau découpé_, ou le fichier envoyé à l’imprimante) | poids **et** longueur par filament, durée, nom du plateau, profil filament | ✅ recommandé                                       |
| **.3mf projet** tranché puis enregistré                                                                       | idem, si le projet contient le résultat de la découpe                      | sinon, FilaTrack l’indique                          |
| **.3mf projet non tranché**                                                                                   | aucun poids                                                                | ❌ FilaTrack le signale au lieu d’inventer un poids |
| **.gcode** Bambu Studio / OrcaSlicer                                                                          | commentaires d’en-tête et de fin : poids, longueur, durée, type et couleur | secours                                             |

Tout est lu **dans le navigateur**. Pour un `.3mf`, seuls les fichiers `Metadata/*.config|json` sont décompressés. Pour un `.gcode`, seuls les premiers 512 Ko et les 2 derniers Mo sont lus.

## Ce qui est lu dans un .3mf

- `Metadata/slice_info.config`, un bloc `<plate>` par plateau :
  - `prediction` : durée en secondes ;
  - `weight` : poids total ;
  - pour chaque `<filament id type color used_m used_g tray_info_idx>`, un filament utilisé.
- `Metadata/project_settings.config` (JSON) :
  - `filament_settings_id` (ex. « Bambu PLA Basic @BBL A1 ») donne la **gamme** ;
  - `filament_density` et `filament_diameter` permettent de calculer le poids quand `used_g` vaut 0.
- `Metadata/model_settings.config` (`plater_name`) et `plate_N.json` donnent le nom du plateau.

## Rattachement aux bobines

Pour chaque filament du fichier, les bobines sont classées (`rankCandidates`) :

1. **Même matériau**, obligatoire : PLA, PETG, TPU…
2. **Même gamme** (PLA Basic, PLA Matte…), déduite du profil filament.
3. **Même couleur** : distance entre les codes hex.
4. **Slot AMS** : le filament n° _n_ correspond souvent au slot _n_.
5. Malus si la bobine est vide ou si son stock est insuffisant.

Une bobine n’est choisie automatiquement que si la correspondance est sûre. Sinon, l’assistant demande de choisir, avec les meilleures suggestions en tête de liste. Deux filaments ne sont jamais rattachés automatiquement à la même bobine.

**Vérification du stock** : si une bobine n’a pas assez de filament, l’assistant l’affiche avant l’enregistrement (« Il faut 180 g de PETG HF Blanc, il en reste 120 g : prévois un changement de bobine »).

## Déductions

- Enregistrer une impression **réussie, ratée ou annulée** crée un mouvement « Impression » par bobine. Une impression **planifiée** ne déduit rien.
- **Ratée à X %** : seule la part déposée est déduite. Les grammes prévus sont conservés dans `plannedG`.
- **Modifier** une impression compense les anciennes déductions puis applique les nouvelles. Si les quantités ne changent pas, aucun mouvement n’est ajouté.
- **Annuler la déduction**, **supprimer**, ou annuler depuis le journal : des mouvements inverses sont ajoutés, et l’historique reste intact.

## Limites connues

- Le format `.3mf` de Bambu Studio n’est pas documenté officiellement. Le parseur suit les fichiers produits par Bambu Studio 1.x / 2.x et sera ajusté si un fichier réel diverge.
- La liste des identifiants de profils Bambu (`tray_info_idx`) est volontairement courte. Le nom du profil (`filament_settings_id`) reste la source principale.
- Le poids annoncé par le slicer est une estimation ; une pesée de temps en temps recale le restant réel.
