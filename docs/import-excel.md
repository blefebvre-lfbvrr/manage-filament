# Import Excel : règles de correspondance

Logique pure dans [`src/lib/excel/`](../src/lib/excel). Tests : [`import.test.ts`](../src/lib/excel/import.test.ts).

## Détection

- **En-têtes** : dans chaque feuille, la ligne (parmi les 30 premières) qui contient le plus de libellés connus.
- **Rôle de la feuille** : _Bobines_ ou _Impressions_ selon les colonnes reconnues. Une feuille de texte (mode d’emploi) est ignorée. Une feuille sans en-tête, comme la feuille masquée « Dropdown options », est traitée comme une feuille de _Listes_.
- **Bloc de paramètres** au-dessus du tableau : « Seuil « bientôt vide » (g) », « Seuil « à changer » (g) » et « Prochaine impression prévue (g) » deviennent les paramètres correspondants (optionnel).
- **Colonnes calculées** : une colonne qui contient des formules (Restant, % restant, Statut, Nb impressions, Coût…) sert à _vérifier_ les valeurs recalculées, jamais de source de données.

## Correspondance (fichier « Suivi filament »)

### Feuille Bobines

| Colonne Excel                                                                                               | FilaTrack                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ID                                                                                                          | `legacyId`, et `code` si l’option « garder les ID » est cochée                                                                 |
| Matière                                                                                                     | gamme ; le matériau est déduit (PLA Basic → PLA). « ABS / ASA » est signalé comme ambigu                                       |
| Couleur                                                                                                     | nom de couleur ; le code hex vient du catalogue, d’abord par la référence « Réf. NNNNN » des notes, puis par le nom            |
| Emplacement                                                                                                 | `AMS n` → statut AMS + slot ; `Support externe` → statut externe ; `Terminée` → vide ; autre valeur (« Rangée ») → emplacement |
| Poids net initial (g)                                                                                       | `initialNetG`                                                                                                                  |
| Déjà consommé avant suivi (g)                                                                               | mouvement `prior_consumption`                                                                                                  |
| Prix bobine (€), Marque, Ouverte le, Notes                                                                  | mêmes champs ; « recharge » dans les notes → `isRefill` ; « estimation / à confirmer » → `needsWeighing`                       |
| Restant, % restant, Statut, Consommé depuis suivi, Nb impressions, Coût consommé, Assez pour la prochaine ? | calculées, vérification seulement                                                                                              |
| Colonne inconnue                                                                                            | champ personnalisé                                                                                                             |

Les lignes qui ne contiennent qu’un ID (B10 à B15 préparées à l’avance) sont ignorées.

### Feuille Impressions

| Colonne Excel                         | FilaTrack                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Date, Pièce, Projet, Durée (h), Notes | `date`, `name`, projet (créé s’il n’existe pas), `durationMin`, `notes`                       |
| Bobine / Relais (auto-refill)         | `usages[]`, rôle `main` / `relay`, en résolvant l’ID d’origine ou le code                     |
| Filament (g)                          | `estimatedG`                                                                                  |
| Sur bobine (g) / Sur relais (g)       | répartition des grammes entre la bobine principale et le relais (valeurs en cache de l’Excel) |
| Résultat                              | Réussie / Ratée / Annulée                                                                     |
| État / bobine, Coût (€)               | calculées, ignorées                                                                           |

Règles :

- **Pas de bobine et pas de résultat** → impression _planifiée_ (file « à imprimer »), sans déduction.
- **Bobine mais pas de résultat** → _réussie_, marquée « à vérifier ».
- **Résultat sans bobine ni poids** → importée sans déduction, marquée « à vérifier ».
- **Bobine inconnue** → avertissement, pas de déduction.
- **Ordre** : sans date, l’ordre des lignes est utilisé comme ordre chronologique du journal.

### Feuille de listes

Chaque colonne est classée automatiquement :

- emplacements → table `locations` ;
- projets → table `projects` ;
- gammes → ajoutées au catalogue si elles sont absentes ;
- résultats et ID → ignorés.

Une liste non reconnue est signalée dans le rapport.

## Doublons

Une bobine est un doublon si elle a le même ID d’origine ou le même code qu’une bobine existante. Une impression est un doublon si elle a le même nom, le même projet, et la même ligne d’origine ou le même poids. Trois stratégies :

- **ignorer**, par défaut ;
- **mettre à jour la fiche** : le stock et les déductions ne changent pas ;
- **créer en double**, avec un nouveau code.

## Rapport

Le rapport a trois niveaux : erreurs (la ligne est ignorée), avertissements et informations. Il est téléchargeable en CSV. Le rapprochement compare le restant recalculé (poids net − déjà consommé − impressions) avec la colonne « Restant » de l’Excel.
