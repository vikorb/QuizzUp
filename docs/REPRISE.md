# Reprise du projet QuizzUP

> Point d'étape du 2026-11-04, complété le 2026-11-24 (§2.0) : on arrête le mode « projet multi-threads » et on reprend dans une
> seule session Claude Code ouverte sur ce dépôt, avec des sous-agents si besoin. Ce fichier dit où
> en est le projet et comment continuer. Lire aussi `CLAUDE.md` (conventions, commandes).

## 1. État de `main`

Tout le travail mergé est sur `main`. Les grandes briques :

| Brique                                                                                            | Où                                       | PR principales               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------- |
| CI GitHub (lint, types, tests, migrations, moteur, matériel, salle, e2e, pont Art-Net)            | `.github/workflows/ci.yml`               | #65                          |
| Backoffice : salles, comptes de salle, parties, 2e joueur par pupitre, emails masqués pour `user` | `backoffice/`                            | #71, #76                     |
| Type de question `kind` (qcm, true_false, estimate) et ses règles de réponses et de média         | `backoffice/shared`, routes questions    | #76, #82, #87                |
| Moteur pur : blind test éclair + 9 mini-jeux                                                      | `game/engine`                            | #66, #75                     |
| Matériel : buzzers clavier / manette USB, DMX USB, fumée sécurisée, pont Art-Net                  | `game/hardware`                          | #68, #73, #80, #83, #85      |
| Audio Web Audio + upload des extraits au backoffice                                               | `game/audio`                             | #69                          |
| Écran de salle (lobby staff, partie reçue du backoffice, mini-jeux, config matériel en base)      | `game/room-app`                          | #70, #72, #77, #78, #84, #86 |
| Tests de bout en bout Playwright                                                                  | `game/e2e`                               | —                            |
| Version testable : `npm run demo`, comptes démo, recette VPS (Caddy)                              | racine, `deploy/recette`, `docs/recette` | #79                          |

Comptes démo : `demo-admin` / `salle1-demo`, mot de passe `Demo1234!` (voir `docs/recette/guide-de-test.md`).

## 2. Travail en cours au moment de l'arrêt

### 2.0 Point de reprise du 2026-11-24 : V1 menée en parallèle

Consigne d'Enzo : mener de front tous les lots indépendants (coordinateur Fable 5.2, sous-agents
selon `CLAUDE.md` §4.1). **Pour reprendre** : `gh pr list -R vikorb/QuizzUp` donne les PR
ouvertes ; chaque PR ouverte a sa copie de travail sous `.claude/worktrees/<nom>` ; traiter les PR
ouvertes ci-dessous avant de lancer un nouveau lot.

**Références** : conceptions par lot dans `docs/cadrage/conception-*.md` ;
`docs/cadrage/conceptions-arbitrages.md` prévaut (ordre des lots, horodatages de migration
réservés, identifiants `US-…`).

**Mergé sur `main` depuis le 23 novembre** :

| Domaine               | PR                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Pilotage en direct    | #130 flux SSE, #136 et #140 présence (backoffice, salle), #131 passer et pause                                                           |
| Sécurité de salle     | #153 fumée non activable par le backoffice, #155 plafond de 3 éclairs par seconde, #159 fumée coupée à la pause                          |
| Sessions programmées  | #154 socle (statut `scheduled`, contrainte d'exclusion), #171 réglages de créneaux d'une salle (serveur)                                 |
| Exploitation, contenu | #160 feuille de résultats, #163 import CSV (serveur), #164 historique filtré et paginé, #169 consentement aux offres séparé              |
| Console de l'éditeur  | #165 garde réseau du superadmin, #168 demandes de démonstration (serveur)                                                                |
| Public                | #139 site vitrine (`vitrine/`), #150 socle `/public/v1` et limiteur de débit                                                             |
| Jeu                   | #148 mini-jeux tirés sans remise, #151 effets sur les extraits et voix d'annonces, #162 boutons et mises en page de l'écran de salle     |
| Production, outillage | #137 pile de production (`deploy/prod/`), #138 guides, #147 conceptions, #149 dépendances, #172 tests PostgreSQL de la CI pris par motif |

**PR ouvertes au moment de l'écriture** (relecture indépendante faite et corrections poussées,
sauf mention) :

| PR   | Lot                                           | Copie de travail   | Reste à faire                                                                                               |
| ---- | --------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| #170 | 6a logo du centre                             | `logo-centre`      | merger dès que la CI est verte                                                                              |
| #174 | 8b écran d'import CSV                         | `import-ecran`     | merger dès que la CI est verte                                                                              |
| #167 | 7e journaux d'erreurs des salles              | `journaux-salle`   | merger dès que la CI est verte                                                                              |
| #176 | S4 fumée armée après un test de coupure local | `fumee-test-local` | merger dès que la CI est verte (même fichier `roomHardware.ts` que #167 : conflit possible)                 |
| #173 | 13.7 écran de réglage des créneaux            | `reglages-ecran`   | merger dès que la CI est verte                                                                              |
| #177 | 13.3 programmer, modifier, ouvrir, annuler    | `sessions-backend` | **relecture en cours**, puis corrections, puis merge                                                        |
| #175 | 13.5 écran Agenda                             | `agenda`           | merger **après #177** ; « Programmer » attend 13.6                                                          |
| #178 | 12d TOTP du superadmin (serveur)              | `totp-serveur`     | **relecture en cours** ; à merger avec l'écran en deux temps (12f), sinon le superadmin ne se connecte plus |
| #179 | S5 stroboscope autonome                       | `strobe-autonome`  | **relecture en cours**, puis corrections, puis merge                                                        |

Après chaque merge, les autres PR sont en conflit sur `backoffice/CHANGELOG.md` côté GitHub
(l'attribut `merge=union` ne vaut qu'en local) : fusionner `origin/main` dans la branche, pousser,
attendre la CI, merger. Une PR à la fois.

**Ordre des lots suivants** (chacun : issue, branche, PR, une relecture, merge) :

1. Sessions (#142) : 13.4 routes de salle et 14.0 socle de réservation (après #177) ; 13.6
   formulaire de programmation (après #175 ; `CreateGameView.vue` lit `?roomId=` et
   `?scheduledAt=`) ; 13.8 écran de salle ; 13.9 événement `schedule_changed`.
2. Console (#161) : 12f écran de connexion en deux temps (contrat de #178) ; 12e deux builds du
   frontend (après #174 et #175, même routeur et même barre latérale) ; 12g écran des demandes de
   démonstration ; formulaire de la vitrine branché sur `POST /public/v1/demo-requests`.
3. Accueil par QR code (#166) : 2a après #177 (mêmes fichiers `routes/games*`), puis 2b à 2f.
4. Exploitation (#157) : 7d statistiques, 7f écran des journaux (après #167), 7b, 7c, 7g.
5. Après-partie (#156) : 6b à 6g (bons, e-mail de résultats). Contenu (#158) : 8c à 8e.
6. Pilotage (#129) : fin du polling, suivi en direct, commandes à distance. Formats (#143),
   spectacle (#145), audio (#144), API de réservation (lot 14, issue à créer).
7. Ordre des modifications de `routes/room.ts` : 2a, 6a, 8c-1, 8d, 8e.

**Jamais vérifié** : aucun écran neuf n'a été regardé dans un navigateur (agenda, créneaux, import,
historique, feuille de résultats, logo, cases de consentement, alerte fumée) ; rien sur du vrai
matériel ; pile de production jamais montée sur une machine ; SSE derrière Caddy ; SonarQube et
Lighthouse du backoffice non lus (CI GitLab hors de portée de ce poste).

**Choix par défaut pris sans Enzo, à confirmer** : plafond des éclairs (3 par seconde, 400 ms) ;
fumée coupée à la pause ; chaque poste refait le test de coupure une fois (#176) ; le backoffice ne
modifie plus `lighting` ; fuseaux en noms IANA seulement ; journaux de salle gardés 30 jours et
5 000 lignes ; demandes de démonstration gardées 12 mois, 5 par heure et par adresse, sans envoi
d'e-mail ; logo de 512 Ko au plus, sans SVG ; TOTP sans QR code ; mini-jeux du lot 4 hors V1.

**Suivis mineurs relevés en relecture** (à regrouper dans une PR) : clés i18n `invalid_query`,
`payload_too_large`, `bad_request` et codes `schedule_*` ; cibles de 48 px de `SwitchField` et
`BaseToolBar` ; colonnes du modèle CSV à déplacer dans `@quizzup/shared` ; grille de créneaux
vide à refuser ou signaler ; `diagnostics.setChannel` non plafonné ; §1.8 du guide de sécurité
à mettre à jour (le plafond des éclairs existe) ; cas F9 du banc : test relancé puis page
rechargée ; `openapi.yaml` référence des schémas absents de `components` ; `knip` à relancer.

### 2.1 Sessions précédentes

- **Session du 2026-11-23 : lot 1 du cadrage V1, « Pilotage en direct »** (issue #129,
  US-LIVE-01). Canal retenu : SSE du serveur vers les clients, lu par `fetch` (en-tête
  `Authorization`), et POST de la salle vers le serveur ; hub en mémoire, donc **une seule instance
  du backend** tant qu'on n'est pas passé à PostgreSQL LISTEN/NOTIFY. Découpage en sept PR, coché
  au fil de l'eau dans l'issue #129 :
  - **1a présence, serveur** : PR #130 (`GET /room/stream`, `POST /room/status`,
    `GET /companies/:companyId/live`, `createSseParser` dans `@quizzup/shared`, Caddy de recette
    sans mise en tampon sur les deux flux) ;
  - 1b présence, clients (écran de salle et backoffice, clés i18n des nouveaux codes d'erreur) ;
  - 2 fin du polling de 3 s ; 3 suivi en direct ; 4 moteur : passer et pause ; 5 commandes côté
    serveur et salle ; 6 commandes côté backoffice.
  - **À valider en recette et sur le banc** : flux de plus de 10 minutes derrière Caddy, lancement
    à distance sur le poste kiosque (son compris), pause pendant un jet de fumée.
  - **Cinq choix par défaut à confirmer par Enzo**, listés en bas de l'issue #129.
- **PR #128 mergée (2026-11-23)** : méthode Claude du dépôt (`.claude/agents`, `.claude/rules`,
  `.claude/skills`) et complément de cadrage `docs/cadrage/cadrage-v1-interfaces.md`.
- **Session du 2026-11-04 (nuit) → 2026-11-05 : plan « salle »** (audit et lots L1 à L14 dans
  `docs/cadrage/plan-salle.md`). Recette Docker simulée faite dans le conteneur cloud (58 OK,
  anomalies A0 à A2 corrigées). Mergé, aucune PR ouverte :
  - #105 (L1 un seul onglet par poste, L2 horodatage des buzzs par `event.timeStamp`) ;
  - #106 (L3 arrêt d'urgence conservé au redémarrage des lumières, L4 reprise automatique du pont) ;
  - #107 (L8 plusieurs univers DMX : `FixtureConfig.universe` 0..15, USB limité à l'univers 0) ;
  - #108 (A0 : `pg` lit les bigint en nombre, les admins de compagnie retrouvent leurs thèmes ;
    les tests `*.pg.test.ts` refusent toute base dont le nom ne finit pas par `_test`) ;
  - #109 (A1 statut de la fumée rafraîchi à la fin du jet et de la pause, A2 l'assistant explique
    pourquoi il enregistre la fumée désactivée) ;
  - #110 (L5 `rooms.config_revision` : `PUT /room/config` avec `revision`, 409 + config courante
    si périmée ; le poste applique la config du compte et prévient, sans renvoi automatique ;
    limite connue : le `PATCH` du backoffice n'envoie pas de révision) ;
  - #111 (L12 roue de couleurs, shutter, inversion et butées pan/tilt, lyres génériques 9/11/16
    canaux, éditeur de profil ; valeurs de roue **à relever sur la notice**) ;
  - #112 (L9 l'IP du nœud Art-Net se règle dans l'écran de salle, `lighting.artnet.target` ; le
    pont n'accepte que des IP locales, jamais un port choisi par la salle, `--target` prioritaire) ;
  - #114 (L13 calage des lyres au clavier dans l'assistant : flèches, Maj = pas fin, Entrée valide,
    P copie le pupitre précédent, G/H inversent ; boutons cliquables équivalents, car G/H sont des
    buzzers du préréglage 6 pupitres ; valeur bornée à `panRange`/`tiltRange`) ;
  - #115 (L10 découverte des nœuds Art-Net : `{"type":"poll"}` → ArtPoll en diffusion, réponses
    écoutées aussi sur le port 6454 ; IP = expéditeur, locale, 64 nœuds et 16 univers max ;
    **à valider sur un vrai nœud** Showtec NET-2/3) ;
  - #116 (tests room-app qui attendaient une navigation : écrans paresseux préchargés depuis
    `routes`, fin de l'instabilité « expected 'lobby' to be 'play' » sous charge) ;
  - #118 (L11 exécutable Windows unique du pont, Node SEA, **sans signature** ; job CI
    `windows-latest` qui le construit, le teste et analyse les scripts PowerShell) ;
  - #119 (L6 kit « poste de salle » `deploy/poste-salle/` : politiques Chrome, pont en tâche
    SYSTEM au démarrage, pare-feu UDP 6454 ; **Chrome seul, Windows Pro et Home**) ;
  - #120 (L7 fumée : autorisée avec un relais (tous les canaux fumée `binary`, jugé sur les
    canaux et non sur `kind`), ou sans relais si la case « la machine coupe sur perte de signal »
    est cochée **et** le test guidé de vrai débranchement DMX réussi ; gel du pont `hold`
    plafonné à 15 s, `release` envoyé si la confirmation tarde).
  - **L14 (cache hors ligne) reporté en V2.**
  - **À valider sur TERMIVAVOR2** : scripts PowerShell (jamais exécutés en vrai),
    `chrome://policy` sous Home, Local Network Access, Smart App Control, vrai nœud Art-Net,
    roue de couleurs, calage des lyres, 2 univers, test de débranchement de la fumée.
  - #122 (L15 couleurs et coins des buzzers `buzzers.layout`, plan de salle 2D `config.plan` en
    glisser-déposer et au clavier, réponses de jeu dans la couleur et la place du vrai buzzer ;
    inspiré de `GameShowStage.tsx` du dépôt `enzodrissi/quizzup-fableversion`) ;
  - #123 (L16 configuration plein écran « façon jeu » `/setup` : bienvenue → couleurs → nombre
    de pupitres → « Appuie sur le buzzer violet (B) » pupitre par pupitre ; bouton sur l'accueil
    tant que `setupDone` est faux) ;
  - #124 (L17 lumières plein écran `/setup/lights` : recherche USB / Art-Net, modèle 6 pupitres
    (fumée existante conservée), « Est-ce que ça s'allume ? Oui / Non » appareil par appareil ;
    la fumée reste réglée dans l'assistant détaillé, garde-fous non dupliqués).
  - **Pistes suivantes** : plan de salle en perspective (fausse 3D) ; placement des appareils
    depuis `/setup/lights` ; validation sur TERMIVAVOR2 du parcours complet avec de vrais buzzers.
- **Décisions d'Enzo du 2026-11-04 (soir), mergées** : #101 (`backoffice/backend/.env` sorti de
  git ; les tests backend se replient sur `.env.example` ; **sauvegarder son `.env` avant le
  pull**, git le supprime du disque), #102 (baisser le nombre de pupitres garde en **réserve** les
  buzzers et lumières des pupitres retirés, restitués si on remonte), #103 (retypage de l'ancien
  contenu : `true_false` si exactement « vrai »/« faux », `estimate` seulement si chaque réponse
  est une fourchette en mots ; sinon `qcm` ; table de trace `question_kind_retypings` pour le
  `down` ; test PostgreSQL lancé en CI). Purge RGPD : par compagnie, confirmée.
- **Session du 2026-11-04 : tout est mergé, aucune PR ouverte.** PR #91 (mini-jeux), #97 (réessai
  de l'envoi des scores), #94 (type, média et réponses sous verrou), #98 (purge RGPD), #93
  (hygiène du dépôt : `backoffice/shared/node_modules` sorti de git, `format:check` en CI ; après
  un pull, relancer `cd backoffice/shared && npm install`), #92 (6 pupitres), #99 (reprise de
  sauvegarde liée au compte de salle), #95 (verrou clavier avec la carte manette, fondus du synthé),
  #96 (lint-staged n'applique plus eslint aux migrations).
- **PR #88 mergée** : l'écran de salle appelle `POST /room/games/:id/finish` au podium ; la
  partie passe « terminée » et les scores sont enregistrés.
- **PR #91 (lot 1, mini-jeux)** : choix des mini-jeux à la création d'une partie (cases à cocher,
  tout coché par défaut ; tout coché = `null` = tous, y compris un futur mini-jeu, règle appliquée
  aussi par le serveur). Stocké dans `games.mini_games`, renvoyé par `GET /room/games/current`.
  Côté salle : choix du backoffice, sinon réglage local, sinon tous ; codes inconnus ignorés ; une
  sélection injouable (participants ou contenu) est refusée avant `startRoomGame`
  (`getPlayableMiniGames` exporté par `game/engine`).

## 3. Décisions d'Enzo (à respecter)

- 100 % navigateur (pas d'Electron), le moteur tourne sur le PC de la salle. On garde les comptes de salle.
- Blind test éclair : tout le monde joue en même temps, premier buzz juste gagne 100/50/20 selon le
  palier 1 s / 5 s / 20 s ; une erreur bloque le joueur pour ce palier seulement ; palier suivant
  seulement si personne n'a trouvé ; pas de pénalité. Plusieurs bonnes réponses possibles.
- Mini-jeux : même probabilité pour tous en V1. Premier buzz faux = −25 pts (jamais sous zéro), la main passe.
- Joueurs : 2 par pupitre (le 2e facultatif, nom + email RGPD chacun), score = celui du pupitre.
  Emails conservés 3 ans après la dernière partie. Seul le backoffice inscrit les joueurs et lance la
  partie ; l'écran de salle n'inscrit personne. Emails masqués pour le rôle `user`.
- Salles : une salle inactive garde son PC connecté mais ne lance pas de partie ; une compagnie
  désactivée déconnecte ses PC de salle ; l'identifiant d'un compte de salle supprimé reste réservé.
- Matériel : config stockée dans `rooms.config`. Lumières par interface USB DMX par défaut, Art-Net
  en option (pont local). Fumée = relais DMX + relais temporisé physique 10 s, arrêt d'urgence obligatoire.
- Compatibilité avec les salles du concurrent (6 pupitres, carte manette, DMX) : reprendre seulement
  des valeurs d'installation, jamais leur code ni leurs contenus. Voir `docs/compatibilite/`.
- SACEM et pricing : plus tard.
- **6 pupitres : oui, 6 au maximum, 4 par défaut** (décision du 2026-11-04).

## 4. Lots restants, par priorité

> **Depuis le 2026-11-16, la feuille de route est `docs/cadrage/cadrage-v1.md`** (lots 0 à 10 de la
> V1 commerciale). Le lot 0 est le banc matériel (`docs/recette/banc-materiel.md`), qui reprend le
> point 3 ci-dessous. La liste ci-dessous reste comme historique.

1. ~~**Mini-jeux dans une partie lancée du backoffice**~~ : fait (PR #91).
2. ~~**Fin de partie** : réessai de l'envoi des scores après une panne réseau~~ : fait (PR #97). File persistante `quizzup_room_pending_finishes`
   (`room-app/src/game/pendingFinishes.ts`) : survit au rechargement et à une nouvelle partie ;
   essais à 2 s, 5 s, 15 s, 30 s puis toutes les 60 s, essai immédiat sur `online`, vidage au
   démarrage et à la connexion du compte de salle ; 404/409/400 abandonnés, 401/403 attendent une
   reconnexion. État affiché au podium, bandeau dans le lobby staff.
3. **Tests matériel réels** sur TERMIVAVOR2 : buzzers (clavier AZERTY, carte manette), interface
   USB DMX quand Enzo l'aura (tout est testable en simulation d'ici là), relais fumée temporisé
   10 s maximum. En salle compatible concurrent : vérifier l'ordre des canaux des lyres 9 canaux
   et leur canal strobe ; vérifier le contrat d'un centre avec le concurrent avant de le migrer.
   Dans `room-app/src/hardware/roomHardware.ts`, s'assurer que `createGamepadBuzzerInput` reçoit
   bien le `gamepadMatcher` quand `buzzers.source.kind` vaut `'gamepad'`.
4. **Recette VPS** : déployer `deploy/recette/` dès qu'Enzo donne l'IP et l'accès SSH du VPS.
5. ~~**Purge RGPD** des emails joueurs 3 ans après leur dernière partie~~ : fait (PR #98). Purge planifiée dans le backend (30 s après le démarrage puis
   toutes les 24 h, `PLAYER_EMAIL_PURGE_INTERVAL_HOURS=0` pour la couper) et
   `npm run purge:emails` dans `backend/`. Purge **par compagnie** (le consentement est donné au
   centre) : un joueur = son email (joueur 1 ou 2e joueur) dans une compagnie ; dernière partie
   dans cette compagnie = `COALESCE(finished_at, started_at, created_at)`, parties supprimées
   comprises ; au-delà de 3 ans, email et consentement effacés dans les parties de cette
   compagnie seulement, noms et scores gardés. Tout se fait en SQL (verrou consultatif) ; test
   d'intégration PostgreSQL dans la CI (job migrations).
6. ~~**6 pupitres**~~ : fait (PR #92). `GAME_PODIUMS` = 6 (`@quizzup/shared`) ;
   migration `20261104040000` (CHECK `podium` 1..6, retour arrière refusé si un pupitre 5 ou 6 est
   utilisé) ; nombre de pupitres d'une salle = `rooms.config.desksCount` (1 à 6, absent = 4), réglé
   dans l'écran Matériel (onglet Buzzers et assistant), renvoyé par `GET /companies/:id/rooms`
   (`desksCount`) ; le formulaire de lancement ne propose que les pupitres de la salle, le backend
   refuse au-delà (`400 podium_not_in_room`). Écran de salle : lobby, apprentissage, test des
   buzzers, lumières et clavier de simulation (pupitres 5 = `5-8`, 6 = `T Y U I`) suivent
   `desksCount` ; couleurs `--desk-5` / `--desk-6`. Vol de points : désignation directe A-D tant que
   tous les pupitres sont de 1 à 4 ; dès un pupitre 5 ou 6, A recule / B avance la cible (en boucle),
   C ou D valide, sans validation le vol vise le plus riche (cible automatique, en surbrillance au
   départ). Reste à faire à la main : essai sur un vrai écran 5-6 joueurs (mise en page vue seulement
   en tests) et sur la carte manette 24 entrées.
7. Plus tard : SACEM, pricing, mode hors ligne (V2).

Petits suivis connus : ~~`LaunchView` reprend
n'importe quelle sauvegarde~~ (fait : PR #99, reprise limitée au contexte courant) ; typage
de l'ancien contenu (fait : PR #103, règle plus stricte que le moteur pour ne verrouiller aucun
vrai QCM).

## 5. Process de travail

- Une branche par lot (`feat/…`, `fix/…`), Conventional Commits (husky + commitlint).
- Avant PR : `lint`, `type-check`, tests verts dans chaque paquet touché (voir `CLAUDE.md` §5).
- Consigne d'Enzo : relecture par **un** sous-agent indépendant (sans lui donner ses conclusions),
  corriger, puis merger soi-même (merge commit) une fois la CI GitHub verte. Lister les points
  mineurs en « Suivis » dans la PR.
- Mettre à jour OpenAPI, DBML, CHANGELOG (lignes `US:`), i18n fr/en selon le changement.
- Pas de relecture en double. Depuis le 23 novembre, Enzo demande de lancer de front tous les
  lots réellement indépendants ; deux lots qui touchent les mêmes fichiers restent en série.
- Les sous-agents ne lancent aucune commande git d'écriture ; le coordinateur écarte les
  `package.json` et `package-lock.json` modifiés par `npm install` avant chaque commit.
- Les tests `*.pg.test.ts` partagent une base : chaque fichier prépare ses données et laisse la
  base migrée au dernier état.
- **Organisation des agents (impératif, voir `CLAUDE.md` §4.1)** : la session principale
  (Opus 5.5) coordonne et ne code pas ; développement = Sonnet 5.5 effort élevé ; recherche ou
  lecture d'information = Haiku 5.5 (agent `lecteur`) ; réflexion, conception et relecture de PR =
  Opus 5.5. Modèle toujours explicite ; sous-agents surveillés, jamais bloqués ni en boucle.
- **Outillage Claude du dépôt (23 novembre, voir `CLAUDE.md` §4.2)** : agents `developpeur`,
  `lecteur`, `relecteur`, `architecte` dans `.claude/agents/` ; règles par zone dans
  `.claude/rules/` ; skills `/lot`, `/verifier`, `/nouveau-mini-jeu`. Fable 5.2 coordonne les très
  gros chantiers.
- **Compléments de cadrage (23 novembre)** : `docs/cadrage/cadrage-v1-interfaces.md` propose les
  lots 11 à 14 (vitrine, console éditeur isolée, sessions programmées, API de réservation), **à
  valider par Enzo et Victoria**. Le dépôt GitHub étant public, stratégie, prix, concurrence et
  hébergement restent dans `docs/prive/` (ignoré par git, à sauvegarder à part).

## 6. Pièges connus

- `npm --prefix shared install` (CLAUDE.md §5) peut ajouter une dépendance parasite
  `"quizzup-backoffice": "file:.."` dans les `package.json` : préférer `cd backoffice/shared && npm install`
  (idem pour backend et frontend), et vérifier `git diff` des `package.json`.
- Sur TERMIVAVOR2, `gh` n'est pas connecté : lancer `gh auth login` (compte `vikorb`) avant d'ouvrir des PR.
- Une autre copie de travail peut exister dans `C:\Users\enzod\Documents\QuizzUp` ; travailler dans un
  worktree séparé pour ne pas se marcher dessus.
- vue-i18n : un `@` dans un texte doit s'écrire `{'@'}` (sinon la page plante). Un test compile toutes les locales.
- Les colonnes bigint sont lues en nombres par `backend/src/db.ts` (`types.setTypeParser`, PR #108) :
  ne pas les reconvertir, ne pas créer de client `pg` ailleurs.
- Sous Windows avec `core.autocrlf=true`, la copie de travail est en CRLF et `npm run format:check`
  échoue sur tout le dépôt alors que la CI est verte. Vérifier ses fichiers avec
  `npx prettier --end-of-line auto --check <fichiers>`.
- Un dossier `node_modules` peut exister et être vide : avant de lancer les tests, vérifier une
  dépendance réelle (`backoffice/backend/node_modules/zod`), sinon erreurs `Cannot find package`.
- Le mockDb des tests backend n'applique pas les valeurs par défaut de la base.
- Les préfixes de fourchette d'estimation de `@quizzup/shared` doivent rester alignés sur le moteur
  (`RANGE_PREFIX`) ; un test de contrat dans `game/engine` le vérifie.
- `quizz_content.js` (seed) fait un TRUNCATE CASCADE : en Docker, seeds au premier démarrage seulement.

## 7. Prompt de reprise

À coller dans une nouvelle session Claude Code ouverte sur ce dépôt :

```text
Tu reprends le projet QuizzUP (dépôt vikorb/QuizzUp). Parle-moi toujours en français ; les rapports
sont de vrais fichiers exportables (.md ou .docx), pas des artefacts. Commence par lire CLAUDE.md
puis docs/REPRISE.md, qui donnent les conventions, l'état de main, mes décisions, les lots restants
par priorité et les pièges connus. Reprends au point de reprise (docs/REPRISE.md §2.0) : d'abord
les PR ouvertes, puis les lots dans l'ordre indiqué, en parallèle quand ils sont indépendants.
Pour chaque lot : branche dédiée, lint + type-check + tests verts, PR, relecture par un seul
sous-agent indépendant, corrections, merge toi-même quand la CI GitHub est verte. Mets à jour
docs/REPRISE.md à la fin de chaque lot. Sois économe en tokens et ne me dérange que pour une
décision qui change le produit.
```
