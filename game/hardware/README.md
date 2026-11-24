# @quizzup/hardware — couche matériel de la salle (100 % navigateur)

Buzzers, lumières, spots et machine à fumée pilotés **depuis la page de l'écran de salle**, dans
Chrome ou Edge, sans rien installer. Package TypeScript pur (aucune dépendance d'exécution, pas de
Vue), consommé en sources via un alias, comme `@quizzup/game-engine`.

Principe : **chaque centre a son propre matériel**. Rien n'est câblé en dur : les buzzers sont
associés par apprentissage, les appareils DMX sont décrits par des profils, et tout fonctionne
en **mode simulation** sans aucun matériel branché.

| Brique                                                   | Fichier                                          | US               |
| -------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| Buzzers clavier, focus, Keyboard Lock                    | `src/buzzers/keyboardBuzzerInput.ts`             | #62, #61 (focus) |
| Apprentissage pupitre × buzzer                           | `src/buzzers/learning.ts`                        | #62              |
| Buzzers simulés                                          | `src/buzzers/simulatedBuzzerInput.ts`            | #62, #64         |
| Buzzers sur carte d'entrées USB vue comme une manette    | `src/buzzers/gamepadBuzzerInput.ts`              | #62              |
| Preset des salles 6 pupitres déjà équipées               | `src/presets/sixDeskRoom.ts`                     | #62, #64         |
| Profils d'appareils génériques                           | `src/dmx/profiles.ts`                            | #64              |
| Appareils de la salle, rendu DMX                         | `src/dmx/fixtures.ts`                            | #64              |
| Sorties Web Serial / simulation                          | `src/dmx/serialOutput.ts`, `simulationOutput.ts` | #64              |
| Sortie pont Art-Net (WebSocket local)                    | `src/dmx/bridgeOutput.ts`                        | #64              |
| Scènes et liaisons événement → scène                     | `src/lighting/scenes.ts`, `scenePlayer.ts`       | #64              |
| Fumée sécurisée                                          | `src/lighting/smoke.ts`                          | #64              |
| Contrôleur (boucle DMX, chien de garde, arrêt d'urgence) | `src/lighting/lightingController.ts`             | #64              |
| Config de salle (`rooms.config`)                         | `src/config.ts`                                  | #54, #62, #64    |

## Buzzers

Les buzzers sont des encodeurs USB vus comme un clavier. On lit la **touche physique**
(`KeyboardEvent.code`), donc le mapping marche en AZERTY comme en QWERTY.

```ts
import { createKeyboardBuzzerInput, parseRoomHardwareConfig } from '@quizzup/hardware'

const { config } = parseRoomHardwareConfig(room.config)
const buzzers = createKeyboardBuzzerInput({ keymap: config.buzzers.keymap })

const off = buzzers.onPress((press) => {
  // press = { desk: 1-4, button: 'A'-'D', buttonIndex: 0-3, at: performance.now(), code }
  engine.dispatch({ type: 'press', at: press.at, podium: press.desk, button: press.buttonIndex })
})

buzzers.onChange((state) => {
  // state.active === false → afficher « Cliquez pour réactiver les buzzers »
})
await buzzers.lockSystemKeys() // après requestFullscreen() : capte Échap, Alt+Tab… (Chrome/Edge)
```

- Un appui = un buzz jusqu'au relâchement : auto-répétition et touche maintenue ignorées.
- Saisie dans un champ (`input`, `textarea`, `contenteditable`) et combinaisons Ctrl / Alt / Méta
  ignorées (Ctrl+R reste possible) ; touches système (Échap, Tab, F1-F12, Windows…)
  refusées comme buzzer.
- **Horodatage** en millisecondes monotones (`performance.now()`), la même base que les `at`
  envoyés au moteur : c'est ce temps qui départage les buzzs. Il vient de `event.timeStamp`
  (posé par le navigateur à la réception de la touche), donc un thread principal ralenti (rendu,
  décodage audio) ne décale pas l'appui ni le palier attribué. Repli sur `clock.now()` si la valeur
  est absente, nulle, non finie ou dans le futur (`eventTime`). Reste la gigue de l'encodeur USB
  (environ 8 ms, sondage à 125 Hz), hors de portée du logiciel. Limite : le moteur ramène un appui
  en retard sur le dernier instant connu (`max(at, lastAt)`) ; si un tick ou un appui manette passe
  avant le handler clavier, l'appui antérieur perd son avance (piste : trier les appuis d'une même
  tâche avant le moteur).
- **Perte de focus** : `state.focused` / `state.visible` / `state.active`. Quand la page perd le
  focus, plus aucun appui n'arrive : l'écran de salle doit l'afficher en grand.

### Buzzers sur une carte manette (API Gamepad)

Certaines salles câblent les buzzers sur une **carte d'entrées USB vue comme une manette**
(carte 32 boutons pour simulateurs), souvent doublée d'un logiciel qui convertit les boutons en
touches. `createGamepadBuzzerInput` lit la carte directement avec l'API Gamepad (Chrome / Edge) :
plus de logiciel à installer, et les appuis arrivent même sans focus clavier.

```ts
const buzzers = createGamepadBuzzerInput({ keymap: config.buzzers.keymap })
// codes du mapping : GamepadButton0 … GamepadButton31 ; même interface que le clavier
buzzers.getGamepad() // { index, id, buttons } ou null : « Appuyez sur un buzzer pour activer la carte »
```

- Le navigateur n'expose la carte qu'après un **premier appui** sur un de ses boutons.
- `lockSystemKeys()` / `unlockSystemKeys()` existent aussi ici (même verrou Keyboard Lock que les
  buzzers clavier, `src/buzzers/keyboardLock.ts`) : Échap ne doit pas quitter le plein écran en
  pleine partie, quelle que soit la source des buzzers. Les touches restent livrées à la page.
- Lecture toutes les 4 ms ; l'appui est horodaté avec la mise à jour de la carte
  (`Gamepad.timestamp`), bornée entre deux lectures.
- Appuis vus dans la même lecture : même horodatage, ordre d'émission tournant (aucun pupitre ne
  gagne toujours les égalités à cause de son numéro d'entrée).
- Un bouton déjà enfoncé au démarrage, au retour de l'onglet ou quand une autre carte est lue ne
  compte pas. Option `match(id)` pour choisir la carte si une autre manette est branchée.

### Apprentissage

```ts
const learning = createBuzzerLearning() // 4 pupitres × A-D ; { desks: desksForCount(6) } pour 6, [1, 2] pour 2
const stop = buzzers.onKey(({ code }) => learning.capture(code))
learning.onChange((state) => {
  // state.current = { desk, button } → « Appuyez sur le buzzer B du pupitre 3 »
  // state.lastResult : assigned | duplicate (touche déjà prise) | forbidden (touche système)
})
learning.skip() / learning.back() / learning.restart()
// state.done → enregistrer learning.getKeymap() dans rooms.config.buzzers.keymap
```

L'écran de test se construit avec `onPress` (allumer le buzzer à l'écran) et `state.held`.
`createSimulatedBuzzerInput()` offre la même interface avec `press(desk, button)` (démo, tests).

Une salle a **4 pupitres par défaut** (`DEFAULT_DESKS`) et jusqu'à **6** (`DESKS`). Son nombre de
pupitres est `desksCount` dans `rooms.config` (`RoomHardwareConfig.desksCount`, 1 à 6, absent = 4,
valeur invalide ramenée dans 1..6 et signalée) ; `desksForCount(n)` donne les pupitres 1 à n. Le
backoffice le relit pour ne proposer que ces pupitres au lancement d'une partie. Réduire ce nombre
**n'efface rien** (`withDesksCount`) : les buzzers appris et l'affectation des lumières des
pupitres retirés restent en réserve dans la config, ignorés à l'usage (`activeKeymap`,
`activeLightingConfig`) et restitués tels quels si on remonte le nombre. Réapprendre une touche de
réserve sur un pupitre actif retire son doublon de réserve (`withLearnedKeymap`). Le mapping clavier
de simulation (`createDefaultKeymap(desks)`) ajoute pour les pupitres 5 et 6 les rangées 5-8 et T-I.

### Salles 6 pupitres déjà équipées

`src/presets/sixDeskRoom.ts` décrit le matériel type des salles équipées par un autre système de
quiz (6 pupitres × 4 buzzers bleu / jaune / vert / rouge, 8 lyres 9 canaux, décodeur LED 8
sorties) pour y jouer à QuizzUp **sans recâbler** :

```ts
const calibration = parsePanTiltCalibration(sessionConfText) // calage des lyres déjà fait
const rig = createSixDeskRoomRig({ calibration, smokeRelayAddress: 200 })
room.config = {
  version: 1,
  buzzers: { keymap: createSixDeskKeyboardKeymap() }, // ou apprentissage en mode manette
  lighting: { driver: 'usbpro', ...rig },
}
```

Les profils de lyres (`SIX_DESK_PROFILES`) suivent la disposition courante en 9 canaux : **à
vérifier sur la notice** de la lyre. Analyse complète (matériel, réseau, ce qu'il faut acheter ou
débrancher) : [rapport de compatibilité](../../docs/compatibilite/compatibilite-salles-6-pupitres.md).

### Modèles de salle et univers proposés

`src/presets/roomTemplates.ts` propose quatre modèles pour équiper une salle vite (`ROOM_TEMPLATES`) :
« 6 pupitres, 8 lyres et rubans LED » (la salle de référence à nœud Art-Net à deux sorties : mêmes
appareils, profils et adresses que le préréglage ci-dessus, mais les huit lyres restent sur
l'univers interne 0 aux adresses 1, 10 … 64 et les sept rubans passent sur l'univers interne 1 à
partir de 128 ; `address` et `universe` d'un appareil de modèle sont gardés tels quels, ceux des
autres sont calculés à la suite), « 4 pupitres, 4 PAR RVBW », « 4 pupitres, 4 PAR + 2 lyres » et « 6 pupitres, 6 PAR RVB + 2 lyres » (profils génériques ;
la lyre est `moving-head-8`, **à vérifier sur la notice**). **Un modèle n'ajoute ni n'active jamais
la fumée** : elle se déclare à part, avec ses vérifications ; `createRigFromTemplate` refuse tout
appareil ou canal de fumée (`smoke_forbidden`).

```ts
const result = createRigFromTemplate(ROOM_TEMPLATES[1], { startAddress: 1 })
if (result.ok) {
  // result.fixtures : adresses consécutives sur l'univers 0 (sauf adresse propre au modèle)
  // result.customProfiles : profils propres au modèle (copie neuve à chaque appel)
}
```

Refus : `invalid_start_address` (pas un entier de 1 à 512), `does_not_fit` (au-delà du canal 512),
`unknown_profile`, `smoke_forbidden`. Les points du plan de salle ne sont pas écrits : le plan prend
les places par défaut (`resolveRoomPlan`). L'opérateur confirme ensuite appareil par appareil.

`proposeUniverses(node, fixtures)` (fonction pure, rien n'est appliqué sans confirmation) propose les
univers à donner aux appareils d'après les sorties que le nœud annonce (`ArtnetNode.universes`).
Sans `--map`, le pont envoie l'univers interne n vers `--universe` + n (0 par défaut) : une sortie
`0.0.x` avec x de 0 à 15 reçoit donc l'univers interne x (piège de `banc-materiel.md` §3.4). Les
appareils gardent leur regroupement : le plus petit univers qu'ils utilisent passe sur la plus petite
sortie accessible, le suivant sur la suivante. Renvoie `null` (rien à proposer) si le nœud n'annonce
aucune sortie accessible (autre net ou sub-net, hors 0..15, texte illisible), s'il y a moins de
sorties que d'univers utilisés, ou si les appareils sont déjà placés ; sinon la liste
`{ fixtureId, universe }` des seuls appareils qui changent. Le regroupement par sortie (lyres sur la
sortie 1, décodeur LED sur la sortie 2) se règle ensuite à la main, sauf pour le modèle 6 pupitres qui
le décrit déjà (lyres sur l'univers interne 0, rubans sur le 1 : une correspondance par sortie).
`proposeUniverses` suppose un pont lancé avec l'univers de base 0 (`--universe` à 0, défaut) et sans
`--map` ; sinon l'univers d'arrivée est décalé.

## Lumières, spots et fumée

```ts
import {
  createLightingController,
  createSerialOutput,
  createSimulationOutput,
  getGrantedDmxPort,
  requestDmxPort,
} from '@quizzup/hardware'

const lights = createLightingController({
  config: config.lighting,
  output: createSimulationOutput(),
  resolveDesk: (participantId) => participants.find((p) => p.id === participantId)?.podium ?? null,
})
await lights.start()

// Bouton « Connecter l'interface DMX » (geste utilisateur obligatoire la première fois) :
const port = (await getGrantedDmxPort()) ?? (await requestDmxPort())
await lights.setOutput(createSerialOutput({ port, driver: config.lighting.driver }))

// À chaque événement du moteur :
for (const event of events) lights.handleGameEvent(event)
```

### Sorties DMX

| `driver`        | Matériel                                                         | Statut       |
| --------------- | ---------------------------------------------------------------- | ------------ |
| `simulation`    | aucun ; `getFixtureViews()` alimente la vue « salle simulée »    | par défaut   |
| `usbpro`        | interfaces compatibles **DMX USB Pro** (Enttec et clones)        | recommandé   |
| `opendmx`       | interfaces FTDI « Open DMX » sans microcontrôleur                | expérimental |
| `artnet-bridge` | nœud **Art-Net** (réseau) via le pont local `game/artnet-bridge` | facultatif   |

**Plusieurs univers DMX** : chaque appareil porte un `universe` facultatif (0 à 15, 0 par défaut :
une config sans `universe` se relit à l'identique). Les chevauchements de canaux se cherchent
univers par univers (même adresse sur deux univers = libre). `DmxOutput.write(data, universe = 0)`
émet un univers à la fois ; le contrôleur envoie toujours l'univers 0, puis les autres univers
utilisés, dans l'ordre. Capacités par pilote (`DMX_DRIVER_UNIVERSES`) : `simulation` et
`artnet-bridge` 16, `usbpro` et `opendmx` **1** (univers 0 seulement). Sur USB, un appareil placé
sur un autre univers n'est pas émis et remonte un problème (`getState().problems`,
`parseRoomHardwareConfig(...).problems`, blocage de l'assistant et récapitulatif), sans planter ;
la config est conservée si on change d'interface. Le diagnostic règle un canal brut sur un
univers donné (`diagnostics.setChannel(canal, valeur, univers)`), et `getFrame(univers)` /
`lastFrame(univers)` relisent la trame d'un univers. Face à un **ancien pont** Art-Net dont l'`ack` n'annonce pas `universes`, la sortie n'envoie que l'univers 0 (sans faire fermer la connexion) et les appareils des autres univers sont signalés comme problème (`DmxOutput.universeCount`). Un univers réglé à la main au diagnostic, même sans appareil, est remis à zéro à la fin du diagnostic et couvert par le noir (arrêt d'urgence, fermeture).
Le comptage `framesSent` / `measuredHz`
reste « une trame de jeu par tour » (univers 0).

Web Serial n'existe que dans **Chrome et Edge**, en contexte sécurisé (HTTPS ou localhost).
Art-Net (réseau) est impossible depuis un navigateur (pas d'UDP) : le pilote `artnet-bridge`
passe par un petit pont local à installer sur le PC de la salle, **seulement** si elle possède
déjà un nœud Art-Net (voir `game/artnet-bridge/README.md` ; l'USB-DMX reste recommandé).

```ts
import { createBridgeOutput, DEFAULT_BRIDGE_URL } from '@quizzup/hardware'

// Reprise sans clic au démarrage (l'écran de salle réessaie toutes les 10 s si le pont est absent,
// et propose un bouton « Connecter le pont »). `setOutput` ne lève pas : l'échec se lit dans
// `lights.getState().outputStatus === 'error'` (message dans `outputError`).
// `artnet` (config.lighting.artnet) part dans le hello v2 : le pont l'applique sauf si --target.
const bridge = createBridgeOutput({
  url: config.lighting.bridgeUrl ?? DEFAULT_BRIDGE_URL,
  artnet: config.lighting.artnet,
})
await lights.setOutput(bridge)
bridge.artnetStatus() // { target, port, source: 'cli' | 'room' | 'none' }, null avec un pont ancien
```

`createBridgeOutput` ouvre `ws://127.0.0.1:<port>`, vérifie le pont (`hello` / `ack`, délai
`openTimeoutMs` ; le `hello` v2 porte `version: 2` et, si réglée, la cible `artnet: { target }` (jamais de port : il reste celui du pont) ;
l'`ack` renvoie la cible effective et sa provenance, lisibles par `artnetStatus()` ; un pont qui refuse
la cible répond `error` / `target`, et l'ouverture échoue avec son message), envoie chaque univers en trame binaire de 515 octets (version, univers 0 à 15, 512
canaux ; tous les univers d'un tour sont sautés ensemble si la socket est saturée), saute une trame si la socket est encore pleine (`bufferedAmount`, jamais de retard
accumulé) et signale une coupure par `onDisconnect` (le contrôleur coupe alors la fumée). Côté
pont, un chien de garde envoie du noir si le navigateur se tait plus de 2,5 s.

**Gel pour le test de perte de signal** : un pont qui annonce `"hold"` dans `features` (`bridge.features()`)
sait geler sa sortie. `bridge.hold(ms)` envoie `{"type":"hold","ms":15000}` (entier de 1 000 à 15 000 ms,
`BRIDGE_HOLD_LIMITS`) : le pont garde la dernière trame (renvoyée à plus de 1 Hz, comme une interface USB
Pro), ignore les trames reçues pendant `ms`, puis passe au noir à la fin du gel ou à la déconnexion, et
répond `{"type":"held","ms":15000}` (la promesse se résout alors). Rejet par une `BridgeHoldError` :
`invalid_duration`, `not_connected`, `unsupported` (pont trop ancien, rien n'est envoyé), `refused`
(rien à geler, gel déjà actif ; connexion gardée) ou `timeout`. `bridge.release()` envoie
`{"type":"release"}` et met fin au gel tout de suite (noir). `DmxOutput.hold?` / `release?` sont
facultatifs : une interface USB, qui répète déjà la dernière trame, n'en a pas.

### Profils d'appareils

Profils génériques (`GENERIC_PROFILES`) : PAR RGB, RGBW, gradateur + RGB, gradateur + RGBW +
strobe, gradateur simple, stroboscope, lyre 8 canaux (pan/tilt 16 bits), fumée DMX, fumée sur
relais (tout ou rien). Un appareil absent de la liste se décrit avec un **profil sur mesure**
(`lighting.customProfiles`) : liste ordonnée de rôles de canaux (`dimmer`, `red`, `pan`,
`smoke`, `fixed` avec une valeur…).

Lyres spot génériques à roue de couleurs : `moving-head-spot-9`, `-11` et `-16` (ordre de canaux
courant, **à vérifier sur la notice** ; vitesse et gobo sont des canaux `fixed` à 0). Le strobe
n'est pas piloté sur ces profils : le shutter est simplement ouvert (255), et fermé (0) quand
l'intensité vaut 0. Rôles de canal à réglages :

- `colorWheel` : `slots: [{ "value": 0-255, "rgb": [r, g, b] }]` (256 emplacements au plus).
  La couleur demandée prend la valeur de l'emplacement le plus proche (distance RVB, premier en
  cas d'égalité). Sur du noir (r = g = b = 0), la roue ne bouge pas : `value` du canal, sinon
  premier emplacement. Roue vide : `value` du canal. Rendue en plus des canaux RVB si le profil
  en a. Un emplacement invalide est écarté (message dans `problems`), le profil est conservé.
- `shutter` : `open` (défaut 255) ; `closed` facultatif, envoyé quand l'intensité vaut 0.
- Vitesse pan/tilt, gobo ouvert, prisme… : canal `fixed` avec sa `value`.
- Sur l'appareil installé : `invertPan`, `invertTilt` (défaut `false`) et `panRange`, `tiltRange`
  (`[min, max]` en mots 16 bits comme `PanTilt`). La position demandée est d'abord inversée
  (`65535 - valeur`), puis la plage s'applique à cette valeur physique (butées du matériel).

Un appareil peut être **dédié à un pupitre** (`desk`) et une lyre peut avoir une **position
enregistrée par pupitre** (`deskPositions`) : « spot sur le pupitre qui a buzzé ».

### Événements de jeu → scènes

Les noms sont ceux du moteur `@quizzup/game-engine`. Le pupitre vient de `payload.desk` s'il
est fourni, sinon de `payload.participantId` via `resolveDesk`.

| Événement moteur                                       | Scène par défaut                       |
| ------------------------------------------------------ | -------------------------------------- |
| `game_started`                                         | `game-start`                           |
| `round_started`                                        | `round-start`                          |
| `round_started.<miniGame>` (si la salle l'a réglé)     | celle de la salle, sinon `round-start` |
| `round_chooser_selected`                               | `chooser` (spot pupitre)               |
| `question_started`                                     | `question`                             |
| `blind_test_stage_started`, `blind_test_stage_resumed` | `clip-playing`                         |
| `buzzer_pressed`                                       | `buzz` (spot pupitre)                  |
| `answer_correct` / `answer_wrong`                      | `answer-correct` / `answer-wrong`      |
| `question_ended` sans gagnant                          | `question-lost`                        |
| `round_ended`                                          | `round-end`                            |
| `game_ended` (un seul gagnant → spot sur son pupitre)  | `victory` (+ fumée si armée)           |
| `game_ended` à égalité (clé `game_ended_tie`)          | `victory-tie` (+ fumée si armée)       |
| `game_aborted`                                         | `idle`                                 |

Chaque salle peut surcharger une liaison (`lighting.bindings`, `null` pour la couper). Une salle qui
a réglé `game_ended` sans régler `game_ended_tie` garde son choix à égalité. Une scène
moins prioritaire n'interrompt pas la scène en cours (un extrait qui reprend ne coupe pas
l'effet « bonne réponse »). Priorités : `idle` 0 ; `question`, `clip-playing` 10 ; `game-start`,
`round-start`, `chooser`, `round-end` 20 ; `buzz`, `answer-correct`, `answer-wrong`,
`question-lost` 40 (un buzz juste après une mauvaise réponse n'est donc pas refusé) ; `victory`,
`victory-tie` 50 ; `identify` 90. Couleurs : DA néon du backoffice, une couleur par pupitre.

**Plafond d'éclairs (photosensibilité)** : la salle ne fait pas plus de **3 éclairs par seconde**,
quelle que soit la scène jouée par le lecteur de scènes. Le seuil de référence est
`MAX_FLASHES_PER_SECOND` (3) ; l'écart réellement tenu est `MIN_FLASH_INTERVAL_MS` = **400 ms**
(3 éclairs par seconde donneraient 334 ms ; la marge couvre la latence d'émission USB et Art-Net,
à mesurer sur le banc). Les deux sont dans `src/lighting/scenes.ts`.

Un **éclair** est la remontée du niveau d'une composante d'un appareil (rouge, vert, bleu ou blanc,
chacune × intensité, de 0 à 1) d'au moins `FLASH_RISE_LEVEL` (0,1) au-dessus du minimum atteint
depuis le dernier éclair compté sur cette composante. Un fondu ou un palier prolongé compte pour un
seul éclair ; un passage du noir au blanc à intensité 1 en est un, comme un saut de 0,55 à 1, et un
changement de couleur à même niveau aussi (rouge 255 puis bleu 255). Le plafond vaut pour **toute la
salle** : un allumage sur n'importe quel appareil attend 400 ms après le dernier éclair de la salle,
sauf s'il tombe dans le même instant (plusieurs appareils qui s'allument ensemble comptent pour un).

- Les scènes par défaut le respectent dans leur définition (un test le vérifie pour chaque flash).
- Une étape `flash` plus rapide que le plafond est ramenée à 400 ms de période
  (`flashPeriodMs`, utilisée par `stepDuration` et par le lecteur ; l'éteint est allongé).
- Le lecteur (`createScenePlayer`) tient le plafond pour **toute** scène jouée (scène réglée par une
  salle, étapes de couleur qui alternent, enchaînement de deux scènes) : tout état écrit sur un
  appareil passe par une seule fonction qui retient un éclair trop proche du précédent, puis
  l'applique dès que le plafond le permet. Un état final retenu est appliqué même si la scène est
  finie, et n'est pas effacé par la scène suivante qui ne vise pas cet appareil ; un flash retenu
  dont la fenêtre est passée est perdu, pas rejoué. Un buzz juste après un éclair peut donc
  s'allumer jusqu'à 400 ms plus tard. L'arrêt d'urgence et `blackout()` restent immédiats et
  oublient tout état retenu.

**Appareil qui clignote tout seul (lot S5)** : il ne passe pas par le niveau mesuré. Un canal
`shutter` ou `fixed` peut porter `strobeRange: [min, max]` (0-255), la plage stroboscope de la notice ;
`strobeProblems` ajoute alors un avertissement (non bloquant, fr puis en, appareil et canal nommés) aux
`problems` de `parseRoomHardwareConfig` et aux `warnings` de l'assistant si la valeur envoyée
(`open`/`closed` d'un shutter, `value` d'un fixed) tombe dedans. Aucun profil livré n'a de plage (aucune
n'est documentée). Sans plage, seul un `shutter` réglé sur autre chose que 255 ou 0 est signalé. Une
`strobeRange` invalide, ou posée sur un autre rôle que `shutter` / `fixed`, est ignorée et signalée.
Au diagnostic, `setFixture({ strobe })` et `setChannel` sur un canal de rôle `strobe` sont ramenés à
`DIAGNOSTIC_STROBE_MAX_VALUE` (30, soit 3 Hz si le canal va linéairement de 0 à 25 Hz : hypothèse à
mesurer) et retombent à 0 après `DIAGNOSTIC_STROBE_MAX_MS` (3 s) ; `freezeOutput` les remet à 0 avant la
trame gelée. **Reste hors plafond** : une valeur `amber` / `uv` et un stroboscope piloté par une liste
d'identifiants. Vérifier sur la notice de chaque appareil (banc D8, D10).

Cadences par défaut (nombre d'éclairs × durée allumé / éteint ; période de 400 ms = 2,5 éclairs/s) :

| Scène                  | Avant                              | Après                                                      |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `game-start`           | 3 × 150/100 (4,0 éclairs/s)        | 2 × 150/250 (2,5 éclairs/s)                                |
| `round-start`          | 2 × 150/100 (4,0 éclairs/s)        | 2 × 150/250 (2,5 éclairs/s)                                |
| `buzz`                 | 3 × 80/60 (7,1 éclairs/s)          | 1 × 120/280, pupitre fixe 500 ms après le buzz (fondu 100) |
| `answer-correct`       | 3 × 120/80 (5,0 éclairs/s)         | 2 × 140/260 (2,5 éclairs/s)                                |
| `answer-wrong`         | 2 × 200/120 (3,1 éclairs/s)        | 2 × 200/200 (2,5 éclairs/s)                                |
| `round-end`            | 2 × 200/120 (3,1 éclairs/s)        | 2 × 200/200 (2,5 éclairs/s)                                |
| `victory`              | 6 × 100/80 (5,6 éclairs/s)         | 3 × 120/280 (2,5 éclairs/s)                                |
| `victory-tie`          | nouvelle scène (absente de `main`) | 3 × 150/290 (2,3 éclairs/s)                                |
| `identify` (inchangée) | 4 × 250/200 (2,2 éclairs/s)        | 4 × 250/200 (2,2 éclairs/s)                                |

Cibles des scènes : un **stroboscope** (type `strobe`) n'est jamais piloté par `all`, `desk` ou
`others` : seule une liste d'identifiants qui le nomme l'allume (hors scène qui le demande, son
gradateur et son canal strobe restent à 0). Un pupitre **sans aucun appareil** (ni PAR dédié, ni
position de lyre), ou **inconnu** (participant sans pupitre résolu, `desk: null`), fait que `desk`
vise toute la salle et `others` ne vise personne ; la couleur « pupitre » est alors le blanc.

### Show réglable par salle (`lighting.scenes`)

Une salle ne stocke que les scènes qu'elle **change ou ajoute** (jamais le show complet : `rooms.config`
est limitée à 20 000 caractères côté serveur). Même `id` qu'une scène par défaut = remplacement ;
`lighting.bindings` reste la table événement → scène. La scène `identify` ne se surcharge pas.

```jsonc
"lighting": {
  "bindings": { "round_started.sudden_death": "mort-subite", "game_resumed": "reprise" },
  "scenes": [
    { "id": "mort-subite", "name": "Mort subite", "priority": 20, "next": "reprise",
      "steps": [{ "type": "flash", "color": { "r": 255, "g": 0, "b": 0 }, "count": 2, "onMs": 150, "offMs": 250 }] },
    { "id": "reprise", "name": "Reprise", "priority": 10,
      "steps": [{ "type": "color", "color": { "r": 116, "g": 88, "b": 230 }, "intensity": 0.3, "fadeMs": 500 }] }
  ]
}
```

- **Enchaînement** : `next` désigne la scène lancée à la fin de celle-ci (même pupitre, sa propre
  priorité). Une scène qui se désigne elle-même, ou une chaîne qui revient sur elle, **boucle**.
  Une scène en boucle de priorité supérieure à `idle` tourne jusqu'au prochain début de partie ou à
  l'arrêt de partie. Après un gel de la page, le lecteur saute les tours complets de boucle et ne
  rejoue que le dernier.
- **Clés d'événement** : `round_started.<miniGame>` (code du mini-jeu, ex. `sudden_death`) l'emporte
  sur `round_started`, y compris à `null` (aucune scène pour ce mini-jeu). Les **signaux de l'écran
  de salle** `SHOW_CUES` (`game_paused`, `game_resumed`, `session_exit`) passent par
  `handleGameEvent` comme un événement, sans jamais entrer dans le moteur : ils n'ont **aucune
  liaison par défaut** (les scènes `pause` / `question` de reprise et la scène de sortie arrivent
  avec l'écran de salle).
- **Bornes** (`parseScenes`, constantes `SCENE_LIMITS`). Une scène ou une étape illisible est
  écartée, une valeur hors borne est ramenée, et chaque écart est dans les `problems` de
  `parseRoomHardwareConfig` :

| Élément                         | Borne                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scènes de la salle              | 24 au plus                                                                                        |
| Pas par scène                   | 16 au plus                                                                                        |
| Flash, `onMs` et `offMs`        | 60 ms au moins chacun                                                                             |
| Flash, période                  | `MIN_FLASH_INTERVAL_MS` (400 ms) au moins : l'éteint est allongé (pas les 334 ms théoriques)      |
| Flash, durée d'un pas           | 5 s au plus (nombre d'éclairs ramené) ; période de plus de 5 s : pas écarté                       |
| Boucle                          | 200 ms au moins (somme des pas du tour), sinon `next` écarté                                      |
| Priorité                        | ramenée dans 0..60 (10 si absente)                                                                |
| Priorité d'une scène qui boucle | 10 au plus                                                                                        |
| Attente, fondu, maintien        | 10 minutes au plus par durée (`maxStepMs`), ramenée et signalée                                   |
| Pas `smoke`                     | un seul par scène **et par chaîne `next`**, aucun dans une boucle, durée dans `SMOKE_HARD_LIMITS` |
| `next`                          | vers une scène inconnue : écarté                                                                  |

**Sécurité fumée** : une scène de salle n'ouvre aucun passage nouveau. Son pas `smoke` passe par le
même `fireSmoke` que celui des scènes par défaut (armement, durée maximale, repos, pause, onglet
masqué, arrêt d'urgence) ; la fumée reste désactivée par défaut. Après un gel du navigateur, les pas
passés sont rattrapés sans jet de fumée « en retard » (`LATE_SMOKE_TOLERANCE_MS`), y compris pour une
scène enchaînée. Le contrôleur reborne lui-même `lighting.scenes` (`parseScenes`) : une config qui ne
passe pas par `parseRoomHardwareConfig` ne contourne rien. Le plafond de 3 éclairs par seconde du
lecteur vaut aussi pour ces scènes.

Limite connue : les scènes par défaut n'ont pas de `next`, donc la détection de boucle ne regarde
que les scènes de la salle (à étendre quand une scène par défaut en aura un).

**Clés inconnues** : `parseRoomHardwareConfig` recopie telles quelles les clés qu'il ne connaît pas,
à la racine et dans `lighting`, pour qu'un poste resté sur une version plus ancienne n'efface pas ce
qu'une version plus récente a enregistré (les clés connues gardent toujours la priorité).

## Sécurité fumée

Le contrôleur de fumée applique, quoi que dise la configuration :

- fumée **désactivée par défaut** ; durée max (bornée à **10 s**), pause obligatoire (au moins
  **5 s**), niveau max ;
- **armement humain** : l'opérateur coche « fumée autorisée » (`lights.smoke.arm()`) avant la
  partie, sinon les scènes ne déclenchent rien ;
- niveau calculé à partir de l'heure : un minuteur en retard ne peut pas prolonger la fumée ;
- **chien de garde** : si la page gèle plus de 500 ms, si l'onglet passe en arrière-plan ou si
  l'interface DMX tombe ou ne répond plus (écriture bloquée plus de 500 ms), la fumée est
  coupée ; tant que l'onglet est masqué, toute nouvelle émission est refusée ;
- trames envoyées en continu (30 Hz), la plus récente d'abord : la trame d'arrêt n'est jamais
  perdue derrière une écriture lente ; en changeant d'interface ou à l'arrêt, plus aucune trame
  de jeu ne part et une trame noire est envoyée **en dernier** ;
- pas de célébration ni de fumée sur une partie terminée faute de contenu ;
- **partie en pause** (`lights.setGamePaused(true)`, appelé par l'écran de salle) : le jet en cours
  est coupé et sa trame à 0 part aussitôt (comme pour `smoke.stop()`), puis toute demande de jet est
  refusée avec le motif `paused`, quel que soit l'appelant : étape `smoke` d'une scène déjà lancée,
  `smoke.fire`, test de gel. Les lumières continuent ; une étape refusée n'est pas rejouée à la
  reprise (`setGamePaused(false)`), et le temps de repos du jet coupé reste dû. L'arrêt d'urgence
  garde la priorité ;
- `game_aborted` arrête la scène en cours, même plus prioritaire, avant de jouer `idle` ;
- **arrêt d'urgence logiciel** (`lights.emergencyStop()`) : noir complet, fumée coupée et
  verrouillée ; `resetEmergency()` rallume l'ambiance ; la fumée reste désarmée et doit toujours être
  réarmée à la main, même si la salle n'exige pas de confirmation. L'application de salle retient
  l'arrêt d'urgence dans le navigateur (`quizzup_room_emergency`) et crée le contrôleur déjà en
  arrêt d'urgence après un rechargement (voir le README de `game/room-app`) ;

> ⚠️ **Obligatoire en salle** : un **arrêt d'urgence physique** qui coupe l'alimentation de la
> machine à fumée et des lumières. Le bouton logiciel ne suffit pas : si le PC ou le navigateur
> plante, plus aucune trame n'est envoyée.
>
> **Montage retenu** : la fumée passe par un **relais DMX** suivi d'un **relais temporisé
> physique réglé à 10 s maximum**. Une interface DMX USB Pro répète la dernière trame reçue :
> si le PC plante pendant une émission, seul le relais temporisé coupe la fumée. Vérifier ce
> montage avec le test de gel du diagnostic.
>
> **Relais obligatoire, sauf case explicite.** La fumée n'est activable qu'avec un **profil à
> relais** (`smoke-relay`, ou un profil sur mesure dont le canal `smoke` est `binary`). Une
> machine à fumée **DMX progressive** (`smoke-dmx`) n'est acceptée que si l'installateur coche
> « la machine coupe toute seule sur perte de signal DMX » (`lighting.smoke.cutsOnSignalLoss`,
> absent = faux). Sans l'un ni l'autre, la fumée reste désactivée et l'assistant dit pourquoi
> (`SetupSummary.smokeDisabled === 'relay_required'`, point bloquant `SMOKE_RELAY_REQUIRED`).
> Le relais se juge sur les **canaux**, jamais sur `kind` : tous les canaux `smoke` du profil doivent
> être `binary` (`hasSmokeRelay`), et un seul canal `smoke` progressif sur un appareil quelconque
> suffit à le classer sans relais (`smokeLacksRelay`).
> Avec la case et sans relais, le relais temporisé n'est plus exigé (`smokeChecksRequired`). Le test
> de gel ne prouve pas la coupure sur perte de signal (l'interface et le pont répètent la dernière
> trame) : il devient un test guidé de **vraie** perte de signal (la fumée part, l'installateur
> débranche le câble DMX, la machine doit s'arrêter en moins de 10 s ; « elle continue » décoche la
> case et désactive la fumée). Cocher ou décocher la case oblige à le refaire. Une salle existante à fumée DMX sans relais ni case est relue **sans
> erreur** : `parseRoomHardwareConfig` désactive la fumée (`smokeDisabledReason: 'relay_required'`,
> un problème « Fumée désactivée… ») et garde tous les autres réglages (durée, pause, niveau).

## Fiabilité des interfaces USB DMX (Web Serial)

- **DMX USB Pro** : l'interface fabrique elle-même le signal DMX, le PC lui envoie un paquet
  par trame. C'est le choix recommandé : timing stable sous Windows comme sous macOS.
- **Open DMX** (FTDI sans microcontrôleur) : le navigateur fabrique le signal. Chaque trame
  envoie un _break_ (`setSignals({ break: true })` puis `{ break: false }`) puis les 513 octets.
  Aucune attente par minuteur dans la trame : Chrome bride les minuteurs d'un onglet masqué à
  environ 1 s, et une trame qui dormirait pour le break puis après l'envoi durerait plus de 2 s
  (le contrôleur, qui laisse 500 ms à une écriture, passerait la sortie en erreur). Le break
  tient donc dans l'aller-retour USB des deux `await setSignals()`, bien plus long que les
  88 µs exigées par le standard ; et avant la trame suivante, on n'attend que le **reste** de
  la durée de transmission (`OPEN_DMX_FRAME_MS` = 23 ms à 250 kbit/s) depuis la fin de
  l'écriture précédente, rien si elle est écoulée (horloge injectable : option `now`). Le
  timing dépend du PC et du pilote : **expérimental**, scintillements possibles.
- Un port resté ouvert (rechargement de page) est refermé puis rouvert automatiquement.
  `describeSerialError(error)` traduit les erreurs Web Serial (`busy` : port pris par QLC+ ou
  le logiciel Enttec, `forbidden`, `disconnected`…) avec un conseil à afficher.
- Après une erreur d'écriture, un débranchement ou à la fermeture, le flux d'écriture est
  libéré (`writer.abort()` jette les octets en file, puis `releaseLock()`) avant
  `port.close()` : sinon la fermeture est refusée (flux verrouillé) et le même port ne peut
  plus être rouvert. `close()` est borné à 1 s (`SERIAL_CLOSE_TIMEOUT_MS`) : une interface
  figée ne bloque pas l'écran. Un port ouvert sans flux d'écriture est refermé aussitôt.
- `getGrantedDmxPort(serial, { match })` retrouve sans clic l'interface déjà autorisée : le même
  port, sinon le même modèle USB, sinon une puce USB-série DMX connue (`DMX_USB_VENDOR_IDS`),
  sinon rien ; jamais un autre port série (Arduino des buzzers…) quand `match` est donné.
- `watchDmxPortReconnection({ onReconnect })` prévient quand l'interface est rebranchée (même
  port ou même modèle USB) : l'écran peut relancer `setOutput` sans redemander le port.
- `createMeteredOutput(output)` mesure les trames réellement envoyées (Hz mesurés, durée
  moyenne et max d'écriture, échecs) pour l'écran de diagnostic.

## Diagnostic matériel (`lights.diagnostics`)

Pendant un diagnostic, les scènes et les événements de jeu sont suspendus :

- `setChannel(adresse, valeur)` pilote un canal brut. Les canaux d'appareils inconnus sont
  refusés sauf `begin({ allowUnknownChannels: true })` (recherche d'adresse) : **débrancher la
  machine à fumée avant** une recherche sur des canaux inconnus ;
- `setFixture(id, { color, intensity, position, strobe })` règle un appareil configuré ;
- les canaux de **fumée sont toujours refusés** : la fumée se teste uniquement par
  `lights.smoke` (armement, durée max, pause) ;
- `freezeOutput(ms, { confirm: true })` arrête l'envoi des trames (15 s max) pour simuler un
  plantage : l'interface répète la dernière trame et **le relais temporisé doit couper la
  fumée tout seul**. La trame courante (fumée comprise) part juste avant le gel. Double
  confirmation dans l'écran. À la fin du gel, la fumée est **désarmée** ;
- `smoke.stop()`, `smoke.disarm()`, `diagnostics.end()` et l'arrêt d'urgence annulent le gel
  tout de suite ; sans action pendant 10 minutes, le diagnostic se termine et l'ambiance revient ;
- avec le pont Art-Net, le gel passe par le message `hold` du pont (voir « Sorties DMX ») : le
  contrôleur, une fois la trame du gel écrite, appelle `output.hold(ms)` (le pont garde cette
  trame et ignore les suivantes, sans noir) ; le gel est levé (`output.release()`) par l'arrêt
  d'urgence, `smoke.stop()`, `smoke.disarm()` et `diagnostics.end()`. Si le pont ne prend pas le gel
  en compte (trop ancien, refus, délai), le test est annulé, la fumée coupée et désarmée,
  avertissement `output_error`. Un pont sans `hold` dans `features` est refusé avant toute fumée ;

Une sortie passée en erreur (écriture bloquée plus de 500 ms) reprend toute seule après
`OUTPUT_RECOVERY_WRITES` trames noires acceptées d'affilée (avertissement `output_recovered`) ;
la fumée coupée par l'erreur n'est pas relancée.

## Assistant d'installation (`createSetupWizard`)

Modèle pur, piloté par l'écran de salle, pour un centre sans connaissance DMX : navigateur →
buzzers (clavier ou carte manette choisie par son nom) → interface → appareils (adresse libre
proposée par univers, chevauchements refusés, import de la salle 6 pupitres) → test de chaque appareil →
positions des lyres par pupitre (ou import de calibration) → fumée → récapitulatif.
Les étapes lyres et fumée n'apparaissent que si la salle en a. `summary().config` s'enregistre
avec `saveRoomHardwareConfig()` (compte de la salle, `rooms.config`).

### Calage des lyres au clavier

L'étape « lyres » se règle entièrement sans souris (les curseurs restent disponibles). Le modèle
expose le curseur de calage (`getState().calibration` : `targets` = lyre × pupitre dans l'ordre,
`current`) et des opérations pures :

- `nudgePanTilt(position, axe, ±1, fin?)` : pas **grossier** `PAN_TILT_COARSE_STEP` = 1024 (1/64 de
  course, environ 8° sur un pan de 540°) ou **fin** `PAN_TILT_FINE_STEP` = 64 (1/1024, environ
  0,5°). Une seule unité 16 bits (0,008°) ne se voit pas : 64 est le plus petit pas utile à
  l'œil. Bornée à 0..65535.
- `wizard.nudgeDeskPosition(lyre, pupitre, axe, ±1, fin?)` : part de la position enregistrée
  (centre sinon) et l'enregistre.
- `wizard.toggleInvert(lyre, axe)` / `invertFixtureAxis` : bascule `invertPan` / `invertTilt`
  (absent quand faux) **et** inverse (`65535 - valeur`) les positions déjà enregistrées de la lyre
  (pupitres et repos) : le faisceau reste où il est, seul le sens des touches change. La plage
  (`panRange`, `tiltRange`) s'applique après l'inversion et n'est pas touchée.
- `wizard.copyDeskPosition(lyre, de, vers)`.
- `wizard.selectCalibration(cible)` et `wizard.validateCalibration()` : enregistre la position en
  cours (le centre si rien n'a été réglé) puis passe à la cible suivante ; sur la dernière, reste
  dessus et répond `finished: true`.

Raccourcis de l'écran de salle (actifs à cette étape seulement ; sans effet dans un champ de
saisie, avec Ctrl/Alt/Méta, ni sur une touche apprise comme buzzer) : flèches = pan (gauche /
droite) et tilt (haut / bas), `Maj` + flèche = pas fin, `Entrée` = valider et passer au pupitre
suivant, `P` = copier la position du pupitre précédent **de la même lyre** (rien à copier sur le
premier pupitre d'une lyre), `G` / `H` = inverser gauche-droite / haut-bas. Un buzzer du
pupitre en cours valide aussi sa position. Les raccourcis sont aussi suspendus pendant qu'une
fenêtre de confirmation est ouverte.

G, H et P ne font pas partie du mapping de démonstration (chiffres 1-8, Q-R, A-F, Z-V, T-I),
mais le préréglage 6 pupitres (`createSixDeskKeyboardKeymap`) met des buzzers sur G et H : une
touche apprise comme buzzer garde la priorité. L'aide du panneau barre alors la touche
(« occupée par un buzzer ») et quatre boutons font la même chose à la souris ou au doigt :
Inverser pan, Inverser tilt, Copier le précédent, Valider.

Le déplacement au clavier reste dans la plage utile de l'appareil : `panRange` / `tiltRange`, ou
`[65535 - max, 65535 - min]` quand l'axe est inversé (la plage physique s'applique après
l'inversion). Le curseur de calage retient la cible (lyre + pupitre), pas son rang : ajouter ou
retirer une lyre ne la déplace pas.

La fumée n'est enregistrée **active** que si les 4 vérifications humaines sont cochées
(`SMOKE_CHECKS`) : arrêt d'urgence physique, relais temporisé réglé à **10 s maximum**, test de
gel réussi, consignes incendie du site. Changer d'interface oblige à refaire le test de gel.
S'y ajoute la règle relais-ou-case (voir « Sécurité fumée ») : machine sans relais et case
`cutsOnSignalLoss` non cochée = fumée enregistrée désactivée (`smokeDisabled: 'relay_required'`).
Avec la case et sans relais, le relais temporisé n'est pas exigé (`getState().smokeChecksRequired`) et le test de gel est un test guidé de vraie perte de signal.

## Configuration de salle (`rooms.config`, JSONB)

```jsonc
{
  "version": 1,
  "buzzers": {
    "keymap": { "KeyQ": { "desk": 1, "button": "A" } },
    // Facultatif : "keyboard" (défaut) ou carte manette retrouvée par un morceau de son nom.
    "source": { "kind": "gamepad", "match": "BU0836" },
  },
  "lighting": {
    "driver": "usbpro",
    "bridgeUrl": "ws://127.0.0.1:7654", // pilote artnet-bridge uniquement (facultatif)
    // Pilote artnet-bridge (facultatif) : IPv4 d'un réseau local (10/8, 172.16/12, 192.168/16,
    // 169.254/16, 127/8) ; une autre adresse est écartée avec un problème. Pas de port : le pont
    // utilise son `--artnet-port` (un `port` présent dans la config est ignoré).
    "artnet": { "target": "192.168.1.50" },
    "refreshHz": 30,
    "fixtures": [
      { "id": "par1", "name": "PAR pupitre 1", "profileId": "par-rgbw", "address": 1, "desk": 1 },
      {
        "id": "lyre",
        "name": "Lyre",
        "profileId": "moving-head-8",
        "address": 20,
        "deskPositions": { "1": { "pan": 12000, "tilt": 30000 } },
      },
      { "id": "fumee", "name": "Fumée", "profileId": "smoke-relay", "address": 40 },
      // "universe" (0-15, facultatif) : univers DMX de l'appareil ; USB = univers 0 seulement.
      { "id": "fond", "name": "PAR fond", "profileId": "par-rgb", "address": 1, "universe": 1 },
    ],
    "customProfiles": [],
    "deskColors": { "1": { "r": 87, "g": 224, "b": 176 } },
    "bindings": { "round_started": null },
    // Facultatif : scènes de la salle, voir « Show réglable par salle ».
    "scenes": [],
    "smoke": {
      "enabled": true,
      "maxDurationMs": 3000,
      "cooldownMs": 30000,
      "maxLevel": 255,
      "requireConfirmation": true,
      // Facultatif, absent = faux : la machine à fumée DMX (sans relais) coupe seule sur perte de
      // signal. Sans relais (profil « binary »), la fumée reste désactivée si elle n'est pas cochée.
      "cutsOnSignalLoss": false,
    },
  },
}
```

`parseRoomHardwareConfig(room.config)` relit tout de façon tolérante (une config vide `{}` donne
une salle en simulation) et renvoie la config normalisée, les appareils résolus et la liste des
problèmes à afficher (touche en double, adresses qui se chevauchent, profil inconnu…).

## Installer un programme sur une carte Uno (`firmware/`)

Client du chargeur Optiboot d'une carte compatible Arduino Uno, par Web Serial (protocole STK500v1,
écrit pour ce paquet, aucune bibliothèque de téléversement). Bibliothèque seulement : aucun écran
ne l'appelle encore.

- `parseIntelHex(texte)` / `writeIntelHex(image)` : fichier `.hex` ↔ image mémoire (trous à 0xFF,
  somme de contrôle vérifiée ; adresses étendues, fin de fichier avec données et enregistrements
  qui se recouvrent refusés).
- `installFirmware({ port, hex, onBackup, onProgress, signal })` : impulsion DTR, synchronisation
  (115200 bauds, puis une fois 57600 ; `GET_SYNC` espacés de 250 ms, confirmé après 50 ms de
  silence), signature `1E 95 0F`, **sauvegarde de la flash lue deux fois et comparée, puis remise à
  `onBackup` avant toute écriture** (si elle échoue ou si les deux lectures diffèrent, rien n'est
  écrit : `backup_failed`), écriture par pages de 128 octets, relecture, sortie du chargeur. Le
  port doit être fermé : le client l'ouvre. Tant que `onBackup` n'a pas rendu la main (choix d'un
  fichier, téléchargement), un `GET_SYNC` part toutes les 250 ms : sans cela Optiboot sort du
  chargeur après 1 s de silence et relance l'ancien programme.
- **Ordre d'écriture.** Optiboot sort seul du chargeur après 1 s de silence, et lance alors ce que
  la flash contient, y compris à chaque mise sous tension. Pour qu'une écriture interrompue
  (annulation, débranchement, délai, relecture fausse) ne laisse jamais un mélange de l'ancien et
  du nouveau programme, la **page 0 est écrite deux fois** : d'abord une page inerte (`FF CF` =
  `rjmp .-2`, une boucle sur place, puis 0xFF), relue ; puis les pages 1 à n, relues ; la vraie
  page 0 en dernier, relue. Après une erreur, la carte boucle donc sur place, broches en entrée
  (relais retombé), jusqu'à un RESET et une nouvelle installation. Si l'écriture ou la relecture
  de la vraie page 0 échoue (relecture fausse, délai, port perdu, annulation), la page 0 peut être
  fausse : le client réécrit alors la page inerte, au mieux, la relit, puis rend l'erreur
  d'origine. `FirmwareError.inert` dit le résultat : `true` si la page inerte est en place, `false`
  si cette réécriture a échoué aussi (la carte peut lancer un programme faux, A0 comprise : ne pas
  rebrancher la machine à fumée avant une nouvelle installation réussie). Absent pour les autres
  erreurs.
- `restoreFirmware({ port, hex })` réécrit un `.hex` (la sauvegarde téléchargée), dans le même
  ordre. `connectBootloader` (dans le module, pas exporté du paquet) donne le client (`readFlash`,
  `readBackup`, `keepAlive`, `writeFlash`, `leave`, `close`) pour les tests.
- Taille : 32 256 octets au plus ; **30 720 quand la synchronisation a eu lieu à 57600 bauds**
  (anciens chargeurs de 2 Kio : le repli à 57600 est le leur), sinon `too_large`.
- Erreurs `FirmwareError.code` : `no_sync`, `wrong_signature`, `too_large`, `verify_failed` (avec
  `address`), `port_lost`, `port_busy`, `timeout`, `cancelled`, `backup_failed`. Les erreurs de
  lecture passagères de Web Serial (`FramingError`, `BreakError`, `BufferOverrunError`,
  `ParityError`, notamment à la remise à zéro) reprennent la lecture sur `port.readable` ; seule
  une `NetworkError` ou un port sans flux donne `port_lost`.

Limites : Uno et clones avec Optiboot seulement (ATmega328P). Testé contre un émulateur d'Optiboot
(`tests/_helpers/fakeOptiboot.ts` : démarrage sans écoute, mémoire de réception de 2 octets,
adresse qui n'avance qu'avec `LOAD_ADDRESS`, sortie après 1 s de silence) ; **rien n'est prouvé sur
une vraie carte** (remise à zéro par DTR et durée de l'impulsion, débit, pilote USB, comportement
réel de la flash et du chargeur : à voir sur le banc).

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (bug npm 10 sur les peers de vitest 4)
npm run lint
npm run format:check
npm run type-check
npm test             # npm run test:coverage : seuils 90 % lignes / 85 % branches
```
