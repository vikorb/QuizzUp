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
| 12b | (option) Machine à fumée **DMX** qui coupe sur perte de signal (ou empruntée) | 1 | seul moyen de tester le chemin « sans relais » (F5) | ~100-200 € |
| 13 | Module **relais DMX 1 canal**, calibre adapté à la télécommande (voir §3.5) | 1 | commande fumée | ~20-40 € |
| 14 | Relais temporisé réglable (≤ 10 s) en **mode intervalle**, même calibre | 1 | coupure matérielle si la page plante | ~10-20 € |
| 15 | Bouton coup-de-poing sur multiprise (arrêt d'urgence) | 1 | coupe fumée + lumières | ~20-30 € |
| 16 | Câbles DMX XLR 3 broches + **bouchon de terminaison 120 Ω** | 4 + 1 | chaîne DMX propre | ~30 € |
| 17 | Adaptateur USB-Ethernet + câble RJ-45 | 1 | 2e carte réseau pour le boîtier Art-Net | ~15-20 € |
| 18 | Vidéoprojecteur ou TV 1080p en HDMI, enceintes | 1 | rendu réel, lisibilité à 3-4 m | déjà dispo ? |

Outils : multimètre, smartphone qui filme en **ralenti 240 i/s** (mesure de latence), un gabarit
qui appuie sur deux boutons à la fois (voir B3), boîtier électrique fermé pour les relais.

Avant tout essai de fumée en intérieur : vérifier le **détecteur incendie** du bâtiment (le couper
ou prévenir selon les règles du lieu) et prévoir une **ventilation**.

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
   - Windows classe cette 2e carte en « réseau non identifié » (profil **Public**) alors que la
     règle pare-feu du kit ne couvre que Privé et Domaine : **forcer le profil Privé** sur cette
     carte.
   - Le modèle 6 pupitres met tout sur l'univers interne 0, que le pont envoie par défaut vers
     l'Art-Net 0.0.0. Il faut **placer les appareils sur les univers 1 et 2** dans l'assistant, ou
     lancer le pont avec un `--map` complet (relais fumée à l'adresse 200 compris). Le kit
     `deploy/poste-salle` ne passe aujourd'hui que `--origin` et `--target` : à adapter.
5. **Fumée** — sécurité, dans cet ordre :
   1. **Mesurer au multimètre** ce que commute le bouton de la télécommande. Sur beaucoup de
      machines grand public il coupe directement le **230 V** : relais DMX et relais temporisé
      doivent alors être au calibre secteur, dans un boîtier fermé.
   2. Câbler le relais DMX en parallèle du bouton (NO / COM), **en série avec le relais
      temporisé** réglé à 10 s, en **mode intervalle** (alimenté par le relais DMX, sans mode
      cycle) : il coupe après 10 s et ne relance pas tant que le relais DMX reste fermé.
   3. Le coup-de-poing coupe l'alimentation de la machine.

## 4. Protocole

Ordre conseillé : B (buzzers) → D (DMX USB) → F (fumée) → G (partie complète) → A (Art-Net). Chaque
test a un critère de réussite, chiffré quand c'est mesurable. Noter le résultat dans le tableau du §5 ; chaque échec devient une issue
GitHub.

### B. Buzzers

| Test | Comment | Critère |
| --- | --- | --- |
| B1 Apprentissage manette | Matériel › Assistant › source **Manette** (`/setup` ne choisit pas la source), puis `/setup` ; BBI-32 puis encodeur « zero delay » | 8 boutons appris, mapping conservé après rechargement et redémarrage du PC |
| B2 Premier appui | brancher la carte, appuyer une fois | l'appui d'activation n'est **pas** compté comme buzz |
| B3 Équité | un seul interrupteur câblé sur **deux entrées** (pupitres 1 et 2) : appuis simultanés par construction, 100 appuis | répartition 40-60 % au pire (rotation à l'égalité) |
| B4 Appuis courts | 100 tapes rapides par bouton | aucune perte pour un appui ≥ 30 ms ; noter le seuil de perte réel |
| B5 Latence | filmer bouton + écran en 240 i/s, 30 mesures | médiane ≤ 80 ms, max ≤ 150 ms entre l'appui et l'affichage |
| B6 Clavier | preset clavier 6 pupitres (AZERTY), puis perte de focus par un clic dans une autre fenêtre ou une notification Windows (en plein écran, Keyboard Lock capte Alt+Tab) | buzzs justes ; l'alerte « réactiver les buzzers » apparaît |
| B7 Deux manettes | 2 manettes branchées, champ « Nom de la carte (facultatif) » de l'assistant rempli (ex. « BBI ») | seule la carte nommée est lue |
| B8 Débranchement | débrancher / rebrancher la carte en pleine question | la partie continue ; après rebranchement, un appui d'activation (non compté) puis les buzzers répondent, sans recharger |

### D. Lumières en USB DMX (chaîne A)

| Test | Comment | Critère |
| --- | --- | --- |
| D1 Détection | `/setup/lights`, Enttec puis clone puis Open DMX | autorisation demandée une seule fois, retrouvée après redémarrage |
| D2 Profils | « Est-ce que ça s'allume ? » appareil par appareil ; comparer avec la notice | ordre des canaux juste, faisceau ouvert (canal strobe / shutter) ; corriger le profil **dans la config**, pas dans le code |
| D3 Roue de couleurs | relever les valeurs sur la notice, régler, vérifier | couleur pupitre correcte sur le spot |
| D4 Calage | calage pan/tilt au clavier, puis import d'un `SessionConf.txt` d'exemple | spot centré sur chaque pupitre à ±10 cm à 3 m |
| D5 Rubans | couleur du pupitre qui buzze | bonne couleur (ordre RGB), bon ruban |
| D6 Coupure USB | débrancher l'interface en pleine partie, rebrancher | le jeu continue ; lumières reprises sans recharger |
| D7 Fluidité | blind test + scènes lumière en continu 10 min | pas de saccade audio ni visuelle ; fréquence d'envoi DMX stable et **0 échec** dans l'onglet Diagnostic (compteur `meteredOutput`) |
| D8 Plafond des éclairs | filmer au ralenti (240 images/s) `buzz`, `victory` et `game-start`, puis deux scènes enchaînées ; refaire pendant un extrait (fond à 0,55) : `answer-wrong` au pupitre 1 puis `buzz` au pupitre 2 environ 200 ms plus tard, avec une lyre qui a une position pour les deux pupitres ; relever dans la notice de chaque appareil les valeurs de ses canaux `shutter` et `fixed` (et `amber` / `uv`) : aucune ne doit tomber dans la plage stroboscope | **3 éclairs par seconde au plus** pour l'œil (plusieurs appareils vus ensemble, un seul plafond pour la salle) ; 400 ms entre deux éclairs (marge sur 334 ms) tenus par de vraies lyres et de vrais PAR, latence d'émission USB et Art-Net comprise ; aucun appareil ne clignote seul, scène arrêtée |
| D9 Retard du plafond | buzzer juste après une mauvaise réponse | le pupitre s'allume en 0,4 s au plus, sans gêner le jeu |
| D10 Clignotement autonome | pour chaque appareil, relever sur la notice la plage stroboscope de ses canaux `shutter` / `fixed` ; la saisir en `strobeRange` ; viser une valeur dedans, puis hors plage ; au Diagnostic, régler un canal `strobe` au maximum | valeur dans la plage : avertissement dans « Points à corriger », l'appareil clignote seul ; hors plage : pas d'avertissement, pas de clignotement ; strobe du Diagnostic : vitesse plafonnée (valeur 30), coupée au bout de 3 s ; mesurer la fréquence réelle à la valeur 30 (≤ 3 par seconde) |

### F. Fumée (sécurité, bloquant)

| Test | Comment | Critère |
| --- | --- | --- |
| F1 Émission | jet de **5 s au plus** commandé depuis l'écran Matériel (pour le distinguer du relais temporisé à 10 s) | durée respectée à ±0,5 s, cooldown respecté |
| F2 Plantage page (A) | tuer le processus Chrome **pendant** un jet, interface USB | le relais temporisé coupe en ≤ 10 s, et la fumée ne repart pas tant que le relais DMX reste fermé |
| F3 Coupure USB (A) | débrancher l'interface pendant un jet | coupure en ≤ 10 s |
| F4 Arrêt d'urgence | bouton logiciel, puis coup-de-poing ; puis réarmer le coup-de-poing alors que le jeu commande encore la fumée | arrêt immédiat ; l'état d'urgence survit au rechargement ; **aucune émission** au réarmement |
| F5 Sans relais | case « coupe sur perte de signal » + test guidé de débranchement | avec la machine 12 : refus tant que le test n'est pas réussi. Avec une machine DMX (12b) : test réussi, puis coupure réelle à la perte de signal |
| F6 Plantage page (B) | tuer Chrome pendant un jet, chaîne Art-Net | le pont passe au noir en ≤ 2,5 s (`SILENCE_TIMEOUT_MS`) |
| F7 Pont ou réseau coupé (B) | tuer le pont, puis débrancher le câble Ethernet, pendant un jet | relais temporisé : coupure en ≤ 10 s, quel que soit le comportement du NET-2/3 |
| F8 Pause pendant un jet | mettre la partie en pause au milieu d'un jet (victoire forcée par une scène de test), puis reprendre ; refaire en lançant la scène victoire juste avant la pause ; pendant la pause, essayer le test de fumée de l'écran Matériel | voyant du relais éteint à la pause, sans attendre la trame suivante (la trame à 0 part tout de suite : mesurer le temps du relais seul) ; aucun jet ne part pendant la pause (scène, test manuel et test de gel refusés, motif « partie en pause ») ; aucun jet ne repart à la reprise ; temps de repos respecté (un tir tout de suite après la reprise est refusé) |

### G. Partie complète

| Test | Comment | Critère |
| --- | --- | --- |
| G1 Partie réelle | partie lancée du backoffice, 2 pupitres physiques | partie jusqu'au podium, scores reçus au backoffice |
| G2 Endurance | 3 parties enchaînées (~3 h) | mémoire de l'onglet stable (Gestionnaire de tâches Chrome), audio sans dérive, aucun gel |
| G3 Mise en page | 6 pupitres (4 en simulation clavier) sur le vrai écran, lu à 4 m | tout lisible, rien de coupé |
| G4 Internet coupé | couper le réseau **5 min** en milieu de partie | la partie finit ; scores envoyés au retour du réseau |
| G5 Veille | cliquer « Lancer la salle », masquer l'onglet puis le réafficher, laisser 30 min | écran toujours allumé, compte de salle connecté. **Bug attendu** : le Wake Lock n'est pris qu'au clic et n'est pas repris au retour de l'onglet (`hardware/screen.ts`) |
| G6 Performance | onglet Performance de Chrome pendant une manche | 60 i/s tenues sur le GPU intégré du PC ; noter le pire écran |

### A. Art-Net (chaîne B)

| Test | Comment | Critère |
| --- | --- | --- |
| A1 Kit poste | `deploy/poste-salle/installer-poste.ps1` (jamais lancé en vrai), 2e carte en profil Privé (§3.4) | pont en tâche SYSTEM au démarrage, règle pare-feu UDP 6454, politiques visibles dans `chrome://policy` |
| A2 Windows Home | même chose sur un PC ou une VM Windows Home | idem, ou limite documentée |
| A3 Exécutable non signé | premier lancement du pont | noter SmartScreen / Smart App Control / antivirus ; décide de la signature (cf. cadrage D3) |
| A4 Découverte | « Chercher les nœuds » dans `/setup/lights`. Avec deux cartes réseau, l'ArtPoll part en 255.255.255.255 : si rien n'est trouvé, relancer le pont avec `--poll-broadcast 192.168.200.255` | le NET-2/3 est trouvé, IP juste |
| A5 Deux univers | appareils placés sur les univers 1 et 2 (§3.4) | tout répond comme en USB (refaire D2-D5) |
| A6 Local Network Access | Chrome à jour, page en HTTPS vers le pont local. **Dépend du lot 9** (recette HTTPS en ligne, VPS pas encore déployé) | aucune demande bloquante, ou procédure écrite |
| A7 Pont tué | arrêter le pont en pleine partie | comportement du NET-2/3 à la perte d'Art-Net **relevé** ; fumée coupée en ≤ 10 s (F7) ; pont relancé par la tâche planifiée en ≤ ~1 min ; écran reconnecté sans recharger |

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
