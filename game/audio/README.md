# @quizzup/audio

Lecture audio de l'**écran de salle** (PWA `game/room-app`) pour le mini-jeu **« blind test
éclair »** (avec effets : inversé, ralenti), les **annonces vocales** et les **sons d'interface**
(buzz, bonne / mauvaise réponse…).

- Aucune règle de jeu ici : les paliers (1 s, 5 s, 20 s…), le point de départ et les
  enchaînements sont décidés par le **moteur de jeu**. Ce paquet joue ce qu'on lui demande.
- Les extraits sont téléchargés et décodés **avant** la manche (`AudioBuffer` en mémoire) :
  lecture hors ligne, sans blanc, au milliseconde près.
- La fin d'un palier est planifiée sur l'**horloge audio** (`source.start(when, offset,
duration)` + `onended`), jamais avec `setTimeout`.
- Les sons d'interface sont **synthétisés** (oscillateurs Web Audio) : aucun fichier, aucun
  souci de droits.

## API

```ts
import { UiSoundPlayer, WebAudioExtractPlayer } from '@quizzup/audio'

const player = new WebAudioExtractPlayer({ fadeMs: 15, volume: 1 })
```

| Méthode                                | Rôle                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unlock()`                             | À appeler **dans le clic** « Lancer la salle » (politique autoplay) : crée / reprend l'`AudioContext`.                                                                                |
| `preload(urls, options?)`              | Télécharge + décode. Ne rejette jamais : `{ loaded, failed }`. Ne recharge pas une URL déjà décodée.                                                                                  |
| `play(url, startSec, durMs, options?)` | Joue `durMs` depuis `startSec`. Résout `'ended'` à la fin exacte (ou à la fin du fichier), `'stopped'` si interrompu. `options` : effet et reprise, voir « Effets sur les extraits ». |
| `duck(factor, rampMs)`                 | Atténue les extraits (`factor` < 1) ou les rétablit (`1`) par une rampe sur le gain maître ; ne touche pas à `setVolume`.                                                             |
| `pause()`                              | Met en pause, renvoie les ms déjà jouées dans le palier (0 si rien ne joue). La promesse de `play` reste en attente.                                                                  |
| `resume()`                             | Reprend exactement là où on était, pour le temps restant du palier.                                                                                                                   |
| `stop()`                               | Arrête et résout la promesse en cours en `'stopped'`.                                                                                                                                 |
| `isLoaded(url)` / `release()`          | État du cache / libération des buffers (tous si pas d'argument).                                                                                                                      |
| `setVolume(v)` / `getVolume()`         | Volume général entre 0 et 1.                                                                                                                                                          |
| `getContext()`                         | L'`AudioContext` partagé (pour `UiSoundPlayer`).                                                                                                                                      |

Options de `preload` : `fetch` (injectable, voir plus bas), `onProgress(done, total)`,
`concurrency` (défaut 3). Le `fetch` passé à `preload` sert aussi aux chargements à la volée de
`play()` sur une URL non préchargée.

Cas limites : `startSec` négatif ou `NaN` → 0 ; `durationMs <= 0` → `'ended'` immédiat ; un
nouveau `play()` interrompt le précédent (`'stopped'`) ; `stop()` pendant une pause → `'stopped'` ;
`pause()` / `resume()` sans lecture ne font rien. Si le **chargement à la volée** échoue, la
promesse de `play()` est **rejetée** (préférer `preload` pour gérer les échecs en amont).

AudioContext : `unlock()` **doit avoir été appelé dans un geste utilisateur** (clic, touche),
sinon le navigateur laisse le contexte `suspended` et l'horloge audio reste figée. Si le
contexte est encore `suspended` au moment de `play()`, le lecteur tente `resume()` ; si la
reprise échoue, ou si elle n'aboutit pas dans `resumeTimeoutMs` (2 s par défaut, option du
constructeur), la promesse est **rejetée**. Sur un contexte `closed`, `play()` rejette avec
une erreur explicite et `unlock()` recrée un contexte neuf (palier en cours `'stopped'`,
buffers conservés). Une `pause()` qui tombe après la fin réelle du palier (avant la livraison
d'`onended`) le termine en `'ended'` et renvoie sa durée totale.

## Usage côté room-app

```ts
import { UiSoundPlayer, WebAudioExtractPlayer } from '@quizzup/audio'

const extracts = new WebAudioExtractPlayer()
const sounds = UiSoundPlayer.sharing(extracts) // même AudioContext

// 1. Dans le gestionnaire du clic « Lancer la salle »
await extracts.unlock()

// 2. Avant la manche : précharger les médias via le backoffice (route authentifiée)
const authFetch = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` } })

const urls = questions.map((q) => `${API_URL}/questions/${q.id}/media`)
const { failed } = await extracts.preload(urls, {
  fetch: authFetch,
  onProgress: (done, total) => (progress.value = done / total),
})
// `failed` : questions à écarter ou à signaler à l'animateur.
```

### Séquence de paliers (pilotée par le moteur)

Le moteur envoie, pour chaque palier, l'URL, le point de départ et la durée ; la room-app relaie :

```ts
// moteur → « joue le palier »  { url, startSec: 42, durationMs: 1000 | 5000 | 20000 }
const outcome = await extracts.play(url, startSec, durationMs)
if (outcome === 'ended') notifyEngine('tier_ended') // le moteur décide du palier suivant

// moteur → « un joueur a buzzé »
sounds.play('buzz')
const playedMs = extracts.pause() // à remonter au moteur si utile

// moteur → « mauvaise réponse, on reprend » / « bonne réponse »
sounds.play('wrong')
extracts.resume() // la même promesse `play` se résout ensuite en 'ended'
// ou
sounds.play('correct')
extracts.stop() // la promesse `play` se résout en 'stopped'

// fin de manche
extracts.release()
```

## Effets sur les extraits

`play(url, startSec, durationMs, { effect?, elapsedMs? })`. Sans `options`, le comportement est
exactement celui d'avant. Un effet ne change que ce qui est joué : aucun téléchargement, aucune
écriture.

| Effet     | Ce que fait le lecteur                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `none`    | Lecture normale.                                                                                                      |
| `short`   | Rien : ce sont les paliers, raccourcis par le moteur, qui changent. Joué comme `none`.                                |
| `reverse` | Copie la fenêtre du palier `[startSec, startSec + durée]` à l'envers (quelques ms) et la lit depuis son début.        |
| `slowed`  | `playbackRate = SLOWED_PLAYBACK_RATE` (0,75) : plus lent **et** plus grave (environ −5 demi-tons), Web Audio les lie. |

La liste `EXTRACT_EFFECTS` est ici pour l'instant ; elle migrera dans `@quizzup/shared` si le
backoffice doit la lire.

- **Temps réel partout.** `durationMs`, la valeur renvoyée par `pause()` et `elapsedMs` sont du
  temps d'horloge, comme pour le moteur. Le lecteur convertit : avec `slowed`, la position dans le
  fichier avance de 0,75 s par seconde, et la fin du fichier arrive donc plus tard qu'à vitesse
  normale (reste de fichier ÷ 0,75).
- **Reprise après pause** : `resume()` repart à `startSec + écoulé × 0,75` (`slowed`), à
  `écoulé` dans la fenêtre inversée (`reverse`, déjà construite, pas recopiée), à
  `startSec + écoulé` sinon.
- **`elapsedMs`** : temps déjà joué dans le palier (reprise après rechargement de la page). À la
  place de `startSec + écoulé`, faux dès qu'un effet est actif. Invalide ou négatif : 0 ; au moins
  égal au palier : `'ended'` tout de suite.
- **`reverse` et paliers** : chaque palier inverse sa propre fenêtre. Le palier 2 (5 s) se termine
  donc sur le contenu du palier 1 (1 s), lu à l'envers. Comportement voulu.
- Un effet inconnu est joué comme `none`.

## Atténuation et annonces vocales

`AnnouncerPlayer` joue les annonces du présentateur (« Manche trois », « Bonne réponse »…).
**Aucun fichier de voix n'est dans le dépôt** : tant que le pack manque, tout est muet.

```ts
import { AnnouncerPlayer, WebAudioExtractPlayer } from '@quizzup/audio'

const extracts = new WebAudioExtractPlayer()
const announcer = AnnouncerPlayer.sharing(extracts) // même AudioContext + atténuation des extraits

await announcer.preload('fr') // manifeste + clips, ne rejette jamais
announcer.say('round.3') // ne lève jamais d'erreur
announcer.say('game.winner.desk.2', { priority: 1 }) // coupe l'annonce en cours
```

- **Manifeste** `/announcer/manifest.json` (URL injectable : option `manifestUrl`) :
  `{ "version": 3, "fr": { "round.1": 1500 }, "en": { … } }` (identifiant → durée en ms). Le clip
  `<id>` est cherché dans `<dossier du manifeste>/<lang>/<id>.mp3?v=<version>`, sans jeton. `preload`
  renvoie `{ loaded, failed }` (ids) ; un `preload` plus récent remplace le précédent.
- **File** : une annonce qui parle, `ANNOUNCER_QUEUE_MAX` = 2 en attente (au-delà, la plus
  ancienne est abandonnée). Doublon (en cours ou en attente) ignoré. Une priorité **plus haute**
  que l'annonce en cours la coupe (fondu de 20 ms) et vide la file ; sinon l'annonce attend son
  tour.
- **Annonce périmée** : une annonce qui a attendu plus de `maxWaitMs` (défaut
  `ANNOUNCER_MAX_WAIT_MS` = 4 s) quand vient son tour est abandonnée, jamais jouée en retard. L'attente
  se mesure sur l'horloge audio.
- **Atténuation** : au début d'une annonce, `duck(0.3, 80)` sur le lecteur d'extraits ; quand la file
  est vide (ou en cas d'échec, ou après `stop()`), retour à `duck(1, 300)`. Le volume réglé n'est
  jamais modifié.
- **Repli silencieux** : manifeste absent ou invalide, clip manquant ou non décodable, contexte
  `suspended` ou `closed` (aucun `resume()` tenté : l'annonce sortirait en retard), clip inconnu, échec
  d'un nœud audio ou de l'atténuation : rien n'est levé, rien ne bloque, la partie continue sans
  voix. Un contexte figé en pleine annonce est détecté au `say()` suivant, qui remet la file à zéro.
- `stop()` coupe l'annonce et vide la file ; `has(id)` dit si un clip est prêt ; `setVolume(v)`
  règle le volume des annonces.

## Sons d'interface

`UiSoundPlayer#play(name)` avec `name` parmi `buzz`, `correct`, `wrong`, `lostForAll`, `tick`,
`tierUp`, `reveal`. Chaque son est une courte séquence de notes (< 1,2 s) décrite en données dans
`UI_SOUND_PRESETS` (`atMs`, `durationMs`, `freq`, `slideTo?`, `wave`, `gain`, `attackMs`,
`releaseMs`) : pour retoucher un son, modifier ce tableau. `uiSoundDurationMs(name)` donne sa
durée totale.

## Développement

```bash
npm install
npm test            # vitest --run (faux AudioContext maison, horloge contrôlable)
npm run type-check  # tsc --noEmit
```

Formatage : Prettier avec la config du backoffice
(`../../backoffice/node_modules/.bin/prettier --config ../../backoffice/.prettierrc.json --check .`).

> Note : avec le `package-lock.json` présent, `npm ci` / `npm install` fonctionnent avec npm 10.
> Pour **régénérer** le lock, npm 10 (fourni avec Node 22) échoue
> (`Cannot read properties of null (reading 'edgesOut')`, bug d'arborist sur les peer deps de
> vitest 4) : utiliser npm ≥ 11 (`npx npm@11 install`).
