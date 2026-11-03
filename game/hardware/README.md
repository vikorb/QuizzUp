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
| Profils d'appareils génériques                           | `src/dmx/profiles.ts`                            | #64              |
| Appareils de la salle, rendu DMX                         | `src/dmx/fixtures.ts`                            | #64              |
| Sorties Web Serial / simulation                          | `src/dmx/serialOutput.ts`, `simulationOutput.ts` | #64              |
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
- **Horodatage** à la capture, en millisecondes monotones (`performance.now()`), la même base que
  les `at` envoyés au moteur : c'est ce temps qui départage les buzzs.
- **Perte de focus** : `state.focused` / `state.visible` / `state.active`. Quand la page perd le
  focus, plus aucun appui n'arrive : l'écran de salle doit l'afficher en grand.

### Apprentissage

```ts
const learning = createBuzzerLearning() // 4 pupitres × A-D ; { desks: [1, 2] } pour une petite salle
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

| `driver`     | Matériel                                                      | Statut       |
| ------------ | ------------------------------------------------------------- | ------------ |
| `simulation` | aucun ; `getFixtureViews()` alimente la vue « salle simulée » | par défaut   |
| `usbpro`     | interfaces compatibles **DMX USB Pro** (Enttec et clones)     | recommandé   |
| `opendmx`    | interfaces FTDI « Open DMX » sans microcontrôleur             | expérimental |

Web Serial n'existe que dans **Chrome et Edge**, en contexte sécurisé (HTTPS ou localhost).
Art-Net (réseau) est impossible depuis un navigateur : il faudra un pont local optionnel.

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
> **Fortement recommandé** : une interface DMX ou un relais qui **coupe la fumée en cas de perte
> de signal** (beaucoup d'appareils gardent la dernière valeur reçue), ou à défaut une machine à
> fumée avec temporisation matérielle.

## Configuration de salle (`rooms.config`, JSONB)

```jsonc
{
  "version": 1,
  "buzzers": { "keymap": { "KeyQ": { "desk": 1, "button": "A" } } },
  "lighting": {
    "driver": "usbpro",
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
