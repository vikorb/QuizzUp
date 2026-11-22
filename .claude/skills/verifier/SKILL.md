---
name: verifier
description: Lance les contrôles qualité (lint, format, types, tests, couverture, build) des paquets touchés par la branche courante, comme le fait la CI GitHub. À utiliser avant tout commit de lot, avant une PR, et pour vérifier le travail d'un sous-agent.
argument-hint: "[paquet …] (vide = paquets touchés par la branche)"
---

# Vérifier avant de proposer

But : ne jamais pousser quelque chose que la CI refusera, et ne jamais écrire « vert » sans l'avoir
vu.

## 1. Quels paquets

Si `$ARGUMENTS` nomme des paquets, vérifie ceux-là. Sinon, déduis-les des fichiers modifiés :

```bash
git diff --name-only origin/main...HEAD; git status --short
```

Un changement dans `backoffice/shared` impose de vérifier **tout** : le moteur, l'écran de salle et
le backoffice lisent ses constantes.

## 2. Commandes par paquet

Depuis le dossier du paquet. Tout doit passer ; aucun avertissement nouveau.

| Fichiers touchés          | Dossier              | Commandes                                                                                   |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `backoffice/shared/**`    | `backoffice/shared`  | `npm run build` (à faire **avant** le reste)                                                |
| `backoffice/**`           | `backoffice`         | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm test`                 |
| `backoffice/frontend/**`  | `backoffice/frontend`| `npm run build` · `npm run knip` si des fichiers ont été supprimés ou déplacés              |
| `game/engine/**`          | `game/engine`        | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm run test:coverage`    |
| `game/hardware/**`        | `game/hardware`      | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm run test:coverage`    |
| `game/audio/**`           | `game/audio`         | `npm run type-check` · `npm test`                                                           |
| `game/artnet-bridge/**`   | `game/artnet-bridge` | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm run test:coverage` · `npm run build` (+ `npm run build:sea` si l'empaquetage change) |
| `game/room-app/**`        | `game/room-app`      | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm run test:coverage` · `npm run build` |
| parcours joueur ou salle  | `game/e2e`           | `npm run lint` · `npm run format:check` · `npm run type-check` · `npm test`                 |

L'écran de salle consomme `game/engine`, `game/hardware` et `game/audio` en sources : un changement
dans l'un des trois impose aussi les contrôles de `game/room-app`, et le bout en bout si le
déroulé d'une partie change.

Migrations : la CI joue `migrate:latest`, annule les migrations récentes une à une, puis
`migrate:latest`, sur un PostgreSQL réel.
En local, seulement si une base de test est disponible (nom finissant par `_test`).

## 3. Ce que la CI GitHub ne voit pas

Sonar et Lighthouse tournent sur GitLab, **après** le merge sur `main`. Pour ne pas les découvrir
trop tard :

- pas de duplication, pas de fonction qui grossit sans fin, pas de `any`, pas de code mort, pas de
  `console.log` oublié, pas de secret ni de mot de passe en dur ;
- pour une page visible (vitrine, écran public) : poids des images, texte alternatif, contraste,
  titres dans l'ordre, pas de script bloquant.

## 4. Rapport

Donne la sortie réelle, pas une impression :

- par paquet : commande, résultat, nombre de tests, couverture si elle est mesurée ;
- tout échec avec sa ligne décisive ;
- ce qui n'a **pas** été lancé et pourquoi (dépendances absentes, pas de base de test).

Un contrôle qui échoue se corrige à la cause. Baisser un seuil, ignorer un test ou désactiver une
règle n'est pas une correction.
