---
name: lot
description: Mène un lot de développement de bout en bout selon la méthode du projet - issue, branche, brief borné, sous-agent développeur, vérification, PR, relecture indépendante, CI, merge, reprise. À utiliser dès qu'on démarre une fonctionnalité, une correction ou un chantier.
argument-hint: "<numéro d'issue ou description courte du lot>"
disable-model-invocation: true
---

# Mener un lot : $ARGUMENTS

Tu es le **coordinateur**. Tu découpes, tu délègues, tu vérifies, tu pilotes git. Tu n'écris pas
toi-même le code du lot (`CLAUDE.md` §4.1).

## 1. Cadrer

- Relis `docs/REPRISE.md` (état, pièges) et le lot concerné dans `docs/cadrage/`.
- Trouve ou crée l'issue GitHub (`gh issue list`, `gh issue create`) : besoin, critères
  d'acceptation vérifiables, ce qui est hors périmètre.
- Si le lot touche la sécurité, la fumée, les données personnelles ou une décision produit non
  tranchée : pose la question avant de coder. Sinon, avance.
- Un lot trop gros pour une PR lisible (plus de 600 lignes hors tests, ou plus d'un paquet métier)
  se découpe. Conception d'abord par l'agent `architecte` si le découpage n'est pas évident.

## 2. Brancher

```bash
git fetch origin && git switch -c <type>/<sujet-court> origin/main
```

`<type>` : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.

## 3. Briefer le développeur

Un agent `developpeur` par tâche indépendante (`model: sonnet`, `effort: high`). Le brief tient en
une page :

```
Objectif        : ce qui doit être vrai à la fin, en une phrase.
Contexte        : issue, décisions déjà prises, fichiers à lire d'abord (chemins exacts).
Périmètre       : fichiers ou dossiers à modifier.
Hors périmètre  : ce qu'il ne faut pas toucher.
Attendu         : comportements, cas limites, erreurs, textes fr et en.
Tests           : ceux qui doivent exister à la fin (unitaire, route, composant, bout en bout).
Doc             : OpenAPI, DBML, .env.example, README, selon ce qui change.
Contrôles       : commandes de /verifier pour les paquets touchés.
Fin             : critère d'arrêt ; ne pas commiter, ne pas pousser ; rapport en 5 points.
```

Pour chercher une information, l'agent `lecteur` (Haiku). Deux développeurs en parallèle seulement
s'ils ne touchent pas aux mêmes fichiers. Un agent qui tourne en rond est arrêté et rebriefé
autrement, jamais relancé à l'identique.

## 4. Vérifier soi-même

- Lis le diff en entier (`git diff`). Rien hors périmètre, pas de test affaibli, pas de seuil
  baissé, pas de fichier oublié.
- Lance `/verifier`. Tout est vert, ou le lot retourne au développeur avec la sortie exacte.
- Pour un écran : regarde-le vraiment (navigateur, 1280 px et 768 px). Pour le matériel : note ce
  qui reste à valider sur le banc.

## 5. Commit, PR

- Conventional Commits, en français, un commit par intention : `feat(room-app): …`.
- `git push -u origin <branche>` puis `gh pr create` : ce qui change, pourquoi, comment tester, ce
  qui n'est pas vérifié (matériel réel, navigateur non testé).

## 6. Relecture et merge

1. **Un seul** agent `relecteur` (`model: opus`), sans lui donner tes conclusions : la PR, l'issue,
   les règles.
2. Corrections par le développeur (rebriefé avec les constats), puis `/verifier` à nouveau.
3. CI GitHub verte (`gh pr checks <n> --watch`).
4. Merge par commit de merge : `gh pr merge <n> --merge --delete-branch`.

## 7. Après le merge

- Lire le pipeline GitLab de `main` (Sonar, Lighthouse, audit des dépendances) quand l'accès est
  disponible ; une alerte nouvelle devient un correctif immédiat, pas une dette.
- Mettre à jour `docs/REPRISE.md` (état, lots, pièges découverts) et le `CHANGELOG` concerné.
- Fermer ou compléter l'issue. Dire à l'utilisateur ce qui est fait, ce qui est vérifié, et ce qui
  ne l'est pas.
