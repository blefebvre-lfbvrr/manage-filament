# Étiquettes, scan et application installable

## Étiquettes QR (page « Étiquettes »)

- Chaque QR code contient l’adresse de la fiche de la bobine (`…/manage-filament/#/spools/<id>`) : un scan avec l’appareil photo du téléphone ouvre directement FilaTrack sur cette bobine. L’identifiant ne change pas si tu renommes le code.
- Planches A4 prédéfinies (24 × 70 × 37 mm, 21 × 63,5 × 38,1 mm, 14 × 99,1 × 38,1 mm, 65 × 38,1 × 21,2 mm), étiquette seule pour imprimante à rouleau (50 × 30 mm), ou format **personnalisé** (taille, colonnes, lignes, marges, espacements ; 0 colonne = étiquette seule).
- « Emplacements déjà utilisés » permet de finir une planche entamée ; « Exemplaires » imprime plusieurs étiquettes par bobine.
- À l’impression : échelle **100 %** (taille réelle), sans en-têtes ni pieds de page. Les cotes des planches du commerce varient : imprime d’abord une page sur papier ordinaire et superpose-la à la planche.
- Bouton « Étiquette » sur chaque fiche de bobine.

## Scanner (page « Scanner »)

- Caméra arrière ; décodage sur l’appareil (API `BarcodeDetector` quand le navigateur la fournit, sinon jsQR). Aucune image n’est envoyée.
- Sans caméra ou si l’accès est refusé : bouton **Photo** (photo d’une étiquette) ou saisie du code (`PLA-004`, `pla4`…).
- Actions rapides : peser, placer dans un slot AMS ou sur le support externe, marquer comme séchée, ouvrir la fiche.
- La caméra exige HTTPS (c’est le cas sur GitHub Pages) et une autorisation du navigateur.

## Plaquette 3D (.stl)

Plaquette rectangulaire (socle 1,2 mm) avec le code et la couleur en relief (0,8 mm), dessinés avec une police bitmap 5 × 7 sans accents. Pour un texte contrasté, ajoute un changement de filament à 1,2 mm dans Bambu Studio. Les pavés du texte reposent sur le socle sans être fusionnés : les trancheurs les assemblent sans difficulté.

## Application installable (PWA)

- Service worker (Workbox) : l’application et ses ressources sont mises en cache, FilaTrack s’ouvre hors ligne après une première visite.
- Nouvelle version publiée : un message propose de recharger.
- Installation : Paramètres → Application (bouton natif sur Chrome / Edge / Android ; « Sur l’écran d’accueil » sur iPhone).
- Raccourcis de l’icône : Scanner, Peser, À valider.
