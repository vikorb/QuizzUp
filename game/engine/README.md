# @quizzup/game-engine

Moteur de jeu de QuizzUp (US-ENGINE-01, US-MINIGAME-01).

- **Pur et déterministe** : aucune horloge, aucun accès réseau ou matériel. L'hôte (l'écran de
  salle) envoie des commandes horodatées et récupère un nouvel état + des événements.
- **Rejouable** : tout le hasard vient d'une graine (`games.seed`). Même graine + mêmes
  commandes = même partie (`replayGame`).
- **Consommé en sources** : pas de build, les applications l'importent via un alias TypeScript /
  Vite (comme `@quizzup/shared` dans les tests du backoffice).

## Utilisation

```ts
import { createGame, reduceGame } from '@quizzup/game-engine'

let state = createGame({ seed, participants, themes }) // 10 manches × 10 questions par défaut
;({ state, events } = reduceGame(state, { type: 'start', at: performance.now() }))
// boucle de l'hôte : tick régulier + appuis buzzers
;({ state, events } = reduceGame(state, { type: 'tick', at }))
;({ state, events } = reduceGame(state, { type: 'press', at, podium: 2, button: 0 })) // 0 = A
```

Les `events` (numérotés par `seq`) sont destinés à `game_events` ; `state.rounds[].answers` à
`game_answers` ; `state.rounds[]` (thème, chooser, snapshot des questions) à `game_rounds`.

## Déroulé d'une manche

1. `round_intro` : annonce du mini-jeu tiré au sort (pas deux fois le même d'affilée si possible).
2. `theme_choice` : 4 thèmes proposés (jamais joués d'abord), un joueur désigné (manche 1 au
   hasard, ensuite au hasard hors leader(s), repli si égalité générale) choisit avec A-D. Sans
   choix dans le temps imparti, tirage automatique.
3. `question` × N : le mini-jeu gère la question ; puis `reveal` (bonne réponse affichée).
4. `round_summary`, puis manche suivante ou `finished`.

## Mini-jeux

Un mini-jeu implémente `MiniGameDefinition` (`src/miniGames/miniGame.ts`) et s'enregistre dans
`src/miniGames/index.ts`. V1 : **blind test éclair** — extraits de 1 s, 5 s puis 20 s, premier
qui buzze répond seul, 100 / 50 / 20 points, pas de pénalité, joueur bloqué après une erreur.

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (bug npm 10 sur les peers de vitest 4)
npm run lint
npm run format:check
npm run type-check
npm test             # npm run test:coverage : seuils 90 % lignes / 85 % branches
```
