# Pont imprimante (phase 7, optionnel)

Ce dossier accueillera un petit script Node.js, à lancer sur un ordinateur du réseau local. Il se connectera à la Bambu Lab A1 en **MQTT local** (mode LAN, port 8883, code d’accès LAN) pour :

- détecter le début et la fin des impressions, et les créer automatiquement dans FilaTrack ;
- suivre le contenu des slots de l’AMS lite ;
- proposer la création d’une bobine quand une nouvelle puce RFID Bambu est détectée.

## Limites, à lire avant de compter dessus

- Le protocole MQTT de Bambu Lab **n’est pas officiel** et peut changer après une mise à jour du firmware. Les firmwares récents ont ajouté un contrôle d’autorisation, et le « mode développeur » en LAN peut être nécessaire.
- Une page GitHub Pages **ne peut pas** se connecter directement à l’imprimante : le navigateur interdit le MQTT brut et les certificats auto-signés. Le pont local est indispensable pour cela.
- La disponibilité d’un % restant fiable par RFID sur l’AMS lite sera vérifiée en phase 7.

FilaTrack fonctionne entièrement sans ce pont.
