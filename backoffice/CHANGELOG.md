# CHANGELOG.md

Toutes les modifications notables du projet QuizzUp Backoffice sont documentées ici.

Format inspiré de Keep a Changelog.

## [Unreleased]

### Added

- Catalogue de la salle (`GET /room/games/current/content`) limité aux questions audio actives
  avec fichier, et lecture des extraits par le compte de salle
  (`GET /room/questions/{questionId}/media`) pendant une partie.
  US: us-game-08, us-media-01

- Mise en place de l'authentification administrateur.
  US: us-auth-01

- Ajout de la gestion des sessions administrateur.
  US: us-auth-02

- Ajout de la route permettant de récupérer l'utilisateur connecté.
  US: us-auth-03

- Ajout de la gestion des compagnies.
  US: us-company-01

- Ajout de la création, modification, activation, désactivation et suppression logique des compagnies.
  US: us-company-02

- Ajout de la gestion des comptes administrateurs liés aux compagnies.
  US: us-account-01

- Ajout de la création, modification, activation, désactivation et suppression logique des comptes.
  US: us-account-02

- Ajout du frontend backoffice avec Vue 3 et Vite.
  US: us-front-01

- Ajout de la page de connexion.
  US: us-front-auth-01

- Ajout de l'interface de gestion des compagnies.
  US: us-front-company-01

- Ajout de l'interface de gestion des comptes.
  US: us-front-account-01

- Ajout du package `shared` pour partager les constantes entre le backend et le frontend.
  US: us-shared-01

- Ajout de la table `rooms` (salles de jeu d'une compagnie, configuration matérielle en JSON).
  US: US-ROOM-01

- Ajout de l'API de gestion des salles d'une compagnie : liste, création, lecture, modification (nom, configuration matérielle JSON), changement de statut et suppression logique. Le rôle `user` les consulte en lecture.
  US: US-ROOM-01

- Ajout du compte de salle : création et suppression depuis la salle (un compte actif par salle, sessions révoquées à la suppression, y compris avec la salle), connexion sans expiration par inactivité, route `GET /room/me` pour le PC de la salle. Les comptes de salle n'apparaissent plus dans la gestion des comptes du staff.
  US: US-ROOM-02

- Ajout du lancement de partie par l'opérateur : choix d'une salle active et libre, 1 à 4 participants (email seulement avec consentement RGPD horodaté), format 10 × 10 par défaut, graine tirée par le serveur ; liste, détail et arrêt des parties ; côté salle, récupération de la partie courante et accusé de réception (`pending` → `running`).
  US: US-GAME-08

- Ajout de la section « Salles » sur la fiche compagnie du backoffice : recherche, filtre par statut, activation/désactivation, suppression avec confirmation, création et renommage dans un formulaire inline, indicateur de configuration matérielle. Lecture seule pour le rôle `user`, salles supprimées réservées au superadmin.
  US: US-ROOM-01

- Ajout du rôle `room` (compte de salle rattaché à une salle, un seul compte actif par salle).
  US: US-ROOM-02

- Ajout du modèle de données des parties : `games`, `game_participants` (email soumis à consentement RGPD), `game_rounds` (mini-jeu, thèmes proposés, choix du joueur, snapshot des questions), `game_answers`, `game_events` (séquence unique pour la resynchronisation). Constantes associées dans `@quizzup/shared`.
  US: US-GAME-07

- Ajout d'une CI GitHub Actions sur les PR : lint, type-check, tests et aller-retour des migrations Knex.
  US: us-ci-01

- Ajout du moteur de jeu pur et déterministe `@quizzup/game-engine` (`game/engine`) : manches tirées au sort, choix du thème par un joueur désigné, rejouable depuis la graine.
  US: US-ENGINE-01

- Ajout du mini-jeu blind test éclair (extraits de 1 s / 5 s / 20 s, premier buzz répond, 100 / 50 / 20 points, sans pénalité).
  US: US-MINIGAME-01

- Extraits audio des questions pour le blind test éclair : upload mp3/ogg (10 Mo max, signature
  vérifiée, attestation de droits), stockage disque (`MEDIA_STORAGE_DIR`), lecture protégée
  `GET /questions/:id/media`, point de départ `mediaStartMs`, pré-écoute 1 s / 5 s / 20 s dans le
  formulaire question. Paquet `game/audio` (lecture Web Audio par paliers + sons d'interface).
  US: US-MEDIA-01 (#59)

### Changed

- La création de thèmes, questions et réponses est réservée au superadmin et à l'admin ; le rôle `user` passe en lecture seule (API, boutons et routes de création du backoffice).
  US: US-PERM-01

- Harmonisation des statuts entre le backend, le frontend et le package shared.
  US: us-shared-02

- Mise en place de la convention commune des statuts : `0` inactif, `1` actif, `2` supprimé.
  US: us-shared-03

- Passage de la suppression physique à la suppression logique pour les compagnies et les comptes.
  US: us-soft-delete-01

- Mise à jour de la configuration Docker Compose pour lancer le backend, le frontend, PostgreSQL et le package shared.
  US: us-config-02

- Mise à jour du DBML pour refléter les migrations réelles (scope des thèmes/questions, `question_themes`, rôles) et le nouveau modèle de parties ; suppression des tables `players`, `game_themes`, `rounds`, `game_players`, `player_answers` jamais migrées.
  US: US-GAME-07

- Refonte visuelle du backoffice : design system néon bleu-violet (tokens, néon sélectif, typo Exo 2), menu latéral adaptatif (complet / rail d'icônes / tiroir), composants réutilisables (`StatBar`, `StatusPill`, `ScopeChip`, `Tooltip`, `FormStatusToggle`, select custom, pop-up de confirmation maison, chips de filtres), amélioration de la fluidité (scroll) et harmonisation des pages création/édition. Documentation : `docs/design/design-system.md`.
  US: us-front-design-01

### Fixed

- Une question peut avoir plusieurs bonnes réponses côté API et base (le formulaire le permettait déjà, l'API n'en acceptait qu'une) ; au moins une bonne réponse reste obligatoire.
  US: us-qr-multi-correct

- Correction des erreurs CORS entre le frontend et le backend.
  US: us-config-03

- Correction de la désactivation des compagnies.
  US: us-company-03

- Correction de la suppression logique des compagnies.
  US: us-company-04

- Correction de la gestion des statuts des comptes administrateurs.
  US: us-account-03

- Correction des incohérences entre constantes backend et frontend.
  US: us-shared-04

- Correction de certaines clés i18n manquantes côté frontend.
  US: us-front-i18n-01
