---
paths:
  - "game/engine/**"
---

# Moteur de jeu (`@quizzup/game-engine`)

- **Pur et déterministe.** Aucun `Date.now()`, `Math.random()`, minuterie, accès réseau, DOM ou
  stockage dans `src/`. Le temps arrive par les `tick` et les horodatages passés en argument ; le
  hasard par le générateur à graine de `random.ts`. Une partie se rejoue à l'identique avec sa
  graine : un test qui dépend de l'heure ou de l'ordre d'exécution est un bug.
- **L'autorité est locale.** Le moteur tourne dans le navigateur de la salle et juge les buzzers à
  la milliseconde. Rien dans le moteur n'attend une réponse du serveur.
- **Un mini-jeu = un module** dans `src/miniGames/` qui implémente `MiniGameDefinition`
  (`miniGame.ts`), enregistré dans `MINI_GAME_DEFINITIONS` (`index.ts`). Le cœur (`engine.ts`,
  `draws.ts`) ne connaît aucun mini-jeu par son nom. Marche à suivre : `/nouveau-mini-jeu`.
- **Contrats avec `@quizzup/shared`** : les identifiants de mini-jeu et les préfixes de fourchette
  d'estimation (`RANGE_PREFIX`) viennent de `shared` ou y sont vérifiés par un test de contrat. Ne
  recopie pas une valeur.
- **État sérialisable** : l'état d'une partie est sauvegardé et repris après un rechargement de la
  page. Pas de fonction, de `Map`, de `Set` ni de `Date` dans l'état.
- **Couverture** : seuils 90 / 90 / 85 / 90 (lignes, fonctions, branches, instructions),
  `npm run test:coverage`. Chaque règle de score a ses cas limites testés : égalité, score qui ne
  passe jamais sous zéro, joueur seul, dernier palier.
- Les noms, visuels et textes des mini-jeux sont les nôtres. On ne reprend ni les noms de manches ni
  les contenus d'un concurrent.
