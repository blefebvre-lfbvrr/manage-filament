# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

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
