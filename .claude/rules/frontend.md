---
paths:
  - "backoffice/frontend/**"
  - "game/room-app/**"
---

# Frontend (Vue 3, Vite, TypeScript)

- **Pas de bibliothèque de composants ni de gestionnaire d'état externe.** Dépendances du
  backoffice : `vue`, `vue-router`, `vue-i18n`, `@mdi/js`. On compose avec les composants maison de
  `src/components/ui` (voir `backoffice/docs/design/design-system.md` §4). Avant de créer un
  composant, cherche celui qui existe.
- **Trois états pour tout écran qui charge des données** : chargement, erreur, vide. Un écran qui
  n'affiche rien pendant un appel ou après un échec n'est pas fini.
- **Erreurs d'API** : le serveur renvoie un code stable ; l'écran affiche la traduction de ce code,
  jamais le message brut.
- **i18n** : aucun texte en dur dans un gabarit. Clés `fr` **et** `en` dans la même PR. Un `@` dans
  un texte s'écrit `{'@'}` (sinon la page plante ; un test compile toutes les locales).
- **Constantes** : rôles, statuts, portées, mini-jeux viennent de `@quizzup/shared`.
- **Écran de salle** (`game/room-app`) : il tourne des heures en plein écran sur un PC de salle.
  Pas de fuite (écouteurs et minuteries retirés au démontage), pas de dépendance au réseau pendant
  une partie, clavier seul suffisant (les buzzers sont des touches). La charte vient du backoffice.
- **Tests** : backoffice dans `backoffice/tests/frontend/src` (mocks dans `_helpers`) ; écran de
  salle dans `game/room-app/tests`. Un test qui attend une navigation précharge les écrans paresseux
  depuis `routes`.
- **Code mort** : `npm run knip` dans `backoffice/frontend` avant une PR qui supprime ou déplace des
  fichiers.
- Le style et l'aspect suivent `.claude/rules/design.md`.
