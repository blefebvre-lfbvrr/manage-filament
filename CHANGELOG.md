# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

## [0.2.0] — 2026-11-27 — Phase 2 : consommation

### Ajouté

- Saisie et modification des impressions : plusieurs filaments, relais auto-refill, projet (création à la volée), plateau, durée, notes, photo du résultat.
- Déduction automatique du stock avec synchronisation à la modification, annulation de la déduction, suppression annulable, raccourci « ratée à X % ».
- Import des fichiers `.3mf` découpés (Bambu Studio) et `.gcode` (Bambu Studio / OrcaSlicer) :
  - plateaux, poids et longueur par filament, durée, profils filament ;
  - rattachement automatique aux bobines et vérification du stock avant impression ;
  - conservation optionnelle du fichier.
- File d’attente avec le bouton « Imprimer ».
- Mode pesée (brut − tare), historique des pesées, mémorisation de la tare, page Pesée pour l’atelier.
- Vue AMS lite : 4 slots et support externe, glisser-déposer, sélection tactile, menu accessible au clavier.
- Journal global des mouvements avec filtres et annulation.
- Navigation mobile avec le menu « Plus ».

### Modifié

- Modèle : `usages[].plannedG` et `prints.stockApplied` (champs optionnels, sans migration).
- Les grammes des impressions sont arrondis au dixième, comme le journal.

### Corrigé

- Des éléments masqués pour l’accessibilité pouvaient élargir la page sur mobile (tableaux défilants).

## [0.1.0] — 2026-11-27 — Phase 1 : socle

### Ajouté

- Projet Vite + React 19 + TypeScript strict, Tailwind CSS 4, composants Radix accessibles, routeur en mode hash (GitHub Pages).
- Base IndexedDB (Dexie) en version 1, avec le schéma complet : bobines, impressions, mouvements, pesées, projets, achats, emplacements, catalogue, champs personnalisés, vues, alertes, notifications, correspondances d’import, pièces jointes, paramètres.
- Journal des mouvements de stock : le restant est la somme des mouvements, et chaque mouvement est annulable par un mouvement inverse.
- Inventaire :
  - tableau (tri, filtres combinés, recherche, colonnes masquables, édition en ligne) et vue cartes avec la couleur réelle ;
  - ajout rapide depuis le catalogue avec ajout multiple, duplication, actions groupées ;
  - fiche bobine avec son journal.
- Catalogue Bambu Lab prérempli et modifiable (gammes, couleurs, références, tares, prix, températures).
- Import Excel :
  - détection des feuilles et des en-têtes, correspondance des colonnes (mémorisée) ;
  - champs personnalisés pour les colonnes inconnues ;
  - doublons, rapport d’erreurs, comparaison des restants avec l’Excel ;
  - import des listes (projets, emplacements, gammes).
- Export Excel multi-feuilles, CSV (format français) et sauvegarde/restauration JSON avec validation ; rappel de sauvegarde.
- Données de démonstration dans une base séparée.
- Paramètres : seuils, thème, devise, format de date, unité, électricité, rappel de sauvegarde.
- Tests unitaires (Vitest, plus de 90 % de couverture sur `src/lib`), tests de bout en bout (Playwright desktop et mobile), CI GitHub Actions et déploiement GitHub Pages.
