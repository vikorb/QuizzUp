# Fumée pilotée par la carte existante, en USB : conception

Issue #215. Écrite à partir du code de `main` du 24 novembre 2026. **Rien n'a été essayé sur une
vraie carte** : ce qui est marqué « supposé » reste à voir sur le banc (§7).

## 1. Besoin et contraintes

Dans les salles déjà équipées, la machine à fumée est commandée par une carte compatible Arduino
Uno R3 (ATmega328P, prise USB-B) et un module relais 5 V. L'entrée du relais est sur la broche A0,
ses contacts sont en parallèle du bouton de la télécommande filaire : A0 au niveau haut = fumée.
Aujourd'hui la carte tourne seule, sur une minuterie, alimentée par un bloc secteur, sans lien avec
le jeu.

Contraintes fixées :

- rien n'est acheté et rien n'est installé sur le PC de la salle, qui n'affiche qu'une page de
  navigateur (Chrome ou Edge) ;
- les sécurités fumée du projet restent la règle (`.claude/rules/materiel.md`) : plafond de durée,
  pause entre deux jets, arrêt d'urgence, fumée coupée à la pause, test de coupure avant d'armer ;
- le programme d'origine de la carte n'entre pas dans le dépôt. Le nouveau est écrit de zéro.

## 2. Recommandation

- **Programme de la carte.** La carte n'envoie de la fumée que tant que la page lui redit de le
  faire : un ordre toutes les 100 ms, valable 500 ms. Le plafond d'un jet (10 s), la pause entre
  deux jets (5 s) et un chien de garde matériel (250 ms) sont compilés dans la carte ; la page ne
  peut pas les changer.
- **Installation.** Le programme s'installe depuis l'écran Matériel, par Web Serial, avec un petit
  client STK500v1 écrit pour le chargeur Optiboot du Uno. Le fichier `.hex` est compilé par la CI
  et versionné. Avant toute écriture, la page lit le programme en place sur la carte et le fait
  télécharger : c'est le retour arrière.
- **Intégration.** Le lien vers la carte est un récepteur de plus du `LightingController`. Pause,
  onglet masqué, arrêt d'urgence, chien de garde et test de coupure s'appliquent donc sans rien
  dupliquer.

## 3. Programme de la carte

### Protocole

Texte ASCII, une ligne par message terminée par `\n`, 9600 bauds 8N1. À ce débit, ce que la page
envoie pendant la seconde où le chargeur écoute (à 115200 bauds) n'arrive que comme erreurs de
trame, jamais comme une commande du chargeur.

| Sens         | Message                                               | Sens du message                                                    |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| carte → page | `QZF READY 1 1.0.0 10000 5000 500`                    | au démarrage : protocole, version, plafond, pause, bail (ms)       |
| page → carte | `F`                                                   | fumée pendant la durée du bail                                     |
| page → carte | `0`                                                   | coupure                                                            |
| page → carte | `H`                                                   | présence, sans effet sur la fumée                                  |
| carte → page | `S <0\|1> <READY\|FIRE\|COOL> <LEASE\|MAX\|CMD\|BAD>` | après chaque ligne reçue : sortie, état, dernière cause de coupure |

Pas de somme de contrôle : l'USB porte déjà la sienne. Seule la ligne exacte `F` allume ; toute
autre ligne, y compris une ligne illisible, coupe.

### Sécurités portées par la carte

- A0 est au niveau haut seulement si trois conditions sont vraies : dernier `F` reçu il y a moins
  de 500 ms, jet commencé il y a moins de 10 s, au moins 5 s depuis la fin du jet précédent.
- Les durées se comparent par soustraction non signée de `millis()`, pour survivre au débordement
  du compteur (49 jours).
- La première instruction du programme met A0 au niveau bas.
- Chien de garde matériel : `wdt_enable(WDTO_250MS)`, relancé seulement dans la boucle principale.
- Pas de verrou d'urgence dans la carte : l'arrêt d'urgence vit dans la page (il survit au
  rechargement) et le coup-de-poing de la salle coupe l'alimentation.

La logique est écrite en C pur (`fumee_logic.c`), sans dépendance à Arduino, pour être compilée et
testée par gcc dans la CI avec les mêmes vecteurs de test que la fausse carte TypeScript.

### Remise à zéro à l'ouverture du port

Sur un Uno, ouvrir le port série remet normalement la carte à zéro par le signal DTR (supposé : la
norme Web Serial ne fixe pas l'état des signaux à l'ouverture). La page s'appuie dessus : elle
attend la bannière `QZF READY` (3 s au plus) avant tout envoi. Recharger la page remet donc la
carte à zéro, relais retombé. Pour l'installation, la page force elle-même l'impulsion avec
`setSignals({ dataTerminalReady })`.

### A0 pendant le chargeur

Après une remise à zéro, les broches sont des entrées en haute impédance ; Optiboot ne touche qu'à
la LED et à la liaison série. Après une remise à zéro par le chien de garde, il lance directement
le programme. A0 flotte donc environ une seconde à chaque remise à zéro, et pendant toute une
installation (une dizaine de secondes). Ce flottement est aussi le dernier filet : carte figée →
chien de garde → broches en entrée → relais retombé. Cela ne tient que si le module relais reste
ouvert quand son entrée est en l'air : **à vérifier sur le banc**, avant tout essai avec la machine
branchée.

## 4. Installation du programme

**Retenu : depuis la page.** Réglages du Uno dans le cœur Arduino AVR : protocole STK500v1,
115200 bauds, 32 256 octets au plus. Sous-ensemble utilisé : synchronisation, lecture de la
signature (elle doit valoir `1E 95 0F`, sinon arrêt), adresse, écriture et relecture par pages de
128 octets, sortie du mode de programmation. La zone du chargeur est protégée par les bits de
verrouillage du Uno : une installation ratée se recommence, la carte ne peut pas être perdue.

Le `.hex` : un job de la CI lance `arduino-cli` avec le cœur `arduino:avr` épinglé, recompile et
échoue si le résultat diffère du fichier versionné. L'écran de salle importe le fichier comme
texte ; son build ne dépend pas d'`arduino-cli`.

Testable sans carte : un émulateur d'Optiboot en TypeScript (faux port série avec une mémoire
flash).

**Écarté comme voie principale : installer une fois depuis un autre poste.** Il faut un PC équipé
de l'IDE Arduino, chaque nouvelle salle recommence et il n'y a pas de mise à jour. Gardé en
secours.

**Écarté : une bibliothèque de téléversement existante.** Celle qui existe ne gère Web Serial
qu'en version « alpha » ; notre client fait environ 200 lignes et se teste contre l'émulateur.

Risques :

- carte à puce USB CH340 : il faut le pilote du fabricant, en général poussé par Windows Update
  (supposé). Sinon c'est une installation, donc une exception à faire valider ;
- carte à puce 16U2 : pilote série natif de Windows 10 et 11, rien à faire ;
- ancien chargeur à 57600 bauds : la page réessaie une fois à ce débit ;
- l'identifiant de fabricant `2A03` (cartes Arduino d'une époque) manque à la politique Chrome du
  guide d'installation et à `DMX_USB_VENDOR_IDS`.

Retour arrière : le bouton « Restaurer » réécrit un `.hex` choisi, en pratique la sauvegarde
téléchargée avant l'installation.

## 5. Intégration dans `game/hardware`

**Retenu : une option `smokeLink` de `createLightingController`.**

- Dans l'envoi d'une trame : `smokeLink.drive(état de la fumée === 'firing')`. Le lien ne
  renouvelle jamais l'ordre `F` de lui-même.
- `pagehide`, `stop` et `emergencyStop` appellent `drive(false)`.
- Pendant le test de gel, aucune trame ne part, donc aucun `F` : la carte coupe à la fin du bail.
  C'est exactement le test de coupure voulu.
- Lien perdu (carte débranchée, muette depuis 1 s, ou sans bannière) : `smoke.stop('output_error')`
  puis fumée désarmée. `fireSmoke` refuse avec `board_unavailable` tant que le lien configuré
  n'est pas prêt.
- Si un relais DMX est aussi câblé, il reçoit le même ordre.

Écartés : la carte vue comme une sortie DMX (il faudrait un faux appareil dans la configuration, et
la sortie est déjà prise par les lumières) ; un contrôleur de fumée à part (sécurités en double).

**Défaut à corriger dans le même lot.** Après un rechargement, le choix du port DMX USB sans
critère prend le premier port d'un fabricant connu ; les fabricants des cartes Uno en font partie,
donc la sortie DMX USB peut prendre la carte fumée. Le port fumée et son identifiant sont exclus.

Choix du port fumée : au démarrage, les ports déjà autorisés, filtrés par l'identifiant USB
enregistré, confirmés par la bannière. Quand la carte est rebranchée : réouverture, bannière, fumée
prête mais désarmée.

`rooms.config` gagne un champ facultatif `lighting.smoke.board` :
`{ kind: 'uno-serial', usbVendorId, usbProductId }`. La version du programme est lue sur la carte,
pas stockée. Aucune table, aucune route.

## 6. Écran Matériel, section Fumée

1. « Choisir la carte de la fumée » (fabricants `2341`, `2A03`, `1A86`). Liste vide : vérifier le
   câble USB et le pilote.
2. Détection par la bannière : « Prête (programme 1.0.0) », « Programme à mettre à jour » ou
   « Programme QuizzUp absent ».
3. « Installer le programme » : case obligatoire « machine à fumée éteinte » (l'ancien programme
   déclenche la fumée tout seul dès que la carte est sous tension), sauvegarde téléchargée, barre
   de progression, relecture. Erreurs : pas de synchronisation (« appuyez sur RESET au départ de la
   barre »), mauvaise signature (« ce n'est pas un Uno »), port occupé (« fermez l'autre onglet »).
4. Test de coupure existant, avec un texte propre à la carte : elle doit couper en moins d'une
   seconde. La personne confirme ce qu'elle voit.
5. État permanent : prête, débranchée, muette, à mettre à jour.

## 7. Tests et banc

- Unitaires : protocole (lecture, écriture, lignes invalides), rythme de `drive`, silence de la
  carte, intégration au contrôleur avec une fausse carte (urgence, pause, onglet masqué, gel, chien
  de garde), format Intel HEX, client STK500v1 contre l'émulateur (nominal, pas de
  synchronisation, mauvaise signature, relecture fausse, débranchement en cours).
- Logique en C : vecteurs partagés, exécutés par gcc et par la fausse carte TypeScript.
- Playwright : un scénario avec un `navigator.serial` simulé (choix, installation, carte prête,
  test de coupure).
- **Seulement sur la vraie carte** (cas F11 à F20 du banc) : A0 sous 0,8 V et relais éteint à la
  mise sous tension, à l'ouverture du port, au bouton RESET et pendant une installation ;
  ouverture du port qui remet à zéro ; navigateur tué pendant un jet (coupure en moins de 0,5 s) ;
  USB débranché ; rechargement pendant un jet ; reconnexion ; carte et DMX USB ensemble ;
  sauvegarde puis restauration (ancien comportement revenu) ; pilote Windows et identifiant USB
  relevés ; déclenchement réel de la télécommande.

## 8. Lots

| Lot  | Taille | Contenu                                                                                                            | Dépend de  | Critère de fin                                             |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| L0   | S      | cette conception, cas F11 à F20 dans `docs/recette/banc-materiel.md`                                               | —          | cas listés                                                 |
| L1   | M      | `game/hardware/firmware/fumee/` : `.ino`, `fumee_logic.c/.h`, tests gcc, `.hex` versionné, job `arduino-cli` en CI | L0         | CI verte, `.hex` identique à la recompilation              |
| L2   | M      | `game/hardware/src/smoke/boardProtocol.ts`, `boardLink.ts`, fausse carte, vecteurs partagés                        | L0         | seuils de couverture, mêmes vecteurs que L1                |
| L3   | M      | `lightingController.ts` (option `smokeLink`, refus `board_unavailable`), `config.ts`, exclusion du port, `2A03`    | L2         | urgence, pause, gel et masquage testés avec le lien        |
| L4   | M      | `game/hardware/src/firmware/intelHex.ts`, `stk500.ts`, émulateur Optiboot, lecture de sauvegarde                   | —          | installation, relecture et restauration contre l'émulateur |
| L5   | L      | `roomHardware.ts` (port fumée, reconnexion), section Fumée de l'écran Matériel, i18n, scénario e2e                 | L1, L3, L4 | parcours complet en simulation                             |
| L6   | S      | guides (installation, sécurité fumée, dépannage), politique Chrome, compatibilité, `REPRISE.md`                    | L5         | documentation à jour                                       |
| Banc | —      | cas F11 à F20                                                                                                      | L5         | tous les cas passés sur la vraie carte                     |

L1, L2 et L4 avancent en parallèle. Chaque PR annonce « Sécurité : fumée » en première ligne.

## 9. Choix par défaut et questions ouvertes

Choix par défaut : 9600 bauds, bail de 500 ms (égal à `WATCHDOG_STALL_MS`), plafond de 10 s et
pause de 5 s dans la carte (égaux à `SMOKE_HARD_LIMITS`), fumée désarmée à chaque reconnexion,
carte alimentée par l'USB seul.

Questions pour le porteur du projet :

1. Un câble USB de 5 m au plus suffit-il jusqu'à la carte ? Sinon, la carte peut-elle être
   rapprochée du PC ?
2. Garde-t-on le bloc secteur de la carte ? Par défaut non : l'USB alimente la carte et le relais.
3. Si le module relais colle quand son entrée est en l'air, accepte-t-on une résistance de rappel
   (quelques centimes) malgré la règle « rien à acheter » ?
4. Si la carte a une puce CH340 et que Windows n'installe pas le pilote seul, accepte-t-on cette
   exception d'installation ?
5. La sauvegarde du programme d'origine, téléchargée sur le PC de la salle, suffit-elle comme
   retour arrière ?

Ce qui ferait changer de voie : sur le banc, une carte qui ne se synchronise pas avec le chargeur
par Web Serial, même avec RESET à la main. Dans ce cas, installation unique depuis un autre poste.

## Sources

- Optiboot, `optiboot.c` : <https://github.com/Optiboot/optiboot>
- Cœur Arduino AVR, `boards.txt` : <https://github.com/arduino/ArduinoCore-avr>
- Spécification Web Serial : <https://wicg.github.io/serial/>
- MDN, `SerialPort.setSignals()` : <https://developer.mozilla.org/docs/Web/API/SerialPort/setSignals>
- Microsoft, pilote `Usbser.sys` :
  <https://learn.microsoft.com/windows-hardware/drivers/usbcon/usb-driver-installation-based-on-compatible-ids>
