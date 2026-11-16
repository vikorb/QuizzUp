# Banc matériel QuizzUP

> Document du 16 novembre 2026. Objectif : valider sur du **vrai matériel** tout ce qui n'a été
> testé qu'en simulation (voir `docs/REPRISE.md` §2 « À valider » et
> `docs/compatibilite/compatibilite-salles-6-pupitres.md` §5). C'est le **lot 0** du cadrage V1
> (`docs/cadrage/cadrage-v1.md`) : aucune salle ne doit être vendue avant que ce banc soit vert.
>
> Poste du banc : **TERMIVAVOR2** (Windows 11 Pro). Navigateur : Chrome stable à jour.

## 1. Principe

Un banc réduit, sur une table, qui reproduit **les deux chaînes** qu'on vendra :

| Chaîne | Pour qui | Buzzers | Lumières | Fumée |
| --- | --- | --- | --- | --- |
| **A. Salle neuve QuizzUP** (recommandée) | nouveaux centres | carte manette USB | interface **USB DMX Pro** (Web Serial, rien à installer) | relais DMX + relais temporisé 10 s |
| **B. Salle concurrent migrée** | centres déjà équipés | carte **Leo Bodnar 32 entrées** (la leur) | boîtier **Art-Net** Showtec NET-2/3 via le pont `game/artnet-bridge` | idem A (l'Arduino est retiré) |

Deux pupitres physiques suffisent pour tout prouver (égalités, couleurs, spots par pupitre) ; les
pupitres 3 à 6 se testent sur un vrai écran avec les buzzers simulés au clavier.

## 2. Liste d'achat

Prix = **ordres de grandeur à vérifier** au moment de commander, pas des devis.

| # | Article | Qté | Sert à | Ordre de grandeur |
| --- | --- | --- | --- | --- |
| 1 | Bouton arcade lumineux 60 mm, 12 V (bleu, jaune, vert, rouge) | 8 | 2 pupitres complets | 5-15 € pièce |
| 2 | Carte **Leo Bodnar BBI-32** (32 entrées, vue comme une manette) | 1 | chaîne B, même carte que les salles concurrentes | ~50 € |
| 3 | Encodeur USB « zero delay » (manette générique) | 1 | prouver que n'importe quelle carte manette marche (chaîne A) | ~10-15 € |
| 4 | Alimentation 12 V + bornier, fils, gaines | 1 lot | LED des boutons | ~20 € |
| 5 | Interface **Enttec DMX USB Pro** (l'originale) | 1 | référence Web Serial `usbpro` | ~100-150 € |
| 6 | Clone « compatible DMX USB Pro » (puce FTDI) | 1 | vérifier les clones qu'on conseillera aux clients | ~40-70 € |
| 7 | Câble Open DMX FTDI bas de gamme | 1 | pilote `opendmx` (option la moins chère) | ~20-30 € |
| 8 | Boîtier **Showtec NET-2/3 Pocket** (ou en emprunter un à un centre) | 1 | chaîne B, découverte ArtPoll, 2 univers | ~150-250 € |
| 9 | Lyre spot générique **9 canaux** (même type que les salles concurrentes) | 1 | profils, roue de couleurs, gobo, calage pan/tilt | ~60-120 € |
| 10 | Lyre wash RGBW 9 canaux | 1 | profil wash, couleur pupitre | ~60-120 € |
| 11 | Décodeur DMX512 RGB (8 sorties) + 1 m de ruban LED RGB 12 V + alim | 1 | rubans pupitre, ordre RGB, adresse 128 | ~40 € |
| 12 | Petite machine à fumée **avec télécommande filaire** + liquide | 1 | chaîne fumée réelle | ~50-80 € |
| 13 | Module **relais DMX 1 canal** | 1 | commande fumée | ~20-40 € |
| 14 | Relais temporisé **monostable** réglable (≤ 10 s) | 1 | coupure matérielle si la page plante | ~10 € |
| 15 | Bouton coup-de-poing sur multiprise (arrêt d'urgence) | 1 | coupe fumée + lumières | ~20-30 € |
| 16 | Câbles DMX XLR 3 broches + **bouchon de terminaison 120 Ω** | 4 + 1 | chaîne DMX propre | ~30 € |
| 17 | Adaptateur USB-Ethernet + câble RJ-45 | 1 | 2e carte réseau pour le boîtier Art-Net | ~15-20 € |
| 18 | Vidéoprojecteur ou TV 1080p en HDMI, enceintes | 1 | rendu réel, lisibilité à 3-4 m | déjà dispo ? |

Outils : multimètre, smartphone qui filme en **ralenti 240 i/s** (mesure de latence), un gabarit
qui appuie sur deux boutons à la fois (voir B3).

Budget indicatif du banc complet : **~800-1 200 €** hors écran, dont ~350 € évitables en
empruntant le boîtier Art-Net et une lyre à un centre partenaire.

## 3. Montage

1. **Sécurité d'abord** : multiprise derrière le coup-de-poing → machine à fumée, lyres, décodeur
   LED. Le PC et la carte buzzers restent sur une prise normale.
2. **Buzzers** : chaque bouton ferme une entrée de la carte (contact sec), masse commune. LED des
   boutons en 12 V, allumées pendant l'appui (comme chez le concurrent : elles ne sont **pas**
   pilotées par le PC). Pupitre 1 sur les entrées 1-4, pupitre 2 sur 5-8.
3. **DMX chaîne A** : USB DMX Pro → décodeur LED (adresse 128) → lyre spot (adresse 1) → lyre wash
   (adresse 10) → relais fumée (adresse 200) → bouchon 120 Ω.
4. **DMX chaîne B** : boîtier Art-Net sur la 2e carte réseau (PC en 192.168.200.1/24, boîtier en
   192.168.200.187), sortie 1 = lyres + relais fumée (univers 1), sortie 2 = décodeur LED (univers 2).
5. **Fumée** : relais DMX en parallèle du bouton de la télécommande (NO / COM), **en série avec le
   relais temporisé** réglé à 10 s.

## 4. Protocole

Ordre conseillé : B (buzzers) → D (DMX USB) → F (fumée) → G (partie complète) → A (Art-Net). Chaque
test a un critère chiffré. Noter le résultat dans le tableau du §5 ; chaque échec devient une issue
GitHub.

### B. Buzzers

| Test | Comment | Critère |
| --- | --- | --- |
| B1 Apprentissage manette | `/setup`, BBI-32 puis encodeur « zero delay » | 8 boutons appris, mapping conservé après rechargement et redémarrage du PC |
| B2 Premier appui | brancher la carte, appuyer une fois | l'appui d'activation n'est **pas** compté comme buzz |
| B3 Équité | un seul interrupteur câblé sur **deux entrées** (pupitres 1 et 2) : appuis simultanés par construction, 100 appuis | répartition 40-60 % au pire (rotation à l'égalité) |
| B4 Appuis courts | 100 tapes rapides par bouton | aucune perte pour un appui ≥ 30 ms ; noter le seuil de perte réel |
| B5 Latence | filmer bouton + écran en 240 i/s, 30 mesures | médiane ≤ 80 ms, max ≤ 150 ms entre l'appui et l'affichage |
| B6 Clavier | preset clavier 6 pupitres (AZERTY), puis perte de focus (Alt+Tab) | buzzs justes ; l'alerte « réactiver les buzzers » apparaît |
| B7 Deux manettes | brancher une 2e manette pendant l'apprentissage | constater le comportement ; **suivi connu** : le filtrage par nom de carte n'est pas proposé dans l'écran |
| B8 Débranchement | débrancher / rebrancher la carte en pleine question | la partie continue, les buzzers reviennent sans recharger |

### D. Lumières en USB DMX (chaîne A)

| Test | Comment | Critère |
| --- | --- | --- |
| D1 Détection | `/setup/lights`, Enttec puis clone puis Open DMX | autorisation demandée une seule fois, retrouvée après redémarrage |
| D2 Profils | « Est-ce que ça s'allume ? » appareil par appareil ; comparer avec la notice | ordre des canaux juste, faisceau ouvert (canal strobe / shutter) ; corriger le profil **dans la config**, pas dans le code |
| D3 Roue de couleurs | relever les valeurs sur la notice, régler, vérifier | couleur pupitre correcte sur le spot |
| D4 Calage | calage pan/tilt au clavier, puis import d'un `SessionConf.txt` d'exemple | spot centré sur chaque pupitre à ±10 cm à 3 m |
| D5 Rubans | couleur du pupitre qui buzze | bonne couleur (ordre RGB), bon ruban |
| D6 Coupure USB | débrancher l'interface en pleine partie, rebrancher | le jeu continue ; lumières reprises sans recharger |
| D7 Fluidité | blind test + scènes lumière en continu 10 min | pas de saccade audio ni visuelle ; trame DMX régulière (compteur de `meteredOutput`) |

### F. Fumée (sécurité, bloquant)

| Test | Comment | Critère |
| --- | --- | --- |
| F1 Émission | jet commandé depuis l'écran Matériel | durée respectée à ±0,5 s, cooldown respecté |
| F2 Plantage page | tuer le processus Chrome **pendant** un jet | le relais temporisé coupe en ≤ 10 s |
| F3 Coupure USB | débrancher l'interface pendant un jet | coupure en ≤ 10 s |
| F4 Arrêt d'urgence | bouton logiciel, puis coup-de-poing | arrêt immédiat ; l'état d'urgence survit au rechargement |
| F5 Sans relais | case « coupe sur perte de signal » + test guidé de débranchement | refus tant que le test n'est pas réussi |

### G. Partie complète

| Test | Comment | Critère |
| --- | --- | --- |
| G1 Partie réelle | partie lancée du backoffice, 2 pupitres physiques | partie jusqu'au podium, scores reçus au backoffice |
| G2 Endurance | 3 parties enchaînées (~3 h) | mémoire de l'onglet stable (Gestionnaire de tâches Chrome), audio sans dérive, aucun gel |
| G3 Mise en page | 6 pupitres (4 en simulation clavier) sur le vrai écran, lu à 4 m | tout lisible, rien de coupé |
| G4 Internet coupé | couper le Wi-Fi en milieu de partie | la partie finit ; scores envoyés au retour du réseau |
| G5 Veille | laisser le lobby 30 min | écran toujours allumé (Wake Lock), compte de salle toujours connecté |
| G6 Performance | onglet Performance de Chrome pendant une manche | 60 i/s tenues sur le GPU intégré du PC ; noter le pire écran |

### A. Art-Net (chaîne B)

| Test | Comment | Critère |
| --- | --- | --- |
| A1 Kit poste | `deploy/poste-salle/installer-poste.ps1` (jamais lancé en vrai) | pont en tâche SYSTEM au démarrage, règle pare-feu UDP 6454, politiques visibles dans `chrome://policy` |
| A2 Windows Home | même chose sur un PC ou une VM Windows Home | idem, ou limite documentée |
| A3 Exécutable non signé | premier lancement du pont | noter SmartScreen / Smart App Control / antivirus ; décide de la signature (cf. cadrage D3) |
| A4 Découverte | « Rechercher » dans `/setup/lights` | le NET-2/3 est trouvé, IP juste |
| A5 Deux univers | lyres univers 1, LED univers 2 | tout répond comme en USB (refaire D2-D5) |
| A6 Local Network Access | Chrome à jour, page en HTTPS (recette) vers le pont local | aucune demande bloquante, ou procédure écrite |
| A7 Pont tué | arrêter la tâche du pont en pleine partie | gel `hold` ≤ 15 s puis `release`, reprise automatique au redémarrage |

## 5. Résultats

À remplir pendant les essais (date, version de `main`, OK / KO, mesure, lien d'issue).

| Test | Date | Commit | Résultat | Mesure | Issue |
| --- | --- | --- | --- | --- | --- |
| B1 | | | | | |

## 6. Ce que le banc doit trancher

- **Liste de matériel conseillée aux clients** (cartes buzzers, interfaces DMX, relais) : seulement
  ce qui est passé vert ici.
- **Pont Art-Net** : garder Node SEA, le signer, ou le réécrire en Rust (cadrage V1, décision D3).
- **Budget de rendu** (G6) : rester en DOM/CSS ou ajouter du WebGL pour les effets (décision D4).
- **Prix de migration** d'une salle concurrente, sur des coûts mesurés.
