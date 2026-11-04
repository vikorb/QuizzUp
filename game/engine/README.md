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

## Intégration côté hôte (écran de salle, audio, matériel)

Le moteur ne joue aucun son et ne pilote aucun matériel : l'hôte **réagit aux événements**
renvoyés par `reduceGame` et lit `state.phase` pour l'affichage.

| Événement                                     | Payload principal                                                | Réaction attendue de l'hôte                                                  |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `game_started`                                | —                                                                | écran d'accueil → partie, ambiance lumière                                   |
| `round_started`                               | `position`, `miniGame`                                           | annonce du mini-jeu                                                          |
| `round_chooser_selected`                      | `participantId`, `reason`                                        | mettre en avant le pupitre qui choisit                                       |
| `round_themes_offered`                        | `themeIds`                                                       | afficher les 4 thèmes (A-D)                                                  |
| `round_theme_selected`                        | `themeId`, `participantId`, `automatic`                          | thème retenu                                                                 |
| `question_started`                            | `questionId`, `questionIndex`, `miniGame`                        | afficher la question et les réponses                                         |
| `blind_test_stage_started`                    | `stage`, `extractMs`, `buzzWindowMs`, `mediaUrl`, `mediaStartMs` | **jouer l'extrait** de `extractMs` depuis `mediaStartMs`                     |
| `buzzer_pressed`                              | `participantId`, `stage`                                         | lumière/son du pupitre qui a buzzé                                           |
| `blind_test_paused`                           | `elapsedMs`                                                      | **couper l'audio**, attendre la réponse A-D                                  |
| `blind_test_stage_resumed`                    | `stage`, `elapsedMs`, `remainingMs`                              | reprendre la fenêtre de buzz (audio déjà terminé si `elapsedMs ≥ extractMs`) |
| `answer_correct` / `answer_wrong`             | `participantId`, `answerId`, `timedOut`                          | effet bonne / mauvaise réponse                                               |
| `points_awarded`                              | `participantId`, `points`, `total`                               | animation de score                                                           |
| `question_ended`                              | `questionId`, `winnerIds`                                        | phase `reveal` : afficher la bonne réponse                                   |
| `round_ended` / `game_ended` / `game_aborted` | classement, raison                                               | récap, podium final, effets de fin (fumée…)                                  |

Règles d'intégration :

- **Horloge** : `at` en millisecondes monotones (`performance.now()`) ; l'hôte envoie un `tick`
  régulier (≈ 50-100 ms) pour faire avancer les délais.
  Une commande dont `at` n'est pas un nombre fini est ignorée ; un `tick` antérieur au dernier
  `at` est ignoré ; un appui antérieur est ramené au dernier `at` (temps de réponse ≥ 0, arrondis
  à la milliseconde pour `game_answers.response_time_ms`).
- **Échéances** : elles passent avant l'appui reçu au même instant (un buzz pile à la fin du
  palier 1 compte au palier 2).
- **Graine** : entier de 0 à 2³² − 1 (`MAX_SEED`), à générer côté API et stocker dans `games.seed`.
- **Réponses** : l'ordre A-D est mélangé avec la graine au tirage de la manche ; l'hôte affiche
  `state.rounds[].questions[].answers` dans l'ordre de l'état.
- **Buzzers** : l'hôte traduit une touche clavier en `{ podium: 1-4, button: 0-3 }` (0 = A) et
  envoie `press`. Le moteur décide seul si l'appui compte (buzz, réponse, choix de thème).
- **Persistance** : `game_events` ne suffit pas à rejouer une partie ; pour `replayGame`, l'hôte
  doit aussi journaliser la `seed` et les commandes reçues (ticks compris).
- Les payloads exacts sont dans `src/engine.ts` et `src/miniGames/flashBlindTest.ts`.

## Mini-jeux

Un mini-jeu implémente `MiniGameDefinition` (`src/miniGames/miniGame.ts`) et s'enregistre dans
`src/miniGames/index.ts`. V1 : **blind test éclair** — extraits de 1 s, 5 s puis 20 s, premier
qui buzze répond seul, 100 / 50 / 20 points, pas de pénalité. Tout le monde joue en même temps ;
un joueur qui se trompe est bloqué pour le reste du palier. On ne passe au palier suivant (verrous
remis à zéro) que si personne n'a trouvé.

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (bug npm 10 sur les peers de vitest 4)
npm run lint
npm run format:check
npm run type-check
npm test             # npm run test:coverage : seuils 90 % lignes / 85 % branches
```
