# CHANGELOG.md

Toutes les modifications notables du projet QuizzUp Backoffice sont documentées ici.

Format inspiré de Keep a Changelog.

## [Unreleased]

### Added

- Socle des routes publiques : limiteur de débit en mémoire (connexion du personnel et des salles : 429 `too_many_requests` avec `Retry-After`), `TRUST_PROXY` (liste d'adresses ou de plages, jamais `true`), ressources de permissions `player`, `voucher`, `stats` et `roomLog`. Connexion : 10 échecs par couple adresse/identifiant et 100 tentatives par adresse en 15 minutes ; adresses IPv6 comptées par bloc /64 ; un compte inconnu passe par un `bcrypt.compare` factice ; `TRUST_PROXY` refuse les plages plus larges que /8 (IPv4) ou /16 (IPv6) et les adresses à zone.
  US: US-PUBLIC-00 (#141)
- Préfixe `/public/v1` sans authentification : erreurs au format public, CORS piloté par `VITRINE_ORIGINS`, limite de débit par adresse, réponses `no-store`. Aucune route métier pour l'instant.
  US: US-PUBLIC-00 (#141)
- Lecteur audio : effets sur les extraits (inversé, ralenti à 0,75, reprise après pause) et lecteur d'annonces vocales avec atténuation de l'extrait et repli silencieux (`game/audio`, pas encore branché à l'écran de salle).
  US: US-AUDIO-02 (#144)
- Déploiement de production (`deploy/prod/`) : Caddy en HTTPS, API compilée, PostgreSQL, fichiers
  statiques, emplacement du site vitrine, console éditeur filtrée par plages réseau, secrets
  obligatoires hors du dépôt, sauvegardes chiffrées (restic) avec restauration, mise à jour avec
  retour arrière automatique, supervision par webhook ou e-mail. La pile n'a pas encore tourné sur
  une vraie machine : la liste des essais à rejouer est dans `deploy/prod/README.md`.
  Sécurité : l'API refuse de démarrer en production (`NODE_ENV=production`) si `JWT_SECRET` est
  absent, fait moins de 32 caractères ou vaut la valeur de développement.
  US: US-PROD-01
- Présence en direct de l'écran de salle. L'écran ouvre le flux `GET /room/stream` et publie son
  état par `POST /room/status` (écran, partie, phase, manche, question, mini-jeu, pause, scores par
  pupitre, son prêt) à chaque changement, au plus une fois par seconde, et au rythme annoncé par le
  serveur. Reconnexion après 1, 2, 5, 10 puis 30 s. Rien n'est publié sans flux ouvert. Quand un
  autre poste ouvre la même salle, l'écran affiche « Reprendre la main ici » ; une session terminée
  renvoie à la connexion, après la partie en cours s'il y en a une. `@quizzup/shared` : phases du
  moteur (`GAME_PHASES`, `GAME_IDLE_PHASES`) avec un test de contrat côté moteur. Serveur : le
  rapport refuse une phase inconnue et deux scores pour un même pupitre ; une salle hors ligne sans
  flux est oubliée une fois son départ diffusé.
- Présence des salles en direct, côté backoffice. La liste des parties affiche, sous le nom de la
  salle de chaque partie en attente ou en cours, une pastille « En ligne », « Hors ligne » (avec
  « vu il y a … ») ou « En partie » ; le formulaire de lancement écrit la présence après le nom de
  chaque salle et affiche la pastille de la salle choisie. Le flux `GET /companies/:companyId/live`
  est lu avec `fetch` et l'en-tête `Authorization` (composable `useLiveCompany`) : reconnexion après
  1, 2, 5, 10 puis 30 s, flux muet plus de 45 s rouvert, arrêt sans boucle sur `403` et
  `429 too_many_streams`, vérification de la session sur `401` et `session_ended`, fermeture au
  départ de l'écran. Pendant une coupure, les dernières présences connues sont affichées « État
  inconnu ». Clés i18n `fr` et `en` (`live.*`, codes d'erreur `too_many_streams`,
  `room_instance_replaced`, `session_ended`). `apiFetch` accepte un `signal`.
  US: US-LIVE-01

- Présence des salles en direct, côté serveur (aucun client modifié dans ce lot). Le backend sait
  quelle salle est en ligne et le diffuse. `GET /room/stream` (compte de salle) ouvre un flux SSE
  (`hello { streamId, heartbeatMs, statusEveryMs }`, puis `replaced` si un autre poste prend la
  place, `session_ended` si la session tombe) ; `POST /room/status` publie l'état de la salle
  (écran, partie, phase, manche, question, mini-jeu, pause, scores, audio prêt) et répond `204`,
  `400 invalid_body`, ou `409 room_instance_replaced` si un autre poste a ouvert le flux de la salle depuis.
  `GET /companies/:companyId/live` (droit `game:read`, même compagnie ou superadmin) ouvre un flux
  SSE du personnel : `snapshot { rooms }` (toutes les salles actives, hors ligne comprises) puis
  `room_status` à chaque changement ; `429 too_many_streams` au-delà de 5 flux ouverts par compte.
  Présence : `offline` sans rapport depuis 45 s, `in_game` si une partie est en cours, sinon
  `online` ; `controllable` = en ligne avec son flux ouvert. Les sessions sont revérifiées toutes les
  60 s sans être prolongées. État gardé en mémoire du processus : une seule instance du backend
  (PostgreSQL LISTEN/NOTIFY avant d'en déployer deux). `@quizzup/shared` : noms d'événements,
  délais, types `RoomStatusReport` / `RoomLive` et `createSseParser`. `plugins/auth.ts` expose
  `checkSession` (même comportement qu'avant pour `authenticate`). Caddy de recette : les flux
  sortent de la compression et passent avec `flush_interval -1`. Pas de migration.
  US: US-LIVE-01

- Pilotage d'une partie en cours, côté écran de salle (lot 4, sans réseau ; les commandes du
  backoffice viendront dans un lot suivant). Moteur (`game/engine`) : nouvelle commande
  `skip { at, questionId }`, acceptée seulement en phase `question` et seulement si `questionId`
  est la question en cours (sinon sans effet : l'opérateur a visé une question qui a fini entre le
  clic et la validation) : la question se termine sans point ni pénalité et la partie enchaîne
  comme après une question sans bonne réponse ; `question_ended` porte `skipped: true`, la question
  est notée dans `rounds[].skippedQuestionIds` et ignorée par la série et la mort subite. Exception
  en mort subite : si la dernière question de la manche est passée, les survivants touchent quand
  même le bonus de fin de manche (200 points, une seule fois). Écran de salle (`game/room-app`) :
  pause qui gèle l'horloge de la partie (échéances déjà tombées appliquées avant le gel,
  échéances reculées du temps de pause, buzzers ignorés, extrait suspendu), voile « Pause » borné
  à la zone de jeu (l'arrêt d'urgence et l'arrêt de la partie restent accessibles), commandes
  « Pause / Reprendre » et « Passer la question » à côté de l'arrêt local (fr / en) ;
  `pauseGame`, `resumeGame` et `skipQuestion(questionId)` renvoient appliqué ou refusé avec
  un code (`GAME_COMMAND_REFUSALS` dans `@quizzup/shared` : `already_paused`, `not_paused`,
  `paused`, `not_in_question`, `game_over`), traduit à l'écran (fr / en). La pause est sauvegardée
  (champ facultatif `paused` de l'instantané de session) : une partie rechargée pendant une pause
  reprend en pause, à l'instant de la pause ; les anciennes sauvegardes, sans ce champ, reprennent
  non pausées.
  US: US-LIVE-01

- Révision de la config de salle : deux postes connectés au même compte de salle ne s'écrasent plus
  `rooms.config` en silence. Nouvelle migration : `rooms.config_revision` (entier, défaut 0, +1 à
  chaque écriture de `config`). `GET /room/me` renvoie `room.configRevision` ; `PUT /room/config`
  accepte `revision` (celle lue) et répond `409 room_config_conflict` avec la `config` et la
  `configRevision` courantes si la config a changé entre-temps (écriture atomique, rien n'est écrit) ;
  sans `revision`, l'ancien comportement est gardé (on écrase, la révision augmente). Le `PATCH` du
  backoffice qui modifie `config` incrémente aussi la révision. Écran de salle (`game/room-app`, pas de
  CHANGELOG propre) : la révision est mémorisée, envoyée à chaque enregistrement et gardée hors
  ligne ; sur un 409, la config du compte est appliquée et gardée en copie locale, l'écran Matériel
  prévient l'opérateur (fr / en) et rien n'est renvoyé automatiquement. Le `UPDATE` est toujours
  conditionné à la révision lue (sans `revision`, la fusion est refaite une fois si un autre
  enregistrement passe entre la lecture et l'écriture, puis 409). Au démarrage de l'écran de salle,
  une modification restée hors ligne sur une révision périmée n'écrase pas le compte : sa version
  est appliquée. L'assistant et la config avancée repartent de la config du compte après un
  conflit. Limite connue : le `PATCH` du backoffice n'envoie pas de révision, il écrase donc
  toujours `config` (la révision augmente, les postes de salle le détectent à leur prochain
  enregistrement).
  US: us-room-config-revision

- Retypage de l'ancien contenu : nouvelle migration de données qui remplace le type `qcm` posé par
  défaut par `true_false` ou `estimate` sur les questions texte non supprimées (toutes compagnies
  et contenu global) que le moteur de jeu déduisait déjà de leurs réponses : exactement deux
  réponses « Vrai » / « Faux » ; ou 3 à 4 fourchettes chiffrées dont chacune porte un marqueur en
  mots (« Entre 10 et 20 », « Moins de 5 », « Plus de 30 »), une seule juste. Scores, périodes
  (« 1914-1918 »), nombres isolés et questions à média restent des QCM. Les lignes retypées sont tracées dans la nouvelle table
  `question_kind_retypings` ; le retour arrière remet `qcm` sur exactement ces lignes.
  US: us-retype-legacy-questions

- 6 pupitres au maximum, 4 par défaut (décision d'Enzo du 2026-11-04). `GAME_PODIUMS` passe de 4 à
  6 dans `@quizzup/shared` (avec `ROOM_DEFAULT_DESKS` et `getRoomDesksCount`) ; le nombre de
  pupitres d'une salle est `rooms.config.desksCount` (1 à 6, absent = 4), réglable depuis l'écran
  Matériel de la salle. `GET /companies/:id/rooms` renvoie `desksCount` ; le formulaire « Lancer
  une partie » ne propose que les pupitres de la salle choisie et `POST /companies/:id/games`
  refuse un pupitre au-delà (`400 podium_not_in_room`). Nouvelle migration : CHECK
  `game_participants.podium` 1..6 (le retour arrière à 4 est refusé si un pupitre 5 ou 6 est
  utilisé). Écran de salle : lobby, apprentissage des buzzers, lumières, classement et clavier de
  simulation jusqu'à 6 pupitres ; vol de points à 5 ou 6 joueurs : A et B font défiler la cible,
  C ou D la valide (jusqu'à 4 pupitres, les boutons A à D désignent toujours un pupitre).
  US: us-six-podiums

- Choix des mini-jeux au lancement d'une partie : le formulaire « Lancer une partie » propose une
  case par mini-jeu (tous cochés par défaut, au moins un requis) ; `POST /companies/:id/games`
  accepte `miniGames` (facultatif, stocké dans `games.mini_games`, `null` = tous) et le détail de
  la partie l'affiche. L'écran de salle le reçoit via `GET /room/games/current` et tire au sort
  parmi ces mini-jeux (à défaut, le réglage local de la salle, sinon tous).
  US: us-game-minigames

- Purge RGPD des emails joueurs : un email (1er ou 2e joueur) est effacé, avec son consentement,
  dans les parties d'une compagnie 3 ans après sa dernière partie dans cette compagnie
  (`PLAYER_EMAIL_RETENTION_YEARS` dans `@quizzup/shared`) ; noms et scores restent. Calculée en SQL
  sous verrou, exécutée au démarrage du serveur puis toutes les 24 h
  (`PLAYER_EMAIL_PURGE_INTERVAL_HOURS`, minimum 1, `0` = désactivée), ou à la main avec
  `npm run purge:emails`. Test d'intégration sur PostgreSQL dans la CI.
  US: us-rgpd-purge

- Version testable : `npm run demo` à la racine (base, API, backoffice, écran de salle), seed de
  démo (compagnie « QuizzUP Démo », `demo-admin`, salle « Salle 1 » et son compte de salle
  `salle1-demo`, mot de passe `DEMO_SEED_PASSWORD`, `DEMO_SEED=false` pour le couper, 2 thèmes
  blind test de 10 extraits générés libres de droits), recette VPS en
  HTTPS (`deploy/recette/`) et guide de test (`docs/recette/guide-de-test.md`).

- Fin de partie envoyée au backoffice : au podium, l'écran de salle appelle
  `POST /room/games/:id/finish` (scores par pupitre) ; la partie passe « Terminée » et
  `game_participants.score` est rempli. Idempotent, partie de la salle uniquement, rien en mode démo.

- Envoi des résultats de partie qui survit à une panne réseau : au podium, l'écran de salle met les
  scores dans une file gardée dans le navigateur (elle survit au rechargement et à la partie
  suivante) et les renvoie en arrière-plan (2 s, 5 s, 15 s, 30 s puis toutes les 60 s, ou dès le
  retour du réseau, au démarrage et à la reconnexion de la salle). Un refus définitif du
  backoffice (404, 409, 400) l'abandonne ; un jeton expiré (401/403) attend la reconnexion. État
  discret sur le podium et bandeau dans le lobby du staff quand des résultats attendent.
  US: us-room-finish-retry

- Média selon le type de question (`getQuestionKindMediaError` dans `@quizzup/shared`) : une
  question vrai/faux ou estimation n'accepte qu'un texte ou une image, comme le moteur de jeu.
  Refus `question_kind_media_invalid` en création, en modification (type ou média changé, l'autre
  champ pris en base), à l'envoi d'un extrait audio, et message dans le formulaire.
  US: us-minigame-01

- Règles de réponses selon le type de question, partagées par l'API et le formulaire
  (`getQuestionKindAnswersError` dans `@quizzup/shared`) : vrai/faux = « Vrai » et « Faux », une
  seule juste ; estimation = 3 ou 4 fourchettes commençant par un nombre, une seule juste. Les
  routes unitaires de réponses (ajout, modification, statut, suppression) les appliquent aussi, et
  les préfixes de fourchette sont ceux que reconnaît le moteur de jeu.
  US: us-minigame-01

- Type de question (`kind` : QCM, vrai/faux, estimation ; QCM par défaut) en base, dans l'API
  des questions (création, modification, filtre) et dans le catalogue de la salle.
  US: us-minigame-01

- 2e joueur facultatif par pupitre (nom et email RGPD propres, score du pupitre), emails des
  joueurs masqués pour le rôle `user` après l'inscription, et enregistrement de la configuration
  matérielle par le PC de salle (`PUT /room/config`).
  US: us-game-08, us-room-02

- Catalogue de la salle (`GET /room/games/current/content`) : questions actives de tous types,
  l'audio seulement avec un fichier uploadé, et lecture des extraits par le compte de salle
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
- Ajout de l'écran « Parties » du backoffice : liste filtrable par état avec arrêt confirmé, page de lancement (salle active, 1 à 4 participants par pupitre, case de consentement RGPD non cochée et obligatoire si un email est saisi, format modifiable), détail d'une partie (participants, scores, dates). Le superadmin choisit la compagnie.
  US: US-GAME-08

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

- Images Docker du backoffice (backend, frontend, service `tests`) passées à Node 22, requis par les dépendances mises à jour. Sur une démo déjà installée, lancer `npm run demo:reset` pour que les volumes `*_node_modules` reprennent les nouvelles dépendances (la base est alors vidée).
  US: US-SEC-01 (#146)
- Moteur de jeu : les mini-jeux d'une partie sont tirés sans remise (aucun mini-jeu ne revient tant que tous les mini-jeux jouables n'ont pas été joués, et jamais deux fois de suite quand il y a le choix).
  US: US-FORMAT-01 (#143)

- `backend/.env` n'est plus versionné (seul `backend/.env.example` l'est) ; les tests backend
  chargent `backend/.env` s'il existe, sinon `backend/.env.example`.
  **Avant le pull**, sauvegarder son `backend/.env` local : git le supprime du disque. Le remettre
  ensuite, ou `cp backend/.env.example backend/.env`.
- Docker Compose : seeds complets seulement sur une base vide (`SEED_ON_START=always` pour
  l'ancien comportement), seul le seed de démo est rejoué ensuite ; ports publiés sur
  `127.0.0.1` uniquement.

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

- Mise à jour des dépendances du backoffice (`fastify`, `fast-jwt`, `zod`, `@fastify/swagger-ui` 6, `vue`, `vue-i18n`, `postcss`…) pour corriger les vulnérabilités signalées par `npm audit` en production ; `fastify-plugin` est déclaré dans le backend ; le build du frontend (`vue-tsc --build`) repasse et la CI le vérifie désormais.

- Droits d'un admin de compagnie : il n'obtient plus de 403 (`forbidden`, `question_theme_forbidden`) sur
  ses propres thèmes et peut de nouveau créer des questions. Cause : `pg` renvoyait les `bigint`
  (ids, `company_id`) en chaîne, donc `"10" === 10` (JWT / session) était faux dans les contrôles de
  portée (`routes/_shared/scope.ts`, `themes/id.ts`, `questions/_shared.ts`). Le parseur int8 est
  maintenant posé une seule fois dans `backend/src/db.ts`. Tests : `tests/backend/src/db/bigintIds.pg.test.ts`
  (+ étape PostgreSQL de la CI). La page Statistiques affiche son titre (clé i18n `navbar.statistics`).

- Écran de salle : le verrou clavier (Keyboard Lock, Échap et raccourcis système captés en plein
  écran) s'applique aussi quand les buzzers sont lus sur une carte manette, et il est repris si
  la source des buzzers change en cours de séance. Le synthé du mode démo ajoute un court fondu
  d'entrée (40 ms) et de sortie (60 ms) du volume pour éviter les claquements, sans changer la
  durée des paliers du blind test.
  US: us-room-polish

- Course de concurrence type / média d'une question : deux admins qui changent en même temps le
  type (`PATCH /questions/:id`) et l'extrait audio (`PUT /questions/:id/media`) ne peuvent plus
  laisser une question incohérente. La règle `question_kind_media_invalid` est contrôlée sur la
  ligne relue en `SELECT … FOR UPDATE` dans la transaction ; l'extrait est écrit hors
  transaction et retiré si le contrôle échoue (y compris si la question est supprimée entre-temps,
  réponse 404). Même famille de course pour les réponses : le type et les réponses sont
  revalidés sur le type relu sous verrou pour `PATCH /questions/:id` et pour les routes unitaires
  de réponses (ajout, modification, statut, suppression), toujours dans l'ordre de verrous
  question puis réponses.
  US: us-question-kind-race

- Compte de salle : connexion refusée et PC déconnecté si la compagnie n'est plus active ;
  suppression d'une salle atomique (salle, compte et parties actives) ; salles et comptes de
  salle non modifiables dans une compagnie supprimée ; ids des parties renvoyés en nombres ;
  pas de partie dans une compagnie inactive ; extrait servi seulement pour une question d'un
  thème jouable ; compte d'une salle supprimée refusé.
  US: us-room-02, us-game-08

- Écran de salle : une partie sauvegardée n'est proposée à la reprise que dans son contexte :
  en mode démo, une partie démo ; avec un compte de salle, la partie retenue du backoffice
  (même graine) jouée par ce compte, dont l'identifiant est désormais mémorisé (mémoire ancienne
  sans compte : la graine fait foi). La fin de partie n'est pas non plus envoyée avec le jeton
  d'un autre compte. Une partie de salle retenue n'est jamais effacée par l'écran de lancement,
  même en mode démo ou avec un autre compte (jeton expiré : elle revient à la reconnexion du
  bon compte). Sont effacées : une partie démo hors mode démo et une sauvegarde dont la partie
  n'est plus retenue (résultats envoyés, abandonnée). Une partie en cours n'est jamais touchée.
  US: us-room-resume

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
