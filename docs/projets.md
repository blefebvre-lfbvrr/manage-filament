# Module Projets

Logique pure : [`src/lib/projects.ts`](../src/lib/projects.ts) (avancement, coûts, prix, réservations, rattachement) et [`src/lib/feasibility.ts`](../src/lib/feasibility.ts) (faisabilité). Synchronisation : [`src/lib/cloud/`](../src/lib/cloud) et [`src/db/cloud.ts`](../src/db/cloud.ts).

## Projet

Un projet regroupe tout ce qui est imprimé pour un objectif :

- **pour moi** ou **pour un tiers** (contact réutilisable : nom, email ou téléphone, notes) ;
- un **code** court (ex. `DUPONT`) : un fichier `[DUPONT] support.3mf` ou `DUPONT - support.3mf` est rattaché automatiquement au projet ;
- un **statut** personnalisable : idée → devis → validé → en impression → terminé → livré → payé, plus l’archivage. Les statuts « validé » et « en impression » **réservent du stock** ;
- des **pièces** : un `.3mf` découpé (ou une saisie manuelle), avec ses plateaux et la quantité d’exemplaires.

## Avancement

Chaque impression **réussie** rattachée à une pièce compte pour un plateau. Avancement = plateaux imprimés / (plateaux × quantités).

Les impressions ratées ou annulées sont listées à part. Les impressions réussies sans pièce précisée sont signalées, sans être comptées.

## Faisabilité

1. **Besoin** = grammes du `.3mf` × quantités × (1 + marge de sécurité + marge pour les ratés). Par défaut 10 % + 5 %, réglable dans les Paramètres.
2. **Disponible** = restant de chaque bobine − grammes **réservés par les autres projets** qui réservent du stock. Une réservation diminue au fur et à mesure que le projet consomme la bobine.
3. **Correspondance**, filament par filament :
   - **bobines identiques** : même matériau, même gamme, couleur à moins de 40 d’écart ;
   - sinon **alternatives** : même matériau, couleur la plus proche avec l’écart affiché, à accepter ou refuser.

   Une bobine n’est jamais comptée deux fois.

4. **Résultat** :
   - ✅ suffisant ;
   - ⚠️ juste : couvre le besoin brut mais pas les marges ;
   - ❌ à commander, avec les grammes manquants.

   L’application signale quand plusieurs bobines entamées suffisent ensemble (changement de bobine, ou relais AMS, en cours d’impression).

5. **Commande** : nombre de bobines à acheter (selon le poids net de la gamme), prix d’après l’historique d’achat, lien produit, ajout en un clic à la liste de courses.
6. **Durée** : somme des durées × quantités. La date de fin est calculée à raison de N heures d’impression par jour (réglable).

Pour un projet commencé, la faisabilité porte sur le **reste à imprimer**.

Le mode rapide _Puis-je imprimer ça ?_ (`#/feasibility`) fait la même analyse sans créer de projet.

> À confirmer sur de vrais fichiers : le poids `used_g` de `slice_info.config` inclut-il les purges et la tour de purge ? D’après la documentation de la communauté, oui (c’est le total extrudé par filament), mais la vérification sera faite sur tes fichiers d’exemple.

## Coûts et prix

- **Réel** :
  - matière, au coût au gramme réel de chaque bobine, impressions ratées comprises ;
  - électricité (si activée) ;
  - machine : heures d’impression × coût horaire ;
  - main-d’œuvre : temps saisi × taux horaire.
- **Estimé** (d’après les `.3mf`) : matière au coût moyen du stock, avec la marge pour les ratés.
- **Prix suggéré** = coût (le plus élevé entre réel et estimé) × (1 + marge), arrondi au pas supérieur (0,50 € par défaut).
- Prix final, marge réelle, statut et montant du paiement.
- Devis et récapitulatif imprimables (_Imprimer / enregistrer en PDF_ du navigateur).

## Synchronisation avec le dépôt privé

Dépôt `blefebvre-lfbvrr/manage-filament-data` (réglable). Structure :

```
projects/<id>.json    un fichier par projet
contacts/<id>.json    un fichier par contact
files/<projet>/<pièce>-<nom>.3mf   fichiers ≤ 10 Mo (au-delà : métadonnées seules)
bambu/prints.json     historique du cloud Bambu (écrit par la GitHub Action)
data/<table>.json     option « toutes les données » : bobines, mouvements, impressions…
```

- **Hors ligne d’abord** : chaque modification est enregistrée localement et marquée « à envoyer ». La synchronisation se fait à l’ouverture (option) ou avec le bouton _Synchroniser_.
- **Conflits** (modifié sur deux appareils) : la version la plus récemment modifiée gagne. L’autre est conservée dans l’**historique** du projet (10 dernières versions) : rien n’est perdu.
- **Token** : token GitHub à grain fin, limité à ce dépôt, avec _Contents : lecture et écriture_. Il est stocké uniquement dans le navigateur (localStorage), jamais dans la base, les sauvegardes ou le code.

### Option « toutes les données »

Paramètres → Synchronisation → _Synchroniser toutes les données_. Chaque table (bobines, mouvements, impressions, pesées, catalogue, achats, emplacements, alertes, courses, champs personnalisés, vues, boîte « À valider ») est un fichier `data/<table>.json`, une ligne par enregistrement.

- Fusion **enregistrement par enregistrement** : le plus récemment modifié gagne ; les suppressions sont des marques (`deletedAt`), donc rien ne réapparaît.
- Les mouvements de stock de tous les appareils sont conservés, et le **restant de chaque bobine est recalculé** à partir d’eux : deux impressions saisies sur deux appareils sont bien déduites toutes les deux.
- Une impression du cloud Bambu validée sur un appareil apparaît validée sur les autres. Si elle est validée sur deux appareils **avant** qu’ils se synchronisent, elle est déduite deux fois : valide-la sur un seul appareil, ou synchronise d’abord.
- Les photos et les paramètres d’affichage restent propres à chaque appareil. Le dépôt garde l’historique git de chaque table.
