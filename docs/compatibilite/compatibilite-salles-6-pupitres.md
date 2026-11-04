# Compatibilité QuizzUP avec les salles équipées par le concurrent (I-QUIZ / « Quiz Game »)

> Rapport du 4 novembre 2026. Source : dossier d'installation remis aux centres licenciés
> (procédures d'installation, de configuration DMX et d'exploitation, listes de matériel, plans
> électriques, plans de pupitre). Objectif : qu'un centre déjà équipé puisse jouer à QuizzUP **avec
> le matériel qu'il a déjà**, en navigateur, sans recâbler les pupitres.
>
> Rien de leur logiciel, de leurs questionnaires ni de leurs médias n'est repris : seules les
> valeurs d'installation (touches, adresses DMX, canaux, câblage) servent à la compatibilité.

## 1. En bref

| Élément                          | Leur montage                                                     | Compatible QuizzUP ?                                                                                 |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pupitres                         | 6 pupitres × 4 buzzers lumineux (bleu, jaune, vert, rouge)       | **Oui** : couche matériel passée à 6 pupitres (4 par défaut). Écran de salle et base à suivre.       |
| Carte buzzers                    | Carte USB 32 entrées Leo Bodnar, vue comme une manette           | **Oui, sans rien installer** : lecture directe en manette (API Gamepad, Chrome / Edge).              |
| Conversion manette → clavier     | Logiciel « Sv Mapper » + `mapping.ini` (touches AZERTY)          | **Oui** aussi : preset clavier identique à leur mapping. Mais on recommande de s'en passer.          |
| Lyres (2 wash + 6 spots, 9 can.) | Adresses 1, 10, 19 … 64, calage pan/tilt par pupitre             | **Oui** : preset d'adresses + import de leur calage. Ordre des canaux à vérifier sur la notice.      |
| Rubans LED                       | Décodeur DMX 8 sorties RGB, adresse 128 (sortie n = pupitre n)   | **Oui** : 6 rubans pupitre + ambiance décrits dans le preset.                                        |
| Interface DMX                    | Boîtier **Art-Net** Showtec NET-2/3 Pocket (réseau 192.168.200.x) | **Non depuis un navigateur.** À remplacer par une interface **USB DMX Pro** (~60-130 €).             |
| Machine à fumée                  | Arduino + relais sur la télécommande, **minuterie autonome**     | **À adapter** : débrancher l'Arduino, ajouter un **relais DMX** (~20-40 €) sur la même télécommande. |
| Son                              | Sortie jack du PC → table de mixage → 2 à 4 enceintes            | **Oui**, rien à changer.                                                                             |
| Vidéo                            | Vidéoprojecteur en HDMI                                          | **Oui**, écran de salle en plein écran.                                                              |
| PC de jeu                        | Windows 10, i5, 32 Go, RTX 2060, 2 cartes réseau                 | **Oui**, très largement suffisant pour Chrome / Edge.                                                |
| PC serveur + tablette            | Serveur local XAMPP, tablette de supervision                     | **Remplacés** par notre backoffice en ligne (la tablette ouvre le backoffice dans le navigateur).    |
| Caméras de salle                 | Logiciel caméra séparé                                           | Hors périmètre : elles continuent de fonctionner à côté.                                             |

**Coût de migration par salle : environ 80 à 170 €** (interface USB DMX Pro + relais DMX pour la
fumée), aucun recâblage des pupitres, des lyres ni des rubans LED.

## 2. Inventaire du matériel et des protocoles

### 2.1 Pupitres et buzzers

- **6 pupitres** de 1000 × 420 mm (versions avec porte et PMR), chacun avec **4 buzzers
  lumineux 12 V** : bleu, jaune, vert, rouge. Une équipe peut compter 2 joueurs par pupitre.
- Câblage d'un pupitre (plan 01) : chaque buzzer ferme un contact qui alimente l'entrée d'une
  **carte 4 relais** du pupitre (IN1 = bleu, IN2 = jaune, IN3 = vert, IN4 = rouge). La LED du
  buzzer s'allume pendant l'appui : elle **n'est pas pilotée par le PC**.
- Les contacts secs des relais repartent par un câble RJ-45 par pupitre vers une **carte
  d'interfaçage unique** (plan 02) : Leo Bodnar, 32 entrées, reliée au PC de jeu en USB. Windows la
  voit comme une **manette (joystick HID) à 32 boutons** ; 24 entrées sont utilisées.
- Leur logiciel lit le **clavier** : un utilitaire (« Sv Mapper », fichier `mapping.ini`) convertit
  chaque bouton de la carte en touche. Mapping imposé par leur procédure, dans l'ordre
  bleu / jaune / vert / rouge, en lettres AZERTY :

| Pupitre | Bleu (A) | Jaune (B) | Vert (C) | Rouge (D) | Codes physiques (`KeyboardEvent.code`) |
| ------- | -------- | --------- | -------- | --------- | -------------------------------------- |
| 1       | a        | z         | e        | r         | KeyQ KeyW KeyE KeyR                    |
| 2       | t        | y         | u        | i         | KeyT KeyY KeyU KeyI                    |
| 3       | q        | s         | d        | f         | KeyA KeyS KeyD KeyF                    |
| 4       | g        | h         | j        | k         | KeyG KeyH KeyJ KeyK                    |
| 5       | w        | x         | c        | v         | KeyZ KeyX KeyC KeyV                    |
| 6       | b        | n         | l        | m         | KeyB KeyN KeyL Semicolon               |

### 2.2 Lumières (DMX)

- **Interface** : Showtec NET-2/3 Pocket, boîtier **Art-Net** (entrée RJ-45, 2 sorties DMX).
  Réseau dédié : PC en **192.168.200.1/24** (obligatoire), boîtier en **192.168.200.187/24**.
  Sorties en Art-Net, 40 Hz, Net 000, Primary 001 (sortie 1 = lyres) et 002 (sortie 2 = LED).
  D'où la deuxième carte réseau du PC de jeu.
- **8 lyres en mode 9 canaux** (« CH9 » dans le menu de chaque lyre), chaînées en XLR :

| Adresse | Appareil                                | Rôle                         |
| ------- | --------------------------------------- | ---------------------------- |
| 001     | Lyre wash 1, au pied des pupitres, droite | ambiance, côtés de l'écran |
| 010     | Lyre spot vers le pupitre 6             | spot pupitre 6               |
| 019     | Lyre spot vers le pupitre 5             | spot pupitre 5               |
| 028     | Lyre spot vers le pupitre 4             | spot pupitre 4               |
| 037     | Lyre spot vers le pupitre 3             | spot pupitre 3               |
| 046     | Lyre spot vers le pupitre 2             | spot pupitre 2               |
| 055     | Lyre spot vers le pupitre 1             | spot pupitre 1               |
| 064     | Lyre wash 2, au pied des pupitres, gauche | ambiance, côtés de l'écran |

  Les spots sont fixés au mur de l'écran (écran LCD en bas, câbles en haut), les wash au sol.
- **Calage** : la position de chaque lyre est réglée dans leur jeu puis recopiée dans
  `C:\Iquiz\Quiz\SessionConf.txt`, lignes `Pupitre1` à `Pupitre6` et `Head1` / `Head2` au format
  `Pupitre1:150-77;` (pan-tilt sur 0-255).
- **Rubans LED** : décodeur DMX512 8 sorties RGB (plan 04) sur la sortie 2, adresse **128**
  (DIP-switch 8 baissé). Sorties 1 à 6 = rubans des pupitres 1 à 6, sortie 7 = ruban d'ambiance
  (arrière), sortie 8 libre. Alimentation 12/24 V séparée.

### 2.3 Machine à fumée

- Machine à fumée grand public avec télécommande filaire. Un **Arduino** commande un **relais
  5 V** (broche A0) câblé en parallèle du bouton de la télécommande (contacts NO / COM).
- Le programme de l'Arduino est une **minuterie autonome** : 5 min d'attente à la mise sous
  tension, 15 s de fumée, puis **1 s toutes les 2 min**, sans aucun lien avec le jeu.
- La machine et l'Arduino sont alimentés avec les lyres : « allumer les robots lumière lance la
  fumée ». Le personnel ajoute de la fumée à la main avec le bouton de la télécommande.

### 2.4 Son, vidéo, réseau, informatique

- Son : sortie jack du PC → table de mixage the t.mix xmix 802 USB → 2 à 4 enceintes
  dB Technologies B-Hype 10 (XLR / jack 6,35).
- Vidéo : vidéoprojecteur en HDMI.
- PC de jeu : Windows 10 minimum, i5-10xxx, 32 Go, SSD 500 Go, RTX 2060 (leur jeu est sous
  Unreal Engine 4), 2 × Ethernet. Connexion internet obligatoire (licence).
- Multi-salles : un PC serveur local (XAMPP) et une tablette de supervision par site.
- 2 caméras par salle, avec leur propre logiciel.

## 3. Ce que QuizzUP apporte pour ces salles (PR « setup 6 pupitres »)

Dans `game/hardware` (`@quizzup/hardware`) :

1. **6 pupitres** : `DESKS` va de 1 à 6, `DEFAULT_DESKS` reste à 4 pour une salle neuve. Couleurs
   des pupitres 5 et 6 ajoutées. Les configurations existantes ne changent pas.
2. **Buzzers en manette** (`createGamepadBuzzerInput`) : lit directement la carte 32 entrées avec
   l'API Gamepad de Chrome / Edge. Plus besoin de leur utilitaire de conversion, pas de souci de
   focus clavier. Codes `GamepadButton0` … `GamepadButton31`, compatibles avec l'apprentissage
   existant (24 appuis, environ une minute).
3. **Preset clavier** (`createSixDeskKeyboardKeymap`) : reprend exactement leur mapping AZERTY.
   Utile pour un test immédiat si l'utilitaire de conversion tourne encore sur le PC.
4. **Preset lumières** (`createSixDeskRoomRig`) : les 8 lyres, les 6 rubans pupitre et le ruban
   d'ambiance aux adresses d'origine, sur **un seul univers** (lyres 1-72, LED 128-148). Chaque spot
   est rattaché à son pupitre : « spot sur le pupitre qui a buzzé » fonctionne directement.
   Fumée optionnelle sur relais DMX (`smokeRelayAddress`).
5. **Import du calage** (`parsePanTiltCalibration`) : relit les lignes `PupitreN:pan-tilt;` et
   `HeadN:pan-tilt;` de leur fichier de configuration et les convertit en positions QuizzUP. Le
   centre n'a pas à refaire le calage des lyres.
6. **Profils de lyres 9 canaux** (`SIX_DESK_PROFILES`) : spot (pan, tilt, roue de couleurs, gobo,
   strobe, gradateur, vitesse, auto, reset) et wash RGBW (pan, tilt, gradateur, R, G, B, W, strobe,
   vitesse). Disposition la plus courante pour ces modèles génériques, **à confirmer sur la notice**.

## 4. Procédure de migration d'une salle (proposée)

1. **Acheter** une interface **DMX USB Pro** (Enttec ou clone compatible, ~60-130 €) et un
   **module relais DMX 1 canal** (~20-40 €).
2. **DMX** : débrancher le boîtier Art-Net. Brancher l'interface USB sur le PC de jeu, sa sortie XLR
   sur l'**entrée DMX du décodeur LED**, et la **sortie DMX du décodeur** sur le câble qui partait
   vers la première lyre. Lyres et LED gardent leurs adresses. La deuxième carte réseau et
   l'adresse 192.168.200.1 ne servent plus.
3. **Fumée** : débrancher l'Arduino (sa minuterie enverrait de la fumée toutes les 2 minutes, hors
   de tout contrôle du jeu). Câbler le relais DMX sur les mêmes contacts NO / COM de la
   télécommande, l'adresser (par exemple 200) et le chaîner en bout de ligne DMX.
   **Obligatoire** : une **limite de durée matérielle**. Une interface USB DMX Pro renvoie sans fin
   la dernière trame reçue : si le PC ou la page plante pendant une émission, le relais reste
   fermé. Mettre en série un **relais temporisé** (module « monostable », ~10 €, réglé à 10 s
   maximum) ou choisir un relais DMX qui retombe en cas de perte de signal.
4. **Arrêt d'urgence physique** : vérifier qu'un interrupteur coupe l'alimentation de la fumée et des
   lumières (déjà le cas si « éteindre les robots lumière » coupe aussi la fumée) ; il est
   **obligatoire** avec QuizzUP.
5. **PC de jeu** : installer Chrome ou Edge, ouvrir l'écran de salle QuizzUP, se connecter avec le
   compte de salle. Désinstaller ou ne plus lancer leur jeu et leur utilitaire de conversion (leur
   licence, pas la nôtre).
6. **Configuration de salle** : choisir le preset « salle 6 pupitres », coller le contenu de
   `SessionConf.txt` pour reprendre le calage, choisir la sortie `usbpro`, puis **apprendre les
   buzzers en mode manette** (24 appuis) et faire le test des buzzers. Si une autre manette est
   branchée sur le PC, la débrancher pendant l'apprentissage : le filtrage par nom de carte
   (option `match` du code, par exemple « BBI » ou « Bodnar ») n'est pas encore proposé dans
   l'écran de configuration (suivi). Le navigateur ne voit la carte qu'après un premier appui : cet appui active la
   carte et ne compte pas comme buzz.
7. **Vérifications sur place** : couleurs et mouvements de chaque lyre (ordre des canaux), faisceau
   bien ouvert (sinon remplacer le canal strobe par une valeur fixe « ouvert » de la notice), sens
   des couleurs des rubans (RGB), fumée armée par l'opérateur puis test d'émission courte, coupure
   par le relais temporisé.

## 5. Points à vérifier ou à décider

1. **Ordre des canaux des lyres** : les modèles achetés sur Amazon sont génériques ; la notice de
   chaque modèle fait foi. Si l'ordre diffère, on corrige le profil dans la config de salle (aucun
   code à changer). Point d'attention : sur certains modèles, la valeur 0 du canal strobe **ferme**
   le faisceau ; il faudra alors un canal `fixed` à la bonne valeur.
2. **Spots à roue de couleurs** : la couleur du pupitre passe par les rubans LED, les spots restent
   blancs. Un rôle « roue de couleurs » pourrait être ajouté plus tard.
3. **Ordre des entrées de la carte buzzers** : inconnu (il dépend du câblage RJ-45). D'où
   l'apprentissage ; ensuite le mapping est enregistré dans la salle.
4. **Précision des buzzs en manette** : lecture toutes les 4 ms et horodatage de la carte. Deux
   appuis vus dans la même lecture ont le même horodatage ; le moteur garde le premier reçu, et
   l'ordre d'émission tourne à chaque égalité pour qu'aucun pupitre ne soit favorisé. Si la page
   est occupée (rendu, démarrage audio), une lecture peut regrouper plusieurs dizaines de ms. Un
   appui plus court que l'intervalle réel entre deux lectures est perdu (limite de l'API Gamepad).
   Le mode clavier reste disponible.
5. **Produit à 6 pupitres** (décision demandée à Enzo) : seule la couche matériel accepte 6
   pupitres pour l'instant. Doivent suivre : `GAME_PODIUMS = 4` dans `@quizzup/shared` (le moteur
   refuse les pupitres 5 et 6), l'écran de salle (`game/room-app`, lobby à 4 pupitres) et la base
   (`game_participants`, pupitre 1-4).
6. **Équipes de 2 joueurs par pupitre** : le concurrent l'autorise (prénom + e-mail de chaque
   joueur). À prévoir dans le lobby si on vise ces centres.
7. **Inscription par QR code depuis un smartphone** et **feuille de résultats imprimable** : ce sont
   des habitudes de leurs centres, absentes de QuizzUP V1.
8. **Délai de sortie** : leur jeu garde lumières et LED allumées ~3 min après la fin pour faire
   sortir les joueurs. Notre scène de fin peut faire de même (réglage à ajouter côté écran de salle).
9. **Art-Net plus tard** : un pont local optionnel permettrait de garder leur boîtier Art-Net (univers
   1 = lyres, 2 = LED) pour les centres qui ne veulent rien acheter.
10. **Juridique** : le matériel appartient au centre (acheté chez des revendeurs grand public),
    mais il faut vérifier le **contrat de licence du centre** avec le concurrent (durée, exclusivité,
    préavis, annexe 4 sur le matériel) avant toute migration commerciale.

## 6. Ce qui n'a pas été fait volontairement

- Aucun fichier de leur logiciel, aucun questionnaire, média, logo, visuel ou texte marketing n'a
  été copié dans le dépôt QuizzUP. Le programme de l'Arduino a seulement été lu pour comprendre le
  comportement de la fumée.
- Aucune protection, licence ou clé n'a été analysée ni contournée : QuizzUP remplace leur logiciel,
  il ne s'y branche pas.
