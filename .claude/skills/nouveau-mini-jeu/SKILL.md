---
name: nouveau-mini-jeu
description: Liste de contrôle pour ajouter un mini-jeu (une manche) à QuizzUp sans rien oublier - constante partagée, migration, moteur, écran de salle, backoffice, traductions, documentation, tests. À utiliser dès qu'on ajoute, renomme ou retire un mini-jeu.
argument-hint: "<identifiant_snake_case> <règle en une phrase>"
---

# Ajouter un mini-jeu : $ARGUMENTS

Un mini-jeu traverse cinq paquets. Un seul endroit oublié casse la CI (test de schéma) ou, pire,
laisse le jeu choisissable au backoffice mais injouable en salle. Suis l'ordre.

Modèle à copier : un mini-jeu existant proche de la règle voulue (liste dans
`game/engine/README.md`). Avant de coder : la règle écrite en clair, ses cas limites (égalité,
joueur seul, plus de question, temps écoulé) et ce que la salle voit et entend.

## 1. Constante partagée

`backoffice/shared/src/index.ts` : ajouter `MINI_GAME_<NOM>` et l'inscrire dans `MINI_GAMES`. Puis
`cd backoffice/shared && npm run build`.

## 2. Base de données

Nouvelle migration (jamais modifier l'ancienne) qui étend la contrainte `CHECK` de
`game_rounds.mini_game`, avec un `down`. Modèle :
`backoffice/backend/db/migrations/20261104010000_add_mini_games_to_game_rounds.js`. Mettre à jour
`backoffice/docs/db/db.dbml`. Le test `backoffice/tests/backend/src/db/gameSchema.test.ts` compare
la liste de la dernière migration à `MINI_GAMES` : il doit rester vert.

## 3. Moteur (`game/engine`)

- `src/miniGames/<nom>.ts` : un `MiniGameDefinition<TState>` (`id`, `isQuestionEligible`, `start`,
  `tick`, `press`, et selon le besoin `minParticipants`, `arrangeAnswers`, `revealMs`,
  `isRoundOver`). Pur, déterministe, état sérialisable (`.claude/rules/moteur.md`).
- `src/miniGames/index.ts` : import, union `MiniGameState`, registre `MINI_GAME_DEFINITIONS`,
  réexport. Le `satisfies Record<MiniGame, unknown>` refuse de compiler tant qu'il manque.
- Tests : `tests/miniGames/<nom>.test.ts` (règles et cas limites) et
  `tests/miniGames/miniGameRotation.test.ts`. Couverture 90 / 90 / 85 / 90.
- `README.md` du moteur : ligne dans le tableau des règles.

## 4. Écran de salle (`game/room-app`)

- `src/game/miniGameViews.ts` : le mode d'affichage du jeu. Réutiliser un mode existant quand la
  mise en scène est la même ; un nouveau mode seulement si l'écran est réellement différent.
- Nouveau mode : composant dans `src/views/game/`, branché dans `src/views/GameView.vue`.
- `src/locales/{fr,en}/game.json` : nom, consigne, messages.
- Tests : `tests/unit/miniGameViews.test.ts`, `tests/components/MiniGameScreens.test.ts`.
- Lumières et sons : uniquement par les effets existants de `game/hardware` et `game/audio` ; en
  simulation d'abord.

## 5. Backoffice

- `backoffice/frontend/src/locales/{fr,en}/games.json` : libellé et description du jeu. Le
  sélecteur (`GameMiniGamesField.vue`) et la validation (`z.enum(MINI_GAMES)`) suivent la constante
  sans autre changement.
- `backoffice/docs/api/openapi.yaml` : valeur ajoutée à l'énumération.

## 6. Bout en bout

`game/e2e/tests/room-app/mini-games.spec.ts` : une partie qui joue le nouveau jeu jusqu'au score.

## 7. Finir

`/verifier` sur tous les paquets (un changement de `shared` les touche tous). Dans la PR : la règle
du jeu, une capture de l'écran de salle, et ce qui reste à essayer avec de vrais buzzers.

Retirer ou renommer un mini-jeu : mêmes endroits, plus une migration qui traite les parties déjà
enregistrées avec l'ancien identifiant.
