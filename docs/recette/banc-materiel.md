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
| D10 Clignotement autonome | pour chaque appareil, relever sur la notice la plage stroboscope de ses canaux `shutter` / `fixed` ; la saisir en `strobeRange` ; viser une valeur dedans, puis hors plage ; au Diagnostic, saisir le canal du stroboscope et pousser le curseur au maximum | valeur dans la plage : avertissement dans « Points à corriger », l'appareil clignote seul ; hors plage : pas d'avertissement, pas de clignotement ; strobe du Diagnostic : valeur émise 30 (et non 255), coupure à 3 s (retour à 0) ; mesurer la fréquence réelle à la valeur 30 (≤ 3 par seconde) |
| D11 Éclairs d'une scène de salle | scène `lighting.scenes` avec un éclair très court demandé (par exemple 10 ms allumé, 10 ms éteint), puis une scène enchaînée par `next` ; **deux couleurs vives à même niveau** : scène `a` = rouge 100 ms, `next: b`, scène `b` = bleu 100 ms, `next: a` (boucle) sur un PAR et sur un ruban LED ; filmer au ralenti (240 images/s) | les valeurs demandées sont ramenées à des phases d'au moins 60 ms et à une période d'au moins 400 ms (`MIN_FLASH_INTERVAL_MS`), l'éclair reste lisible à 3-4 m, jamais plus de 3 éclairs par seconde, et une scène qui s'enchaîne sans fin ne produit aucun clignotement hors limite ; la boucle rouge / bleu ne change de couleur qu'une fois par 400 ms au plus (un changement de couleur à même niveau compte comme un éclair) |
| D12 Lumière de sortie | partie jusqu'à la victoire, avec les réglages par défaut (10 s, 5 min), un stroboscope et la fumée armés ; mesurer le délai à partir de la fin de la scène de victoire ; lire depuis la porte ; refaire avec une partie arrêtée faute de contenu, puis lancer une nouvelle partie pendant l'attente, puis pendant le maintien ; refaire avec `lighting.exit.enabled` à faux ; appuyer sur l'arrêt d'urgence pendant la sortie, puis réarmer | allumage en blanc chaud, lyres au repos, après le délai réglé ; lisible depuis la porte (régler `intensity` et `color` dans la config, pas dans le code) ; **stroboscope éteint et aucun jet de fumée** pendant toute la sortie ; fondu de 3 s sans éclair gênant ; la partie suivante la remplace aussitôt, sans extinction ni reprise ; `enabled` à faux : rien ne s'allume tout seul ; arrêt d'urgence : noir immédiat, et au réarmement ni sortie ni fumée |

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
| F9 Preuve locale du test de coupure | (1) salle déjà configurée avec la fumée activée, ouvrir l'écran de salle sur un **autre navigateur ou profil Chrome** (ou après avoir vidé les données du site) ; lancer une partie jusqu'à la victoire ; essayer « Tester une scène » et le test de coupure du Diagnostic. (2) Refaire le test de coupure de l'assistant (étape « Sécuriser la fumée »), répondre « Elle s'est arrêtée », enregistrer ; relancer une victoire. (3) Changer la durée maximale ou l'adresse de la machine, enregistrer, recharger | (1) message « test de coupure à refaire sur ce poste » dans Matériel, onglet « Lumières et fumée » ; **aucune fumée** (voyant du relais éteint, aussi à la victoire) ; le Diagnostic refuse son test. (2) fumée armable et jet à la victoire. (3) message de retour, aucune fumée tant que le test n'est pas refait |
| F10 Fumée dans une scène enchaînée | scène de salle dont un pas de fumée suit un autre pas via `next`, fumée armée ; jet à l'heure ; puis geler la page (point d'arrêt ou onglet bloqué) plus de 0,5 s avant le pas de fumée, la rendre | jet à l'heure, durée et repos respectés ; après le gel, **aucun jet tardif** ; pause, page cachée ou arrêt d'urgence : aucun jet ; tuer Chrome pendant le jet : le relais temporisé coupe en ≤ 10 s (comme F2) |
| F11 Carte USB : mise sous tension | carte Uno de la salle et module relais, **machine à fumée éteinte**, alimentés par l'USB du PC seul (bloc secteur d'origine débranché), navigateur fermé ; multimètre sur A0 (référence GND) et œil sur le voyant du relais ; brancher l'USB et suivre pendant 3 s (la seconde du chargeur comprise) | A0 sous 0,8 V et relais éteint **sans interruption**, du branchement à la fin du démarrage ; noter la tension lue |
| F12 Carte USB : ouverture du port | carte déjà alimentée, ouvrir le port depuis l'écran Matériel (ou un terminal série à 9600 bauds) ; mesurer A0 et le relais pendant et après l'ouverture ; relever si l'ouverture remet la carte à zéro (supposé : signal DTR) ; envoyer `H` toutes les 500 ms et lire les réponses | A0 sous 0,8 V et relais éteint pendant et après l'ouverture ; bannière `QZF READY 1 1.0.0 10000 5000 500` reçue en 3 s au plus ; réponses `S 0 COOL CMD` pendant 5 s après la bannière, puis `S 0 READY CMD` ; si l'ouverture ne remet pas la carte à zéro, le noter (la page attend alors une bannière qui ne vient pas) |
| F13 Carte USB : bouton RESET | carte prête, relais éteint, appuyer sur RESET ; mesurer A0 et le relais pendant l'appui et la seconde qui suit ; l'écran Matériel étant ouvert | A0 sous 0,8 V et relais éteint de bout en bout ; nouvelle bannière reçue puis `COOL` pendant 5 s ; la page traite la bannière inattendue comme une perte de lien (fumée désarmée) |
| F14 Carte USB : pendant une installation | installer le programme depuis l'écran Matériel (sauvegarde, écriture, relecture), machine éteinte ; suivre A0 et le relais pendant toute l'installation (une dizaine de secondes), puis recommencer une installation interrompue (RESET à la main) | A0 sous 0,8 V et relais éteint pendant toute l'installation, y compris l'échec et la reprise ; si le relais colle, même un instant : arrêter, c'est le cas de la résistance de rappel (conception, §9 question 3) |
| F15 Carte USB : alimentation USB seule, câble long | carte et relais alimentés par l'USB seul, avec le câble le plus long prévu (5 m) ; **machine éteinte** ; multimètre sur le 5 V de la carte ; 10 jets de 2 s commandés depuis l'écran Matériel (pause de 5 s respectée) ; refaire derrière un concentrateur USB si la salle en a un | le 5 V reste au-dessus de 4,5 V (valeur de départ, à confirmer sur la fiche du composant) quand le relais colle ; aucune remise à zéro de la carte (aucune nouvelle bannière) ; sinon relever la tension minimale et ne pas alimenter le relais par ce câble |
| F16 Carte USB : remise à zéro en plein jet | jet en cours, la page (ou un terminal qui répète `F` toutes les 100 ms) **continue d'envoyer `F`** ; appuyer sur RESET ; mesurer le relais, puis relever pendant 10 s les réponses `S` et le relais | relais retombé à l'appui de RESET ; **aucun jet avant 5 s**, et aucun jet tant que le flot de `F` dure (verrou) ; un jet repart seulement après 500 ms de silence ou une ligne `0` ; la page ne relance rien toute seule |
| F17 Carte USB : navigateur tué pendant un jet | jet en cours, tuer le processus Chrome (Gestionnaire des tâches), relais filmé au ralenti (240 images/s) avec l'horloge du PC ou un second témoin ; sans relais temporisé | relais coupé en **moins de 0,5 s** (bail de 500 ms) après la mort du processus ; aucune reprise toute seule |
| F18 Carte USB : USB débranché, rechargement, reconnexion | trois essais pendant un jet : (a) débrancher l'USB ; (b) recharger la page (F5) ; (c) rebrancher la carte et laisser la page la reprendre | (a) relais coupé en 0,5 s au plus ; la page signale la carte perdue et la fumée est désarmée ; (b) relais coupé en 0,5 s au plus, la carte redémarre (pause de 5 s) ; (c) bannière reçue, carte prête mais **fumée désarmée** tant que l'opérateur ne réarme pas ; aucun jet tout seul |
| F19 Carte USB : avec le DMX USB, pilote et identifiant | carte fumée et interface DMX USB branchées ensemble ; recharger la page plusieurs fois, redémarrer le PC ; relever dans le Gestionnaire de périphériques le pilote de la carte (série USB, CH340…) et son identifiant USB (fabricant, produit) | chaque port retrouvé sur le bon appareil, la carte fumée jamais prise pour la sortie DMX ; lumières et fumée ensemble sans perte ; pilote installé sans droits d'administrateur (sinon : exception à faire valider, conception §9 question 4) ; identifiants relevés dans les résultats |
| F20 Carte USB : sauvegarde, restauration, télécommande réelle | (1) télécharger la sauvegarde du programme d'origine, installer le programme QuizzUp ; (2) machine à fumée réelle en parallèle du bouton de sa télécommande : jet commandé depuis l'écran Matériel, puis bouton de la télécommande à la main ; (3) restaurer la sauvegarde | (1) sauvegarde téléchargée avant toute écriture ; (2) la machine émet pendant le jet (durée à ±0,5 s, pause respectée) et la télécommande à la main marche toujours ; (3) l'ancien comportement est revenu (minuterie d'origine), la page ne voit plus de bannière `QZF` |
| F21 Export et import d'une configuration | salle du banc avec la fumée armée et un jet de 2 s ; Matériel, onglet « Configuration avancée » : exporter la config (fonctions prêtes, boutons au lot RA9 ; sinon `exportConfig` depuis la console), l'importer sur un autre PC puis sur le même ; à chaque fois, tenter de réactiver la fumée en éditant le JSON (`enabled` à vrai, jet à 9 s, pause à 5 s, `requireConfirmation` à faux) | après l'import : fumée **désactivée**, aucun jet possible tant que l'assistant (test de coupure compris) n'a pas été refait ; sur la même salle, durée, pause, niveau et confirmation jamais plus permissifs qu'avant ; l'édition du JSON ne réactive ni n'allonge rien ; le relais reste éteint pendant toute la manipulation ; limite connue : le niveau maximal ne peut que baisser par le JSON et aucun écran ne le remonte (lot à part) |
| F27 Boutons Exporter et Importer | salle du banc avec la fumée armée et un jet de 2 s ; Matériel, onglet « Configuration avancée » : cliquer « Exporter », vérifier le fichier téléchargé (nom sans compagnie), puis « Importer » avec ce fichier, avec un fichier modifié à la main (fumée active, jet à 9 s, pause à 5 s, niveau 255), avec un fichier de plus de 64 Ko, une image et un JSON invalide | le nom du fichier ne contient ni compagnie ni compte ; l'import demande confirmation et résume pupitres, appareils, pilote et univers ; fumée **désactivée** après l'import, jamais plus permissive que celle de la salle ; les trois fichiers invalides sont refusés avec un message, rien n'est appliqué ; l'assistant, le test de coupure et l'armement restent à refaire (jamais marqués faits) ; relais éteint pendant toute la manipulation ; **à valider sur le banc** |

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
| A8 Relais PowerShell | `game/artnet-bridge/powershell/quizzup-lumieres.ps1` (jamais essayé sur un vrai nœud, seulement contre un récepteur UDP local) lancé sur le PC de la salle avec `-Target`, sans droits administrateur. Il n'a ni découverte des nœuds (A4), ni tâche planifiée (A7), ni gel de la sortie : pas de F6 par Art-Net, la coupure de la fumée reste à tester avec l'interface USB. À faire : (1) deux puis quatre univers à pleine cadence (A5, partie réelle avec stroboscope), l'écran affiche « pont trop ancien » pour le test de coupure, c'est attendu ; (2) tuer Chrome en pleine partie ; (3) `Ctrl+C` dans la fenêtre ; (4) **fermer la fenêtre (croix) pendant un stroboscope** ; (5) PC verrouillé (AppLocker, mode de langage restreint) : lancer le script | le NET-2/3 reçoit les mêmes trames qu'avec le pont exe, sans retard qui grossit (mesure : relevé du retard, cible < 100 ms) ; (2) noir en ≤ 2,5 s ; (3) noir immédiat ; (4) **noir en moins d'une seconde, stroboscope compris** (trois passes de trames à zéro sur les univers déjà utilisés) ; (5) si la compilation du gestionnaire de fermeture est refusée, le script le dit en jaune au démarrage et continue : noter si l'avertissement apparaît **relevé** |

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
