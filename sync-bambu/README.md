# Synchro cloud Bambu Lab — étape 1 : valider l’accès

Ce dossier contiendra la synchro automatique de l’historique des impressions (phase 6). **Étape 1** : vérifier que l’API cloud répond pour ton compte, et voir la **structure réelle** des données avant d’écrire la normalisation.

> ⚠️ API **non officielle**, documentée par la communauté (greghesp/ha-bambulab, coelacant1/Bambu-Lab-Cloud-API, doridian/OpenBambuAPI). Bambu Lab peut la modifier ou la bloquer sans préavis. FilaTrack fonctionne entièrement sans elle.

## 1. Se connecter (une fois, en local)

```bash
npm ci
```

```bash
npm run bambu-login
```

- Saisis ton email, ton mot de passe (masqué, jamais enregistré), puis le **code reçu par email**.
- Le script affiche le token (valable environ 3 mois) et les deux secrets à créer plus tard dans GitHub : `BAMBU_TOKEN` et `BAMBU_REGION`.
- Il propose de l’enregistrer dans `sync-bambu/.secrets.json`, un fichier **ignoré par git**, pour l’étape suivante.

## 2. Voir tes 5 dernières impressions

```bash
npm run bambu-peek
```

La réponse brute du cloud s’affiche et est écrite dans `sync-bambu/out/tasks-sample.json` (ignoré par git). Le numéro de série, l’uid et les URL signées sont **masqués** : tu peux copier cette sortie pour la partager. L’option `--raw` désactive le masquage (à ne pas partager) ; `--limit=10` affiche plus d’impressions.

## Ensuite (étape 2, après validation de la structure)

- normalisation vers `prints.json` (schéma zod partagé avec l’application) ;
- GitHub Action planifiée toutes les 30 minutes, plus un déclenchement manuel ; ouverture d’une issue « Token Bambu expiré » en cas d’erreur 401 ;
- boîte de réception « À valider » dans l’application ;
- rattachement aux bobines (slot AMS, puis type et couleur) et aux projets.
