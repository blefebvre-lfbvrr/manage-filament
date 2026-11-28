# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

## [0.7.0] — 2026-11-28 — Phase 7 : étiquettes et application installable

### Ajouté

- Étiquettes QR (ouvrent la fiche de la bobine) : planches A4 prédéfinies, étiquette seule pour imprimante à rouleau, format personnalisé, emplacements déjà utilisés, exemplaires ; bouton « Étiquette » sur la fiche.
- Page « Scanner » : caméra (BarcodeDetector ou jsQR), photo ou saisie du code ; actions rapides (peser, placer dans l’AMS, séchée).
- Plaquette d’identification à imprimer en 3D (.stl) avec le code et la couleur en relief.
- PWA complète : manifeste, icônes, service worker, fonctionnement hors ligne, proposition de mise à jour, raccourcis, bouton d’installation.

### Modifié

- Navigation mobile : « Scanner » remplace « Pesée » (toujours accessible via « Plus » et depuis le scan).

## [0.6.0] — 2026-11-28 — Phase 6 : synchro cloud Bambu Lab

### Ajouté

- `npm run bambu-login` (email, code par email ou TFA) et `npm run bambu-peek` (5 dernières impressions brutes, masquées).
- `npm run sync-bambu` et la GitHub Action « Synchro Bambu Lab » (toutes les 30 min et à la demande) : historique normalisé (schéma zod partagé) écrit dans `bambu/prints.json` du dépôt privé, dédoublonné par id ; issue « Token Bambu expiré » ouverte sur une erreur 401.
- Boîte de réception « À valider » :
  - bobine proposée par slot AMS puis par type et couleur, marquée « sûr » ou « à vérifier » ;
  - projet rattaché par préfixe `[CODE]` ou fichier connu ;
  - échecs déduits au prorata de l’avancement saisi ;
  - validation automatique optionnelle ; ignorer / remettre à valider ;
  - jamais deux déductions pour la même impression.
- « Dernière synchro il y a X » et alerte si la synchro s’arrête ; badge du nombre d’impressions à valider dans la navigation.
- `npm run bambu-live` : suivi temps réel MQTT (facultatif), avec chien de garde et reconnexion.
- Exemples d’impressions à valider dans le mode démo.

### Modifié

- Base de données en version 4 (table `bambuTasks`), migration automatique.

## [0.5.0] — 2026-11-28 — Phase 5 : module Projets

### Ajouté

- Projets complets :
  - pour moi ou pour un tiers, contacts réutilisables ;
  - statuts personnalisables, code de préfixe, échéance, livraison, tags ;
  - pièces importées depuis des `.3mf` (plusieurs à la fois) ou saisies à la main, avec quantités.
- Avancement calculé à partir des impressions rattachées à une pièce ou un plateau ; impressions ratées listées à part.
- Consommation prévue contre réelle, par filament, avec l’écart.
- Analyse de faisabilité (marges, réservations, bobines identiques, alternatives, changement de bobine, liste de commande, durée et date de fin), aussi en mode rapide « Puis-je imprimer ça ? ».
- Réservation de bobines par projet.
- Coûts (matière, ratés, électricité, machine, main-d’œuvre), prix suggéré arrondi, prix final, marge réelle, paiement ; devis et récapitulatif imprimables en PDF ; chiffre d’affaires par mois.
- Rattachement automatique des impressions importées : préfixe `[CODE]`, ou `.3mf` déjà présent dans un projet.
- Synchronisation des projets, contacts et `.3mf` avec le dépôt GitHub privé (hors ligne d’abord, conflits fusionnés, historique) ; token stocké uniquement dans le navigateur.
- Paramètres des projets : marges, coûts horaires, arrondi, heures d’impression par jour.

### Modifié

- Base de données en version 3 (contacts ; statut, pièces, réservations et prix des projets), migration automatique.
- Le module « pont imprimante » MQTT local est abandonné au profit de la synchro cloud Bambu (phase 6).

## [0.4.0] — 2026-11-28 — Phase 4 : alertes et réapprovisionnement

### Ajouté

- Centre de notifications (badge, lecture, liens) et notifications navigateur optionnelles.
- Règles de stock minimum (bobine, matériau, gamme, couleur, gamme + couleur ; bobines ou grammes).
- Rappels de séchage des matériaux hygroscopiques ouverts, bouton « Séchée aujourd’hui ».
- Liste de courses :
  - suggestions automatiques, ajout manuel depuis le catalogue ;
  - prix estimés, liens produit, export texte et CSV ;
  - « Acheté » crée les bobines dans le stock.
- File d’attente : badge « stock insuffisant » sur les impressions planifiées.
- Paramètres : délai de séchage, inclusion des bobines « bientôt vides » dans les courses, notifications navigateur.

### Modifié

- Base de données en version 2 (nouvelle table `shoppingItems`), migration automatique depuis la version 1.

## [0.3.0] — 2026-11-27 — Phase 3 : tableau de bord et coûts

### Ajouté

- Tableau de bord :
  - indicateurs clés et graphiques Recharts (consommation, stock par matériau, stock par couleur réelle, dépenses, coût par projet, top des filaments) ;
  - vue tableau pour chaque graphique ;
  - prévision de rupture et liste des bobines à surveiller.
- Période, regroupement (jour / semaine / mois) et filtres globaux (matériau, projet).
- Widgets réorganisables et masquables, disposition enregistrée dans les paramètres (incluse dans les sauvegardes).
- Page Projets : budget, coût cumulé, avancement, impressions du projet.
- Coût électrique optionnel dans le coût des impressions, des projets et de l’export Excel (colonnes matière / électricité / total).
- Réglage de la fenêtre de calcul des prévisions.

### Corrigé

- Affichage « -0 g » / « -0 % » pour les bobines vides.

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
