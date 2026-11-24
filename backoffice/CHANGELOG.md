# CHANGELOG.md

Toutes les modifications notables du projet QuizzUp Backoffice sont documentées ici.

Format inspiré de Keep a Changelog.

## [Unreleased]

### Added

- Écran Matériel : boutons Exporter et Importer la configuration de la salle (onglet Configuration avancée). L'import vérifie le type et la taille du fichier, affiche un résumé et demande confirmation. Il ne relève aucun réglage de fumée : activation, niveau, jet, pause et confirmation restent ceux de la salle ou plus stricts, et l'assistant, le test de coupure et l'armement sont à refaire. À valider sur le banc.
  US: US-SHOW-01 (#145)

- Matériel, configuration de salle : export et import (`exportRoomConfig`, `parseRoomConfigImport`), avec un garde-fou fumée (`withoutSmokeEscalation`). Un import ou le JSON de la configuration avancée ne peut jamais rendre la fumée plus permissive que celle de la salle : ni l'activer, ni dispenser du relais, ni allonger un jet, ni rapprocher deux jets, ni retirer la confirmation. Un fichier invalide, trop gros ou d'une version plus récente est refusé avec une raison lisible. Les boutons Exporter et Importer viendront avec le lot suivant.
  US: US-SHOW-01 (#145)
- Mode enfants, serveur : un thème peut être marqué adapté aux enfants (`kidsFriendly` sur `POST` / `PATCH` / `GET /themes`, 400 `theme_kids_friendly_invalid`) et une partie peut être en mode enfants (`kidsMode` à la création et à la modification d'une session programmée). Le contenu servi à la salle d'une partie en mode enfants ne contient que les thèmes adaptés.
  US: US-KIDS-01 (#158)
- Format de partie côté serveur : `games.format` stocke le format (`discovery`, `short`, `standard`, `custom`). À la création, un format fixe ses nombres de manches et de questions (les envoyer ensemble donne 400 `invalid_body`, `format_fixes_counts`) ; des nombres sans format donnent `custom`. Modifier les nombres d'une session programmée la passe en `custom`. Le format est renvoyé par les parties et par `GET /room/games/current`.
  US: US-FORMAT-01 (#143)
- API de réservation, lecture : `GET /public/v1/rooms` et `GET /public/v1/availability` derrière une clé d'API (401 `api_key_missing` / `api_key_invalid`, 403 `company_inactive`), débit par clé (`PUBLIC_API_RATE_LIMIT_PER_MINUTE`, en-têtes `RateLimit-*`, 429 avec `Retry-After`), limite des échecs d'authentification par adresse (`PUBLIC_API_AUTH_FAILURES_PER_MINUTE`) et journal des appels sans corps ni adresse.
  US: US-BOOKING-01 (#188)
- Playlists, formulaire de thème : en mode audio, un champ « Lien de playlist » accepte un lien ou un identifiant de playlist, vérifié avant l'envoi. Vider le champ retire la playlist ; les refus du serveur s'affichent avec leur texte.
  US: US-PLAYLIST-01 (#204)
- Écran de salle, accueil des joueurs : le lobby d'une partie en attente affiche le QR code d'inscription fourni par le serveur (dans un `<img>`, jamais en `v-html`), l'adresse en clair et le nombre d'inscriptions en attente de validation. Sans QR code, l'adresse seule ; un lien expiré est signalé ; rien en partie en cours.
  US: US-JOIN-01 (#166)

- Accueil des joueurs dans le backoffice : sur la fiche d'une partie en attente, un panneau « Accueil » ouvre ou ferme le lien d'inscription, l'affiche avec son QR code (plein écran possible), liste les demandes et permet de les valider sur un pupitre ou de les refuser. La création d'une partie peut ouvrir l'accueil d'emblée et mène alors à la fiche.
  US: US-JOIN-01 (#166)

- Accueil des joueurs, page du téléphone : `/rejoindre/` (lien ou QR code d'une partie en attente) où le joueur saisit son nom, un second joueur et, s'il le veut, son e-mail avec ses accords. Routes publiques `POST /public/v1/join/lookup` et `POST /public/v1/join/registrations` : le jeton voyage dans le corps, jamais dans l'adresse ; 404 `join_link_invalid`, 410 `join_link_closed`, 409 `join_full` au-delà de 12 demandes en attente, 30 inscriptions par minute et par adresse.
  US: US-JOIN-01 (#166)

- Joueurs d'une compagnie (API) : `GET /companies/:companyId/players` (liste paginée, recherche par nom, e-mail masqué pour le rôle `user`), `GET …/players/export.csv` (joueurs ayant accepté les offres, cellules protégées contre les formules), `POST …/players/unsubscribe` (retire le consentement aux offres, réponse identique que l'adresse soit connue ou non) et `POST …/players/erase` (efface l'e-mail, les consentements et le nom sur chaque pupitre, supprime les demandes d'inscription en attente ; scores conservés). Export, désinscription et effacement réservés aux admins.
  US: US-PLAYERS-01 (#157)

- Fumée par la carte USB, lien série (`game/hardware`, rien n'est encore branché à l'écran de salle) : lecture et écriture du protocole de la carte (bannière `QZF READY`, lignes d'état, ordres `F`, `0`, `H`) et lien Web Serial qui n'envoie jamais `F` sans bannière valide, ne renouvelle jamais `F` de lui-même, borne les `F` à un toutes les 100 ms, n'en envoie qu'en phase prête ou en jet (jamais pendant la pause de la carte, dont les 5 s qui suivent sa remise à zéro ; la phase lue est exposée), et signale une carte absente, muette, débranchée ou qui contredit nos ordres. Une carte plus permissive que les limites du projet est refusée. Fausse carte pour les tests.
- Installation d'un programme sur une carte Arduino Uno depuis le navigateur (bibliothèque `game/hardware`, pas encore d'écran) : lecture et écriture de fichiers Intel HEX, client du chargeur Optiboot par Web Serial (protocole STK500v1, 115200 puis 57600 bauds), sauvegarde de la flash relue avant toute écriture, écriture par pages suivie d'une relecture complète, restauration d'un `.hex`, erreurs nommées (`no_sync`, `wrong_signature`, `too_large`, `verify_failed`, `port_lost`, `port_busy`, `backup_failed`, `timeout`, `cancelled`). Testé contre un émulateur d'Optiboot ; rien n'a été essayé sur une vraie carte.
- Bons dans le backoffice : panneau « Bons » sur la fiche d'une partie terminée (émettre le bon d'un pupitre, l'annuler), page « Bons » (recherche d'un code, utilisation, liste filtrable et paginée, annulation réservée aux admins), réglages du centre (libellé du bon, durée de validité) et un bloc par bon valable sur la feuille de résultats imprimable, avec son QR code quand le serveur le fournit.
  US: US-VOUCHER-01 (#156)

- QR code généré par le serveur : `join` vaut `{ url, qrSvg, expiresAt }` (fiche de partie, `POST /games/:id/join`, création avec `openJoin`, `GET /room/games/current`) et un bon porte `qrSvg` à côté de `url` (émission et bons d'une partie). `qrSvg` est un SVG complet, `null` sans `PUBLIC_APP_URL`. Une seule dépendance, `qrcode-generator` (version exacte, sans dépendance).
  US: US-JOIN-01 (#166)

- Manches enregistrées : à la fin d'une partie, l'écran de salle envoie les manches jouées (mini-jeu, thème, questions posées) avec les scores ; `POST /room/games/:id/finish` les écrit dans `game_rounds` dans la même transaction (400 `game_rounds_invalid` si un thème ou une question n'est pas lisible par la compagnie). Sans manches, la partie se termine comme avant ; hors ligne, elles attendent avec les scores.
  US: US-CONTENT-01 (#158)

- Logo du centre sur l'écran de salle : affiché dans la barre du haut et au-dessus du podium, lu avec `/room/me` (aucun appel de plus). Rien n'est affiché sans logo, si l'image ne charge pas, ou en mode démo.
  US: US-RESULTS-01 (#156)

- Programme de la carte de la fumée (Uno), écrit de zéro : la sortie du relais n'est au niveau haut que tant que la page redit « fumée » (bail de 500 ms), jamais plus de 10 s par jet, avec 5 s de pause entre deux jets, et un chien de garde matériel de 250 ms. Logique en C testée par gcc sur des vecteurs partagés ; la CI compile le programme pour `arduino:avr:uno` et publie le `.hex`. Rien n'est encore branché à l'écran de salle ni essayé sur une vraie carte.
  US: US-DMX-01 (#215)
- Lumières Art-Net sans exécutable (`game/artnet-bridge/powershell`) : `quizzup-lumieres.ps1` (PowerShell 5.1, présent sur tout Windows) parle le même protocole WebSocket que le pont et envoie les trames Art-Net ; lanceur `Lancer les lumieres.cmd`. Pas de découverte de nœuds : l'adresse du nœud se saisit à la main. Jamais essayé face à un vrai nœud Art-Net.
  US: US-DMX-01 (#203)
- Formulaire de question : sélecteur « Effet sur l'extrait » (aucun, très court, à l'envers, ralenti), visible seulement pour une question audio. L'effet est relu à la modification, remis à « aucun » quand la question cesse d'être audio, et les erreurs de l'API (`question_audio_effect_invalid`, `audio_effect_requires_audio`) s'affichent sous le champ.
  US: US-AUDIO-02 (#144)
- Pilotage en direct, commandes à distance (écran de salle) : la salle applique `pause`, `resume`, `skip` et `abort` reçus par le flux, par les mêmes chemins que les boutons locaux, puis rend l'accusé (`POST /room/commands/:id/result`). Commande rejouée : même accusé, sans nouvelle application. `skip` refusé (`not_in_question`) s'il ne désigne plus la question en cours ; `abort` refusé s'il vise une autre partie. Scénario Playwright pause, refus, reprise.
  US: US-LIVE-01 (#129)
- Pilotage en direct, commandes à distance (frontend) : boutons « Mettre en pause », « Reprendre », « Passer la question » et « Arrêter la partie » dans le panneau en direct d'une partie. Le résultat (`applied`, `refused` avec sa raison, `expired`) vient de l'événement `command_result` du flux ; sans résultat après 12 s, la commande est tenue pour expirée. Boutons inactifs si la salle n'est pas pilotable.
  US: US-LIVE-01 (#129)
- API de réservation, clés et journal (backend) : `GET` / `POST /companies/:companyId/api-keys` (10 clés actives au plus, 409 `api_key_limit_reached` ; le secret n'est renvoyé qu'à la création), `DELETE /companies/:companyId/api-keys/:apiKeyId` (révocation, idempotente) et `GET /companies/:companyId/api-logs` (journal paginé, filtré par clé et par classe de statut). Purge du journal après 90 jours et des clés d'idempotence après 24 h.
  US: US-BOOKING-01 (#188)
- Playlists, thèmes : un thème audio peut porter une playlist du fournisseur de musique (`playlistRef` sur `POST` / `PATCH` / `GET /themes`), vérifiée à l'enregistrement (400 `theme_playlist_ref_invalid`, `theme_playlist_mode_invalid` ; 422 `theme_playlist_not_found`, `theme_playlist_too_small` ; 502 `media_provider_unavailable`). Un thème qui quitte le mode audio perd sa playlist.
  US: US-PLAYLIST-01 (#204)
- Bons de fidélisation, API : émission d'un bon pour un participant d'une partie terminée, liste par partie et par compagnie, recherche et utilisation par code (le code voyage dans le corps, jamais dans l'adresse), annulation réservée aux administrateurs. Recherche publique `POST /public/v1/vouchers/lookup`, limitée à 20 requêtes par minute, qui ne révèle ni le joueur ni la partie. Réglages par compagnie : libellé du bon (vide : bons désactivés) et durée de validité (1 à 730 jours, 90 par défaut).
  US: US-VOUCHER-01 (#156)
- Accueil des joueurs, API du personnel : lien d'inscription d'une partie en attente (`POST` / `DELETE …/games/:gameId/join`, jeton valable 180 minutes, renouvelable), demandes d'inscription (`GET …/registrations`, validation avec attribution d'un pupitre, refus), ajout et retrait d'un participant tant que la partie est en attente, `openJoin` à la création. `join` et `pendingRegistrationsCount` sont renvoyés avec la partie, y compris à l'écran de salle. Les demandes de plus de 24 heures ou d'une partie qui n'est plus en attente sont purgées. `room_busy` ne vise plus que la partie en attente : une partie en cours ne bloque plus la préparation de la suivante.
  US: US-JOIN-01 (#166)

- Console éditeur : écran des demandes de démonstration (filtre « À traiter », « Traitées », « Toutes » ; marquer une demande traitée ; supprimer), réservé au superadmin.
  US: US-CONSOLE-01 (#161)

- Effet audio joué en salle : le blind test lit l'extrait avec l'effet de la question (court, inversé, ralenti), avec des paliers raccourcis pour `short` et une reprise fidèle après rechargement.
  US: US-AUDIO-02 (#144)

- Sessions programmées, routes de la salle : `GET /room/games/current` renvoie aussi la prochaine session de la salle (`next`), et `POST /room/games/:gameId/open` ouvre une session programmée depuis la salle (409 `game_not_scheduled`, `session_not_open_yet`, `room_busy`, `room_inactive`, `company_inactive`).
  US: US-SCHED-01 (#142)

- Effet audio d'une question (`audioEffect` : `none`, `short`, `reverse`, `slowed`) : stocké sur la question, validé (400 `question_audio_effect_invalid`, `audio_effect_requires_audio`) et distribué à la salle avec le contenu de la partie.
  US: US-AUDIO-02 (#144)

- Show lumière réglable par salle : `lighting.scenes` surcharge les scènes par défaut (bornées : 400 ms au moins entre deux éclairs, un seul jet de fumée par scène, jamais dans une boucle), une scène peut en enchaîner une autre (`next`), nouveaux signaux `game_paused`, `game_resumed`, `session_exit` et `round_started.<miniGame>`. Les clés de configuration inconnues sont conservées. Modèles de salle prêts à l'emploi (4 modèles, sans fumée) et proposition d'univers Art-Net.
  US: US-SHOW-01 (#145)
- Lumière de sortie réglable : en fin de session, la salle passe en blanc chaud et fort, lyres au repos, sans stroboscope ni fumée, pour que les joueurs voient la sortie. Elle part 10 secondes après la victoire (ou tout de suite si la partie s'arrête faute de contenu), reste allumée 5 minutes puis s'éteint en douceur ; une nouvelle partie ou l'arrêt d'urgence la coupe. Réglable par salle (`lighting.exit` : `enabled`, `delayMs`, `holdMs`, `intensity`, `color`), une configuration plus ancienne reste valide. Une boucle de scènes qui passerait par la victoire ou la sortie livrées est refusée.
  US: US-SHOW-01 (#145)
- Diagnostic à distance d'une salle, en lecture seule : l'écran de salle publie son état matériel dans son rapport d'état (version, source des buzzers et manettes, pilote et état des lumières, fumée activée et armée, audio prêt, date de la dernière erreur) et la fiche de la salle l'affiche dans un bloc « Diagnostic ». Rien n'est stocké. Une valeur inconnue est lue comme « inconnu » et ne fait jamais paraître la salle hors ligne.
  US: US-DIAG-01 (#157)
- Commandes à distance, côté serveur : `POST /companies/{companyId}/rooms/{roomId}/commands` relaie pause, reprise, passer et arrêter à l'écran de salle connecté, qui répond par `POST /room/commands/{commandId}/result` ; le personnel reçoit le résultat (`applied`, `refused` ou `expired` après 10 s) sur le flux en direct. L'arrêt d'une partie depuis le backoffice prévient la salle quand elle est pilotable.
  US: US-LIVE-01 (#129)
- Écran de salle, habillage : sous 3 secondes la barre de temps vire à l'orange, pulse et fait « tic » à 3, 2 et 1 s (jamais en pause, jamais pendant le blind test) ; chaque écran d'une partie apparaît en fondu ; les scores montent au lieu de sauter et des confettis saluent le vainqueur. Tout mouvement est coupé quand le système demande de réduire les animations.
  US: US-SHOW-01 (#145)
- Socle de l'API de réservation : tables `api_keys` (seule l'empreinte de la clé est stockée), `api_idempotency_keys` et `api_request_logs` ; une partie peut être créée par une clé d'API (`games.api_key_id`, `admin_id` devenu facultatif, l'un des deux obligatoire). Ressources `apiKey` et `apiLog` dans la matrice de permissions (admin et superadmin). Contrat de l'API publique dans `docs/api/public-v1.yaml`. Aucune route n'est encore ouverte.
  US: US-BOOKING-01 (#188)
- Extraits de blind test fournis par Deezer : dans le champ audio d'une question, l'auteur cherche un titre (`GET /media-catalog/tracks`), l'écoute et le rattache à la question (`PUT /questions/:questionId/media/provider`). Un titre sans extrait est refusé. Une question référence soit un fichier importé, soit un titre (`media_provider`, `media_provider_ref`), jamais les deux. Au lancement d'une partie, le serveur donne à la salle le lien d'extrait à jour et le crédit ; l'écran de salle télécharge l'extrait sans jeton de salle et affiche « Extrait fourni par Deezer » à la révélation. Si le fournisseur ne répond pas, la question est écartée et la partie démarre.
  US: US-AUDIO-03 (#185)
- Formats de partie partagés : Découverte (3 manches × 3 questions), Courte (6 × 7), Standard (10 × 10) et Personnalisé, avec la durée estimée d'une partie calculée depuis les délais du moteur (`GAME_FORMATS`, `GAME_FORMAT_SETTINGS`, `estimateGameDurationMs` dans `@quizzup/shared`). Le lobby du mode démo de l'écran de salle propose ces formats, Découverte par défaut, avec leur durée estimée.
  US: US-FORMAT-01 (#143)
- Programmer une session depuis le formulaire de création de partie : la case « Programmer pour plus tard » ouvre la date, l'heure (dans le fuseau de la salle), la durée et l'effectif annoncé ; une session programmée peut n'avoir aucun joueur. Le formulaire se préremplit depuis l'agenda (`?roomId=`, `?scheduledAt=`). Une session programmée se modifie par le même formulaire (route `games/:gameId/edit`, bouton « Modifier » de l'agenda). Les refus du serveur (`slot_taken`, `session_in_past`, `session_too_far`, `room_inactive`) s'affichent sur le champ concerné.
  US: US-SESSION-01 (#142)
- Écran de salle : catalogue des 48 annonces vocales (identifiant, texte français et anglais) et correspondance événement de partie → annonce (`announcementForEvent`). Une annonce cite le numéro de pupitre, jamais un prénom ; aucune annonce pendant un palier de blind test. Aucun fichier son n'est livré et rien n'est encore branché : l'écran reste muet.
  US: US-AUDIO-02 (#144)
- Détail d'une partie : panneau de suivi en direct (présence de la salle, pause, étape, manche, question, mini-jeu, scores par pupitre avec le nom des joueurs), alimenté par le flux en direct de la compagnie. Il ne s'affiche que si la salle joue la partie affichée ; hors ligne, il garde les dernières valeurs reçues.
  US: US-LIVE-01 (#129)
- Deux constructions du frontend : la surface « centre » (`npm run build:centre`, dossier `dist`) ne contient aucun écran de la console éditeur ; la surface « console » (`npm run build:console`, dossier `dist-console`) les ajoute. `npm run check:surface` construit les deux et échoue si un écran de la console se retrouve dans la surface centre ; la CI le lance. En production et en recette, la console est servie sur son propre hôte, réservé aux adresses de `CONSOLE_ALLOWED_CIDRS`. `npm run dev` et la démo Docker gardent tous les écrans.
  US: US-CONSOLE-01 (#161)

- Journaux d'erreurs d'une salle consultables depuis le tableau des salles d'un client : panneau en ligne avec filtre par niveau, actualisation et « charger plus », réservé aux administrateurs.
  US: US-LOG-01 (#157)
- Statistiques d'exploitation d'une compagnie : route `GET /companies/:companyId/stats` et écran « Statistiques » (séances terminées et arrêtées, taux d'abandon, durée médiane, répartition par salle, joueurs, créneaux les plus chargés), réservés aux administrateurs. Aucune donnée individuelle ne sort.
  US: US-STATS-01 (#157)
- Connexion du superadmin en deux temps : code de l'application d'authentification ou code de secours, enrôlement avec secret à recopier (sans QR code), codes de secours affichés une seule fois, réinitialisation depuis le profil. Les autres rôles se connectent comme avant.
  US: US-CONSOLE-03 (#161)

- Console de l'éditeur : le superadmin se connecte avec un deuxième facteur TOTP. Enrôlement à la première connexion, dix codes de secours à usage unique, anti-rejeu, blocage de 15 minutes après 5 échecs, secret chiffré en base (`TOTP_ENCRYPTION_KEY`). Commande `npm run totp:reset` pour réinitialiser un compte. Les autres rôles ne changent pas. L'écran de connexion en deux temps arrive dans un lot suivant.
  US: US-CONSOLE-03 (#161)
- Écran « Agenda » du backoffice : les sessions programmées d'une salle, jour par jour, dans le fuseau de la salle, avec les créneaux libres de la grille, l'ouverture, l'annulation confirmée et l'accès au détail.
  US: US-SESSION-01 (#142)

- Sessions programmées, côté serveur : une partie se crée à l'avance avec `scheduledAt` (statut `scheduled`, joueurs facultatifs), se modifie (`PATCH`), s'ouvre (`POST …/open`) et s'annule (`POST …/cancel`). Deux sessions ne peuvent pas se chevaucher dans une salle (`slot_taken`). L'annulation efface les e-mails des joueurs. La suppression d'une salle annule ses sessions à venir. La liste des parties filtre sur la date prévue et rend les champs de session.
  US: US-SESSION-02 (#142)

- Écran de réglage des créneaux d'une salle, ouvert depuis la liste des salles (admin et superadmin) : fuseau, jours et heures d'ouverture, durée de créneau, pause, pupitres réservables, réservation publique, avec aperçu des créneaux de chaque jour de la semaine type, enregistrement et désactivation après confirmation.
  US: US-SESSION-01 (#142)

- Journaux des salles : l'écran de salle envoie ses erreurs au backoffice (`POST /room/logs`, table `room_logs`, erreurs regroupées, e-mails masqués, contexte limité à une liste blanche, 6 envois par minute et par salle). Lecture par le superadmin et l'admin : `GET /companies/:companyId/rooms/:roomId/logs`. Conservation : `ROOM_LOG_RETENTION_DAYS` jours (30 par défaut) et 5000 lignes par salle. L'écran du backoffice viendra dans un lot suivant.
  US: US-LOG-01 (#157)
- Écran d'import de questions par fichier CSV, accessible depuis la liste des questions (admin et superadmin) : modèle téléchargeable, vérification à blanc avec rapport par ligne, import confirmé seulement si la vérification ne trouve aucune erreur.
  US: US-IMPORT-01 (#158)

- Logo du centre : envoi, remplacement et retrait depuis la fiche de la compagnie (`PUT` et `DELETE /companies/:companyId/logo`, PNG, JPEG ou WebP, 512 Ko au plus, type vérifié sur les premiers octets, SVG refusé). Le logo est servi par `GET /public/v1/logos/:file` et exposé par `logoUrl` dans `/room/me` et les routes des compagnies.
  US: US-RESULTS-01 (#156)
- Réglages de créneaux d'une salle : `PUT /companies/:companyId/rooms/:roomId/schedule` (admin et superadmin) écrit `rooms.schedule` (fuseau, durée de créneau, pause, pupitres réservables, heures d'ouverture par jour). `null` remet la salle sans créneaux. Le champ `schedule` est renvoyé par les routes des salles et par `/room/me`.
  US: US-SESSION-01 (#142)
- Demandes de démonstration côté serveur : route publique `POST /public/v1/demo-requests` (5 envois par heure et par adresse, champ piège contre les robots), consultation, traitement et suppression par le superadmin (`/demo-requests`), purge automatique 12 mois après la création. Aucun e-mail n'est envoyé.
  US: US-CONSOLE-02 (#161)
- Consentement aux offres du centre séparé de la conservation de l'e-mail : deux cases distinctes à la création d'une partie, jamais pré-cochées, la seconde inactive sans e-mail. Nouvelles colonnes `marketing_consent_at` et `second_marketing_consent_at` sur `game_participants`, horodatées par le serveur et effacées par la purge à 3 ans. L'API renvoie `marketingConsent` et refuse un consentement sans e-mail (400 `marketing_consent_requires_email`).
  US: US-JOIN-01 (#166)

- Backoffice : l'historique des sessions se filtre par salle, état et période, avec pagination et colonnes date, salle, joueurs, durée et meilleur score ; `GET /companies/:companyId/games` répond désormais `{ games, total }` et accepte `state`, `roomId`, `from`, `to`, `limit` et `offset`.
  US: US-HISTORY-01 (#157)
- Import de questions par fichier CSV (`POST /questions/import`) : essai à blanc, import tout ou rien avec erreurs numérotées par ligne, portée `global` ou `company` selon les droits, sans écran pour l'instant.
  US: US-IMPORT-01 (#158)
- Backoffice : une feuille de résultats imprimable (classement avec égalités, centre, salle, date, sans e-mail de joueur) est accessible depuis la fiche d'une partie terminée.
  US: US-APRES-01 (#156)

- Sessions programmées, socle (lot 13) : états de partie `scheduled` et `cancelled`, créneaux prévus avec interdiction de chevauchement par salle (contrainte d'exclusion PostgreSQL), réglages de créneaux d'une salle (`rooms.schedule`), constantes partagées et codes d'erreur `fr`/`en`. Aucune route ni écran pour l'instant.
  US: US-SESSION-00 (#142)
- Calcul pur des créneaux d'une salle (`computeRoomSlots`, `zonedLocalToUtc`) dans `@quizzup/shared`, avec gestion des changements d'heure.
  US: US-SESSION-00 (#142)
- Site vitrine public (`vitrine/`) : accueil avec des captures réelles de l'écran de salle, demande
  de démonstration, mentions légales, confidentialité, page 404. Site statique Vite, sans cookie ni
  script tiers ; nom, domaine et coordonnées lus dans `vitrine/site.config.ts` (valeurs légales à
  compléter). Le formulaire de démonstration vise `POST /public/v1/demo-requests`, route livrée
  dans un lot suivant ; avec JavaScript, une erreur d'envoi affiche l'adresse de contact, sans
  JavaScript le formulaire ouvre la messagerie (`mailto:`). Le build refuse les valeurs légales
  non renseignées (dérogation `VITRINE_DRAFT=1`). Script de captures
  `npm run captures` dans `game/e2e`. Nouveau job `vitrine` dans la CI GitHub (lint, types, tests,
  build, Lighthouse à 95 au moins sur les quatre catégories).
  US: US-SITE-01
- Guides pour les centres (`docs/guides/`) : installation d'une salle, utilisation quotidienne,
  dépannage, migration d'une salle existante, sécurité de la fumée et des lumières. Les libellés
  cités sont ceux des écrans ; chaque point qui n'a pas été essayé sur du vrai matériel porte la
  mention « À vérifier sur le banc ».
  US: US-DOC-01
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

- Écran de salle : boutons et mises en page recalés sur l'accueil, les assistants de configuration, l'écran Matériel, le lobby, l'inscription et la connexion. Un seul bouton principal par écran, cibles d'au moins 48 px (plan de salle compris), barres d'actions alignées, rien ne déborde à 1280 px ni à 768 px.
  US: US-UX-01 (#132)
- **Rupture de déploiement.** Console éditeur : le compte superadmin ne peut plus se connecter ni appeler l'API que depuis les adresses de `CONSOLE_ALLOWED_CIDRS` (401 `invalid_credentials` à la connexion, 403 `forbidden` ensuite). Variable vide ou absente = console fermée : la renseigner avant de déployer. La même variable, séparée par des espaces, remplace `EDITOR_ALLOWED_RANGES` côté Caddy de production, et les réseaux Docker de recette et de production ont un sous-réseau fixe à nommer dans `TRUST_PROXY` (réseau à recréer une fois, voir les README de `deploy/`).
  US: US-CONSOLE-01 (#161)
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

- Relais PowerShell des lumières, tests : les attentes d'une trame ou d'un paquet attendu ne coupent plus à 2 s. Sur le runner Windows de la CI, une pause ponctuelle faisait échouer « lit les origines dans QUIZZUP_BRIDGE_ORIGINS et répond 426 hors WebSocket ». Le délai (20 s) ne sert plus qu'à détecter un blocage.
  US: US-SHOW-01 (#203)

- Vitrine : le formulaire de démonstration envoie ses champs sous les noms attendus par `POST /public/v1/demo-requests` (`centerName`, `roomsCount`), respecte les bornes du serveur (50 salles, centre sur 160 caractères, message facultatif) et signale sous chaque champ ceux que le serveur refuse.
  US: US-SITE-01 (#133)
- Sécurité lumière : avertissement non bloquant quand un canal `shutter` ou `fixed` est réglé dans la plage stroboscope de l'appareil (`strobeRange`, facultatif, à saisir sur un profil sur mesure) ; stroboscope du Diagnostic plafonné en vitesse et coupé après 3 secondes. Non validé sur du vrai matériel (banc, cas D10).
  US: US-SEC-05 (#152)
- Sécurité : l'écran de salle n'arme la fumée activée par la configuration du serveur que si un test de coupure réussi est mémorisé sur ce poste, pour cette salle et ces réglages de fumée ; sinon aucun jet ne part et un message demande de refaire le test. Un test relancé efface la preuve jusqu'à sa réussite. Non validé sur du vrai matériel (banc, cas F9).
  US: US-SEC-04 (#152)
- Import CSV : le message d'erreur sur la colonne des bonnes réponses était tronqué, le caractère `|` étant lu comme un séparateur de pluriel par la traduction.
  US: US-IMPORT-01 (#158)

- Sécurité : la mise en pause d'une partie coupe aussitôt tout jet de fumée en cours (trame à 0 envoyée tout de suite) et refuse tout nouveau jet pendant la pause, y compris l'étape fumée d'une scène déjà lancée, le test manuel et le test de gel. Les lumières continuent ; l'étape fumée manquée n'est pas rejouée à la reprise. L'arrêt d'une partie ramène toujours les lumières au repos. Non validé sur du vrai matériel (banc, cas F8).
- Sécurité (photosensibilité) : dans toute la salle, deux éclairs des scènes lumière sont séparés d'au moins 0,4 s, mesuré sur le niveau réellement émis. Les cadences par défaut sont ralenties (buzz, bonne et mauvaise réponses, victoires, début de partie, nouvelle manche, fin de manche) et un éclair trop rapproché est retardé, y compris à la jonction de deux scènes. Non couverts, traités dans un lot à part : appareils à stroboscope intégré (`shutter`, canaux `fixed`), diagnostics, stroboscopes pilotés par une liste. Non validé sur du vrai matériel.
  US: US-SEC-02 (#152)

- Lumières : les stroboscopes ne sont plus allumés en continu par les scènes générales ; un pupitre sans appareil n'assombrit plus la salle au buzz ; le buzz juste après une mauvaise réponse garde sa lumière ; la victoire à égalité a sa propre scène qui allume toute la salle.
  US: US-SHOW-01 (#145)
- Sécurité : le backoffice ne peut plus régler les lumières ni la machine à fumée d'une salle (section `lighting` : fumée, appareils DMX, profils, liaisons de scènes). `PATCH` et création de salle refusent avec 403 `smoke_config_forbidden` ; seule la coupure de la fumée (`lighting.smoke.enabled` de vrai à faux, le reste identique) reste permise. Le réglage se fait sur place, depuis l'écran de salle. Limite connue : le compte de salle (`PUT /room/config`) n'est pas couvert, c'est un lot à part (#152). Le `PATCH` d'une salle répond 409 `room_config_conflict` si sa configuration a changé entre-temps.
  US: US-SEC-03 (#152)
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
