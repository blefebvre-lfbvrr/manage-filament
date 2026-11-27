# Modèle de données

Source de vérité : [`src/lib/schemas.ts`](../src/lib/schemas.ts) (schémas zod → types TypeScript). Stockage : IndexedDB via Dexie ([`src/db/db.ts`](../src/db/db.ts)).

Tous les enregistrements portent les champs `id` (UUID), `createdAt`, `updatedAt` et `deletedAt` (suppression logique).

## Bobine (`spools`)

| Champ                                                                            | Description                                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `code`                                                                           | Code court unique, imprimé sur l’étiquette (`PLA-001`, ou l’ID de l’Excel comme `B04`)               |
| `legacyId`                                                                       | ID d’origine (Excel)                                                                                 |
| `brand`, `productLine`, `material`, `finish`                                     | Marque, gamme (PLA Basic…), matériau générique (PLA…), finition                                      |
| `catalogProductId`, `catalogColorId`                                             | Liens vers le catalogue                                                                              |
| `colorName`, `colorHex`, `manufacturerRef`                                       | Couleur, code hex, référence fabricant (10101…)                                                      |
| `diameterMm`, `initialNetG`, `tareG`                                             | Diamètre, poids net initial, tare de la bobine vide                                                  |
| `remainingG`                                                                     | Restant : **cache** recalculé à partir du journal                                                    |
| `isRefill`, `hasRfid`                                                            | Recharge, puce RFID                                                                                  |
| `price`, `shippingShare`, `shop`, `purchaseDate`, `orderNo`, `lot`, `purchaseId` | Achat                                                                                                |
| `status`, `amsSlot`, `location`                                                  | `sealed` / `opened` / `ams` (+ slot 1 à 4) / `external` / `empty` / `archived`, et lieu de rangement |
| `openedAt`, `lastDriedAt`, `humidityNote`                                        | Ouverture, dernier séchage, humidité notée                                                           |
| `settings`                                                                       | Réglages recommandés : buse min/max, plateau, vitesse, notes                                         |
| `lowThresholdG`, `criticalThresholdG`                                            | Seuils propres à la bobine (sinon les seuils globaux)                                                |
| `needsWeighing`                                                                  | Pesée recommandée (valeur estimée, restant négatif…)                                                 |
| `tags`, `notes`, `photoIds`, `custom`                                            | Champs libres, photos, champs personnalisés                                                          |

Valeurs calculées, jamais stockées :

- % restant ;
- niveau (OK / Bientôt vide / À changer / Vide) ;
- coût au gramme : (prix + port) / poids net ;
- valeur restante.

## Journal des mouvements (`movements`)

Chaque variation de stock est un mouvement `{ spoolId, type, deltaG, at, refKind, refId, reversesId, reversedById, note }`.

| Type                | Origine                                             |
| ------------------- | --------------------------------------------------- |
| `initial`           | création de la bobine (+ poids net)                 |
| `prior_consumption` | « déjà consommé avant suivi » de l’Excel            |
| `print`             | consommation d’une impression                       |
| `weighing`          | ajustement après une pesée (phase 2)                |
| `correction`        | correction manuelle, ou modification du poids net   |
| `undo`              | annulation d’un autre mouvement (mouvement inverse) |

**Restant = somme des mouvements non supprimés.** On n’efface jamais l’historique : annuler, c’est ajouter un mouvement inverse.

## Impression (`prints`)

Une impression contient :

- `name`, `date`, `durationMin`, `projectId`, `plate` ;
- `status` : `planned`, `success`, `failed` ou `cancelled` ;
- `failedAtPercent`, `estimatedG` (poids du slicer) ;
- `usages[]` : `{ spoolId, grams, lengthM, role: main | relay, amsSlot, slicerType, slicerColor }` ;
- `energyKwh`, `sourceFileId`, `photoIds`, `notes`, `custom` ;
- `legacyRow`, `needsReview` et `reviewNote` pour l’import.

`relay` correspond à la bobine qui prend le relais en auto-refill dans l’AMS, la colonne « Relais » de l’Excel.

## Autres tables

| Table                                       | Contenu                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `weighings`                                 | historique des pesées : brut, tare, net                                         |
| `projects`                                  | projets : nom, budget, archivé                                                  |
| `purchases`                                 | commandes : magasin, numéro, date, port, bobines                                |
| `locations`                                 | lieux de rangement connus                                                       |
| `brands`, `products`, `colors`              | catalogue                                                                       |
| `customFieldDefs`                           | définition des champs personnalisés (texte, nombre, date, liste, case à cocher) |
| `savedViews`, `alertRules`, `notifications` | phases 4 et 6                                                                   |
| `importMappings`                            | correspondances de colonnes mémorisées, par signature d’en-têtes                |
| `attachments`                               | photos et fichiers (Blob ; data URL dans les sauvegardes)                       |
| `settings`                                  | paramètres de l’application                                                     |

## Migrations

`DB_VERSION` (dans `src/db/db.ts`) est la version courante. Pour faire évoluer le schéma :

1. **Ne jamais modifier** un bloc `this.version(n)` existant.
2. Ajouter `this.version(n + 1).stores({...})`, avec si besoin `.upgrade(tx => …)` pour transformer les données existantes.
3. Mettre à jour les schémas zod (les nouveaux champs ont une valeur par défaut ou sont optionnels, pour que les anciennes sauvegardes restent valides) et ajouter un test de migration.

Les sauvegardes JSON contiennent `schemaVersion` et `format`. Une sauvegarde d’un format plus récent est refusée, avec un message explicite.

## Mode démo

La démo utilise une base IndexedDB distincte (`filatrack-demo`). La base réelle (`filatrack`) n’est jamais ouverte tant que la démo est active.
