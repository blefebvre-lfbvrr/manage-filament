# Synchro cloud Bambu Lab

Récupère l’historique des impressions de ton compte Bambu Lab et le propose dans la boîte de réception **« À valider »** de FilaTrack. Rien n’est déduit du stock tant que tu n’as pas validé une impression (ou activé la validation automatique), et une même impression n’est **jamais déduite deux fois** : elle est identifiée par son id cloud.

> ⚠️ API **non officielle**, documentée par la communauté (greghesp/ha-bambulab, coelacant1/Bambu-Lab-Cloud-API, doridian/OpenBambuAPI). Bambu Lab peut la modifier ou la bloquer sans préavis. FilaTrack fonctionne entièrement sans elle.

## Fonctionnement

```
cloud Bambu ──(GitHub Action, toutes les 30 min)──▶ manage-filament-data/bambu/prints.json
                                                         │
                         FilaTrack (bouton Synchroniser) ◀┘──▶ « À valider » ──▶ impression + déduction
```

- `npm run sync-bambu` lit `GET /v1/user-service/my/tasks`, normalise chaque tâche avec le schéma zod partagé `src/lib/bambu/tasks.ts`, dédoublonne par id et écrit `bambu/prints.json` dans le **dépôt privé** (jamais dans le dépôt du site).
- Le fichier n’est réécrit que s’il y a du nouveau, ou toutes les 6 h pour indiquer que la synchro tourne : l’application affiche « dernière synchro il y a X » et prévient si elle s’arrête.
- Les journaux du workflow ne contiennent que des compteurs.

## Mise en place

1. **Token Bambu**, en local, une fois :

   ```bash
   npm ci
   ```

   ```bash
   npm run bambu-login
   ```

   Saisis ton email, ton mot de passe (masqué, jamais enregistré) puis le code reçu par email. Le script affiche le token (valable environ 3 mois) et propose de l’enregistrer dans `sync-bambu/.secrets.json` (ignoré par git).

2. **Vérifier la structure réelle** de tes données :

   ```bash
   npm run bambu-peek
   ```

   La réponse brute s’affiche et est écrite dans `sync-bambu/out/tasks-sample.json`, avec le numéro de série, l’uid et les URL signées **masqués**. Si un champ ne correspond pas à ce qu’attend `normalizeTask`, partage cette sortie masquée pour ajuster la normalisation.

3. **Dépôt privé** `manage-filament-data` (vide au départ) et **token GitHub à grain fin** limité à ce seul dépôt, permission _Contents : Read and write_.

4. **Secrets** du dépôt `manage-filament` (_Settings → Secrets and variables → Actions_) :
   - `BAMBU_TOKEN` : le token Bambu ;
   - `BAMBU_REGION` : `global` (ou `china`) ;
   - `DATA_REPO_TOKEN` : le token GitHub à grain fin ;
   - facultatif, variable `DATA_REPO` si le dépôt de données a un autre nom.

5. Lance le workflow _Synchro Bambu Lab_ une première fois (_Actions → Run workflow_). Dans FilaTrack, la synchro du dépôt privé (Paramètres → Synchronisation) récupère ensuite les impressions.

En local, `npm run sync-bambu` fait la même chose avec `sync-bambu/.secrets.json` et `DATA_REPO_TOKEN` en variable d’environnement.

## Token expiré

Sur une erreur 401, le workflow ouvre une issue **« Token Bambu expiré »** avec la marche à suivre : relancer `npm run bambu-login`, mettre à jour le secret `BAMBU_TOKEN`, relancer le workflow, fermer l’issue.

## Rattachement dans « À valider »

- **Bobine** : d’abord la bobine placée dans le slot AMS indiqué par le cloud (si le matériau correspond), sinon même type et couleur hex la plus proche. Chaque proposition est marquée « sûr » ou « à vérifier » et reste modifiable.
- **Projet** : préfixe `[CODE]` du nom de fichier (ex. `[DUPONT] support.3mf`), fichier .3mf déjà rattaché à une pièce d’un projet (le plateau est alors repris), nom du projet en tête du nom de fichier (« DeskShelf - … » → projet « DeskShelf »), ou choix manuel.
- **Échec ou annulation** : l’application demande l’avancement au moment de l’arrêt et déduit le filament prévu × ce pourcentage.
- **Validation automatique** (option) : seulement pour les impressions réussies dont toutes les bobines sont sûres.

## Temps réel MQTT (facultatif)

```bash
npm run bambu-live
```

Se connecte au broker du cloud (`us.mqtt.bambulab.com:8883`, utilisateur `u_<uid>`, mot de passe = token, sujet `device/<série>/report`), affiche l’état de l’impression en cours, écrit `sync-bambu/out/live.json`, et lance une synchro de l’historique une minute après la fin d’une impression si `DATA_REPO_TOKEN` est défini. Un chien de garde redemande l’état complet après 1 min sans message et force la reconnexion après 3 min (la connexion du cloud peut rester ouverte sans plus rien transmettre).

Ce script doit tourner sur une machine allumée (PC, Raspberry Pi) : une GitHub Action ne peut pas garder une connexion ouverte en permanence.

## Limites

- **API non officielle**. Vérifié sur une vraie réponse (A1 + AMS lite, novembre 2026, voir `tests/fixtures/bambu-tasks.json`) :
  - `status` 2 = réussie ; 3 = échouée et 4 = annulée restent **à confirmer** sur une impression ratée ou annulée ;
  - `amsDetailMapping[].ams` = slot AMS (0–3), cohérent avec `amsMapping` ; `amsId`/`slotId` du même bloc ne sont pas fiables ;
  - `weight` en grammes (total et par filament), `length` en **centimètres** ;
  - `costTime` est l’**estimation** du trancheur : la durée réelle est `endTime − startTime` ;
  - `title` vaut « `<fichier>_<NN> - <nom du plateau>` » (`plateName` est vide) : FilaTrack en extrait le fichier et le nom du plateau.
- **Cloudflare** peut bloquer les requêtes venant des serveurs GitHub. Dans ce cas, lance `npm run sync-bambu` en local, ou planifie-le sur un Raspberry Pi.
- **Mode LAN uniquement** : si l’imprimante n’est pas liée au cloud, l’historique est vide.
- **Poids des échecs** : le cloud donne le poids prévu, pas le filament réellement extrudé ; d’où la saisie de l’avancement.
- **Token** valable environ 3 mois ; la double authentification (TFA) est gérée mais non testée sur un vrai compte.
- **Planification GitHub** : sur un dépôt public, les workflows planifiés sont suspendus après 60 jours sans activité sur le dépôt, et l’heure d’exécution peut varier de quelques minutes.
- Le % restant RFID n’existe que pour les bobines Bambu.
