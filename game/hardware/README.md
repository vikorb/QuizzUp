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
  (environ 8 ms, sondage à 125 Hz), hors de portée du logiciel.
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

Web Serial n'existe que dans **Chrome et Edge**, en contexte sécurisé (HTTPS ou localhost).
Art-Net (réseau) est impossible depuis un navigateur (pas d'UDP) : le pilote `artnet-bridge`
passe par un petit pont local à installer sur le PC de la salle, **seulement** si elle possède
déjà un nœud Art-Net (voir `game/artnet-bridge/README.md` ; l'USB-DMX reste recommandé).

```ts
import { createBridgeOutput, DEFAULT_BRIDGE_URL } from '@quizzup/hardware'

// Bouton « Connecter le pont Art-Net » (geste utilisateur : Chrome peut demander l'accès au réseau local)
await lights.setOutput(createBridgeOutput({ url: config.lighting.bridgeUrl ?? DEFAULT_BRIDGE_URL }))
```

`createBridgeOutput` ouvre `ws://127.0.0.1:<port>`, vérifie le pont (`hello` / `ack`, délai
`openTimeoutMs`), envoie chaque univers en trame binaire de 515 octets (version, univers, 512
canaux), saute une trame si la socket est encore pleine (`bufferedAmount`, jamais de retard
accumulé) et signale une coupure par `onDisconnect` (le contrôleur coupe alors la fumée). Côté
pont, un chien de garde envoie du noir si le navigateur se tait plus de 2,5 s.

### Profils d'appareils

Profils génériques (`GENERIC_PROFILES`) : PAR RGB, RGBW, gradateur + RGB, gradateur + RGBW +
strobe, gradateur simple, stroboscope, lyre 8 canaux (pan/tilt 16 bits), fumée DMX, fumée sur
relais (tout ou rien). Un appareil absent de la liste se décrit avec un **profil sur mesure**
(`lighting.customProfiles`) : liste ordonnée de rôles de canaux (`dimmer`, `red`, `pan`,
`smoke`, `fixed` avec une valeur…).

Un appareil peut être **dédié à un pupitre** (`desk`) et une lyre peut avoir une **position
enregistrée par pupitre** (`deskPositions`) : « spot sur le pupitre qui a buzzé ».

### Événements de jeu → scènes

Les noms sont ceux du moteur `@quizzup/game-engine`. Le pupitre vient de `payload.desk` s'il
est fourni, sinon de `payload.participantId` via `resolveDesk`.

| Événement moteur                                       | Scène par défaut                  |
| ------------------------------------------------------ | --------------------------------- |
| `game_started`                                         | `game-start`                      |
| `round_started`                                        | `round-start`                     |
| `round_chooser_selected`                               | `chooser` (spot pupitre)          |
| `question_started`                                     | `question`                        |
| `blind_test_stage_started`, `blind_test_stage_resumed` | `clip-playing`                    |
| `buzzer_pressed`                                       | `buzz` (spot pupitre)             |
| `answer_correct` / `answer_wrong`                      | `answer-correct` / `answer-wrong` |
| `question_ended` sans gagnant                          | `question-lost`                   |
| `round_ended`                                          | `round-end`                       |
| `game_ended` (un seul gagnant → spot sur son pupitre)  | `victory` (+ fumée si armée)      |
| `game_aborted`                                         | `idle`                            |

Chaque salle peut surcharger une liaison (`lighting.bindings`, `null` pour la couper). Une scène
moins prioritaire n'interrompt pas la scène en cours (un extrait qui reprend ne coupe pas
l'effet « bonne réponse »). Couleurs : DA néon du backoffice, une couleur par pupitre.

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
- **arrêt d'urgence logiciel** (`lights.emergencyStop()`) : noir complet, fumée coupée et
  verrouillée ; `resetEmergency()` rallume l'ambiance ; la fumée reste désarmée et doit toujours être
  réarmée à la main, même si la salle n'exige pas de confirmation.

> ⚠️ **Obligatoire en salle** : un **arrêt d'urgence physique** qui coupe l'alimentation de la
> machine à fumée et des lumières. Le bouton logiciel ne suffit pas : si le PC ou le navigateur
> plante, plus aucune trame n'est envoyée.
>
> **Montage retenu** : la fumée passe par un **relais DMX** suivi d'un **relais temporisé
> physique réglé à 10 s maximum**. Une interface DMX USB Pro répète la dernière trame reçue :
> si le PC plante pendant une émission, seul le relais temporisé coupe la fumée. Vérifier ce
> montage avec le test de gel du diagnostic.

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
- avec le pont Art-Net, le test de gel est refusé par l'écran : le pont envoie lui-même du noir
  quand le navigateur se tait, le relais ne serait pas vérifié.

Une sortie passée en erreur (écriture bloquée plus de 500 ms) reprend toute seule après
`OUTPUT_RECOVERY_WRITES` trames noires acceptées d'affilée (avertissement `output_recovered`) ;
la fumée coupée par l'erreur n'est pas relancée.

## Assistant d'installation (`createSetupWizard`)

Modèle pur, piloté par l'écran de salle, pour un centre sans connaissance DMX : navigateur →
buzzers (clavier ou carte manette choisie par son nom) → interface → appareils (adresse libre
proposée, chevauchements refusés, import de la salle 6 pupitres) → test de chaque appareil →
positions des lyres par pupitre (ou import de calibration) → fumée → récapitulatif.
Les étapes lyres et fumée n'apparaissent que si la salle en a. `summary().config` s'enregistre
avec `saveRoomHardwareConfig()` (compte de la salle, `rooms.config`).

La fumée n'est enregistrée **active** que si les 4 vérifications humaines sont cochées
(`SMOKE_CHECKS`) : arrêt d'urgence physique, relais temporisé réglé à **10 s maximum**, test de
gel réussi, consignes incendie du site. Changer d'interface oblige à refaire le test de gel.

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
    ],
    "customProfiles": [],
    "deskColors": { "1": { "r": 87, "g": 224, "b": 176 } },
    "bindings": { "round_started": null },
    "smoke": {
      "enabled": true,
      "maxDurationMs": 3000,
      "cooldownMs": 30000,
      "maxLevel": 255,
      "requireConfirmation": true,
    },
  },
}
```

`parseRoomHardwareConfig(room.config)` relit tout de façon tolérante (une config vide `{}` donne
une salle en simulation) et renvoie la config normalisée, les appareils résolus et la liste des
problèmes à afficher (touche en double, adresses qui se chevauchent, profil inconnu…).

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (bug npm 10 sur les peers de vitest 4)
npm run lint
npm run format:check
npm run type-check
npm test             # npm run test:coverage : seuils 90 % lignes / 85 % branches
```
