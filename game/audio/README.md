# @quizzup/audio

Lecture audio de l'**écran de salle** (PWA `game/room-app`) pour le mini-jeu **« blind test
éclair »**, plus les **sons d'interface** (buzz, bonne / mauvaise réponse…).

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

| Méthode                        | Rôle                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `unlock()`                     | À appeler **dans le clic** « Lancer la salle » (politique autoplay) : crée / reprend l'`AudioContext`.                |
| `preload(urls, options?)`      | Télécharge + décode. Ne rejette jamais : `{ loaded, failed }`. Ne recharge pas une URL déjà décodée.                  |
| `play(url, startSec, durMs)`   | Joue `durMs` depuis `startSec`. Résout `'ended'` à la fin exacte (ou à la fin du fichier), `'stopped'` si interrompu. |
| `pause()`                      | Met en pause, renvoie les ms déjà jouées dans le palier (0 si rien ne joue). La promesse de `play` reste en attente.  |
| `resume()`                     | Reprend exactement là où on était, pour le temps restant du palier.                                                   |
| `stop()`                       | Arrête et résout la promesse en cours en `'stopped'`.                                                                 |
| `isLoaded(url)` / `release()`  | État du cache / libération des buffers (tous si pas d'argument).                                                      |
| `setVolume(v)` / `getVolume()` | Volume général entre 0 et 1.                                                                                          |
| `getContext()`                 | L'`AudioContext` partagé (pour `UiSoundPlayer`).                                                                      |

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
reprise échoue, la promesse est **rejetée**. Sur un contexte `closed`, `play()` rejette avec
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
