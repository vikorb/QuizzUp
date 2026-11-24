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

### 2.0 Point de reprise du 2026-11-24 (nuit) : V1 codée, recette navigateur faite

Consigne d'Enzo : mener de front tous les lots indépendants (coordinateur Fable 5.2, sous-agents
selon `CLAUDE.md` §4.1), sans laisser un agent tourner pour rien.

**Avancement estimé de la V1** : code environ 94 % ; vérification dans un vrai navigateur sur la
pile réelle environ 75 % (liste plus bas) ; **vrai matériel 0 %** (rien n'a été branché : buzzers,
lumières, fumée, nœud Art-Net) ; pile de production jamais montée. Ensemble : environ 85 %.

**Pour reprendre** : `gh pr list -R vikorb/QuizzUp` (aucune PR ouverte à la date de ce point, hors
la PR de corrections de recette décrite plus bas). Les copies de travail sous
`.claude/worktrees/` appartiennent à des PR mergées, sauf mention contraire.

**Références** : conceptions par lot dans `docs/cadrage/conception-*.md` ;
`docs/cadrage/conceptions-arbitrages.md` prévaut (ordre des lots, horodatages de migration
réservés, identifiants `US-…`). Banc matériel : `docs/recette/banc-materiel.md` (cas F20 à F30
pour la carte de la fumée). Guide de la carte : `docs/guides/fumee-carte-usb.md`.

**Décisions d'Enzo du 24 novembre** :

- Le PC de la salle n'affiche qu'une page de navigateur en plein écran. **Rien n'y est installé,
  rien n'est acheté** : le matériel de la salle est déjà en place. **Pas d'exécutable** à
  maintenir ; une extension de navigateur serait acceptable. Tout accès au matériel passe par une
  autorisation explicite demandée à l'utilisateur.
- Lumières Art-Net : le relais PowerShell (présent sur tout Windows, issue #203) est **gardé**. On
  cherche une évolution plus propre, sans rouvrir le débat tant qu'il n'y a pas de fait nouveau.
- Fumée : par la carte déjà en salle (compatible Arduino Uno R3), en USB et Web Serial (issue
  #215). Le programme de la carte est compilé par notre CI et installé depuis l'écran Matériel. À
  voir sur place : modèle réel de la carte, câble USB (5 m au plus), distance jusqu'au PC.
- Buzzers : carte de la salle lue par l'API Gamepad du navigateur (apprentissage livré).
- Catalogue de jeux : refaire les anciens jeux, en plus propre.
- Blind test : playlists par genre, un titre tiré au hasard (issue #204). Enzo doit fournir les
  liens des playlists par genre.
- Mode enfants : passer une partie existante en mode enfants efface les e-mails des joueurs,
  après confirmation (#257).
- Reportés : e-mails, textes légaux, SonarQube et Lighthouse.

Les notes non publiques (hébergement, prix, paiement, droits, recherches sur les lumières) sont
hors du dépôt, dans `docs/prive/` (ignoré par git).

**Organisation retenue** (pour aller vite sans casser) : lots regroupés par zone dans une même
PR quand ils touchent les mêmes fichiers ; branches empilées quand un lot dépend d'un autre non
mergé ; un seul relecteur par PR ; merges en train, une PR à la fois (fusion de `origin/main`,
attente de la CI GitHub, merge), jamais de rebase ni de push forcé.

**Mergé sur `main` depuis le 23 novembre** :

| Domaine               | PR                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilotage en direct    | #130 flux SSE, #136 et #140 présence (backoffice, salle), #131 passer et pause, #190 suivi en direct sur le détail d'une partie, #196 commandes à distance côté serveur                                                                                                                                                |
| Sécurité de salle     | #153 fumée non activable par le backoffice, #155 plafond de 3 éclairs par seconde, #159 fumée coupée à la pause, #176 fumée armée après un test de coupure local, #179 stroboscope autonome signalé et strobe du Diagnostic plafonné                                                                                   |
| Sessions programmées  | #154 socle (statut `scheduled`, contrainte d'exclusion), #171 et #173 réglages de créneaux d'une salle (serveur, écran), #177 programmer, modifier, ouvrir, annuler, #175 écran Agenda, #189 formulaire de programmation                                                                                               |
| Exploitation, contenu | #160 feuille de résultats, #163 et #174 import CSV (serveur, écran), #164 historique filtré et paginé, #169 consentement aux offres séparé, #167 et #182 journaux d'erreurs des salles, #170 logo du centre, #183 statistiques, #199 diagnostic à distance                                                             |
| Console de l'éditeur  | #165 garde réseau du superadmin, #168 demandes de démonstration (serveur), #178 et #184 double authentification du superadmin (serveur, connexion en deux temps), #187 deux constructions du frontend (centre, console)                                                                                                |
| Public                | #139 site vitrine (`vitrine/`), #150 socle `/public/v1` et limiteur de débit, #181 formulaire de démonstration de la vitrine, #194 socle de l'API de réservation                                                                                                                                                       |
| Jeu                   | #148 mini-jeux tirés sans remise, #151 effets sur les extraits et voix d'annonces, #162 boutons et mises en page de l'écran de salle, #186 extraits de blind test fournis, #191 catalogue des annonces vocales, #192 formats partagés et durée estimée, #193 compte à rebours, transitions, scores animés et confettis |
| Production, outillage | #137 pile de production (`deploy/prod/`), #138 guides, #147 conceptions, #149 dépendances, #172 tests PostgreSQL de la CI pris par motif, #200 tests de l'écran de jeu stables sous charge                                                                                                                             |

**Mergé le 24 novembre** (#197 à #261) :

| Domaine                    | PR                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilotage en direct         | #212 et #214 commandes à distance (backoffice, écran de salle), #248 événement `game_updated` à la place de l'interrogation du lobby, #259 scénario Playwright des commandes vues du backoffice                                                                                               |
| Sessions, accueil, joueurs | #205 routes de salle des sessions, #253 prochaine session au lobby, #257 événement `schedule_changed`, #202 accueil (API, personnel), #224 page d'inscription sur téléphone, #226 accueil sur la fiche d'une partie, #227 et #229 QR code (serveur, lobby), #225 et #238 joueurs (API, écran) |
| Formats, contenu           | #234 et #243 format de partie (serveur, backoffice et lobby), #232 et #252 mode enfants (serveur, formulaire et téléphone), #250 questions déjà vues évitées, #223 manches jouées enregistrées                                                                                                |
| Audio, playlists           | #206, #207 et #216 effet audio d'une question (stockage, lecture, formulaire), #209, #230, #241 et #249 playlists (thème, formulaire, tirage côté salle, reprise d'une partie)                                                                                                                |
| Bons de fidélisation       | #198 API, #228 backoffice, fiche et feuille, #239 page publique du bon                                                                                                                                                                                                                        |
| API de réservation         | #210 et #247 clés d'API et journal des appels (serveur, fiche client), #231 salles et créneaux, #240 réservations, #245 bac à sable, #254 contrat servi par `GET /public/v1/openapi.yaml`                                                                                                     |
| Lumières, spectacle        | #197 show réglable et modèles de salle, #217 scène de sortie, #233 lumières de pause et de reprise, #236 et #244 export et import de la configuration, #237 modèles de salle et proposition d'univers, #213, #235 et #251 relais PowerShell Art-Net, #246 identité retenue des périphériques  |
| Fumée par la carte USB     | #218 programme de la carte compilé en CI, #221 lien série, #220 installation par Web Serial, #242 fumée par la carte depuis le contrôleur, #255 carte dans l'écran Matériel, #258 test de coupure par la carte, reprise seule du lien, guide                                                  |
| Console, salle             | #208 écran des demandes de démonstration, #222 logo du centre sur l'écran de salle                                                                                                                                                                                                            |
| Tests, outillage           | #219 endurance sur trois parties, #256 inscription par QR et impression de la feuille, #261 ESLint sur le TypeScript du backend et référence de média partagée, #211 point de reprise précédent                                                                                               |

**Après ce point** : corrections trouvées pendant la recette navigateur (branche
`fix/recette-navigateur`) : champ de date de l'Agenda écrasé (29 px de large), boutons des pages
publiques en police système, libellé « Demandée le … », accords au singulier (« 1 manche × 1
question », « 1 min »). En cours : scénario Playwright du test de coupure par la carte (branche
`test/e2e-coupure-carte`, copie de travail `journaux-salle`).

**Vérifié dans un vrai navigateur, sur la pile Docker réelle** (sans erreur de console) :

- _Backoffice_ : programmation d'une session, modification, ajout d'un joueur avec e-mail et
  consentement, passage en mode enfants (annulation et confirmation) ; fiche client (clé d'API
  créée, secret montré une fois, révocation avec confirmation, journal des appels, réglages des
  créneaux) ; agenda ; thèmes (thèmes globaux en lecture seule, thème audio avec lien de
  playlist) ; suivi en direct, pause et reprise à distance, arrêt d'une partie ; fiche d'une
  partie terminée, émission d'un bon, feuille de résultats imprimable avec QR code ; liste des
  bons, recherche par code, bon marqué comme utilisé ; liste des joueurs.
- _API publique_ (par `curl`) : salles, disponibilités, réservation, rejeu idempotent, créneau
  pris, créneau fermé, corps invalide, clé absente ou invalide, contrat servi. La réservation
  apparaît dans l'agenda.
- _Écran de salle_ : connexion, accueil, lobby avec la prochaine session, partie reçue du
  backoffice sans rechargement, QR code d'inscription, partie complète jouée aux buzzers clavier,
  pause et reprise appliquées, arrêt à distance, fin de partie et scores renvoyés.
- _Téléphone_ (375 px) : page d'inscription (cibles de 48 px, consentement, âge), validation par
  le personnel, joueur affiché sur la salle en direct ; page publique du bon.

**Jamais vérifié** : tout le vrai matériel (buzzers, DMX, Art-Net, carte de la fumée, relais
PowerShell face au vrai nœud) ; panneau de la carte de fumée et `/setup` dans un navigateur ;
lecture d'un vrai QR code par un téléphone ; blind test par playlist avec de vraies playlists
(liens attendus) ; console de l'éditeur et TOTP avec une vraie application ; `caddy validate`,
images de production, SSE et `TRUST_PROXY` derrière Caddy ; plan d'exécution du journal des
appels sur une base remplie ; SonarQube et Lighthouse (reportés).

**Démonstration locale** : `npm run demo` sert la copie de travail principale. Ouvrir
`http://localhost:4173` (et non `127.0.0.1`, refusé par le CORS). L'écran de salle (`:4174`) se
lance avec `docker compose -f backoffice/docker-compose.yml up -d room-app` s'il n'est pas
démarré. Une salle n'apparaît dans l'API publique qu'après l'enregistrement de ses créneaux avec
la réservation publique cochée.

Prochain horodatage de migration libre : `20261124190000`.

**Lots restants** :

| Priorité | Lot                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Banc matériel sur place (`docs/recette/banc-materiel.md`) : buzzers, lumières par le relais, carte de la fumée (F20 à F30)       |
| 1        | Blind test par playlist de bout en bout dès que les liens des playlists sont fournis                                             |
| 2        | Scénario Playwright du test de coupure par la carte ; `schedule_changed` à la suppression ou à la désactivation d'une salle      |
| 2        | Montage de la pile de production sur une machine (`deploy/prod/`), `caddy validate`, SSE derrière Caddy                          |
| 3        | Suivis ci-dessous, regroupés par zone ; règles ESLint lourdes du backend ; `knip`                                                |
| 3        | Reportés par Enzo : e-mails, textes légaux, SonarQube, Lighthouse                                                                |
| 3        | Ménage : copies de travail des PR mergées, copie `live-salle` cassée (à élaguer), copie `show-salle` (modifications non rangées) |

**Choix par défaut pris sans Enzo, à confirmer** : plafond des éclairs (3 par seconde, 400 ms) ;
fumée coupée à la pause ; chaque poste refait le test de coupure une fois (#176) ; strobe du
Diagnostic plafonné à la valeur 30 pendant 3 s, canal brut compris (#179) ; le backoffice ne
modifie plus `lighting` ; fuseaux en noms IANA seulement ; journaux de salle gardés 30 jours et
5 000 lignes, sans accès pour le rôle `user` ; demandes de démonstration gardées 12 mois, 5 par
heure et par adresse, sans envoi d'e-mail ; logo de 512 Ko au plus, sans SVG ; TOTP sans QR code,
tentative comptée avant la comparaison, clé de démonstration refusée en production ; statistiques
sur 30 jours par défaut et 366 au plus, réservées aux administrateurs ; mini-jeux du lot 4 hors
V1 ; playlists : réponses « titre – artiste », pas de genre imposé par l'opérateur, pas de mémoire
des titres entre deux parties, 4 titres lisibles au moins, lecture limitée aux 500 premiers
titres, délai de 12 s ; clés d'API : 10 clés actives par compagnie, journal gardé 90 jours ;
lancement d'une partie : 409 `game_participants_changed` si les pupitres ont changé depuis le
relevé de la salle ; reprise du lien de la carte de fumée : 5 essais, 3 s d'écart, compteur remis
à zéro après 60 s de lien stable ; une carte en défaut n'est jamais reprise seule.

**Suivis relevés en relecture et en recette** (à regrouper par zone dans des PR de suivi) :

- _Sessions et accueil_ : `schedule_changed` non émis à la suppression ou à la désactivation
  d'une salle ; `email_consent_required` passe avant la règle du mode enfants ; QR code jamais
  décodé par un test (#256) ; export des joueurs sans confirmation ; bon marqué comme utilisé sans
  confirmation ; `company_inactive` et `room_inactive` non traduits sur l'écran de salle ; CSS
  dupliqué entre `JoinPage.vue` et `VoucherPage.vue` ; police Exo 2 non chargée sur les pages
  publiques (à héberger nous-mêmes, CSP de Caddy à accorder) ; `/bon` sans barre finale côté
  Caddy.
- _Audio et playlists_ : un seul flux par page de partie (2f) ; coût de la requête des questions
  déjà vues non mesuré (8e) ; `game_answers.question_id` pour les titres tirés d'une playlist ;
  mesure de la mémoire sur le banc.
- _Pilotage et exploitation_ : accusés `refused` et `expired` et réponses 401, 403, 429 des
  commandes à distance non couverts de bout en bout (#259) ; la liste des parties ne montre pas
  l'origine d'une partie (API, agenda) ; « Actualiser le journal » ne rafraîchit pas « Dernier
  appel » du tableau des clés.
- _API de réservation_ : colonne « Session » vide sur un 201 du journal (`api_request_logs` n'a ni
  `game_id` ni indicateur de rejeu) ; code d'erreur inconnu affiché brut dans le journal ;
  `OPENAPI_PATH` à régler au déploiement ; chemins `/maps`, `/shop/items`, `/assets/upload-url` de
  `openapi.yaml` à vérifier (ils ne semblent pas appartenir au produit).
- _Matériel_ : pas de scénario Playwright du test de coupure par la carte ; une salle équipée de
  la carte seule ne peut pas lancer le test de coupure ; « moins d'une seconde » à mesurer sur le
  banc ; `.hex` embarqué dans le paquet principal ; gardes `inProgress()` non testées ; même
  identifiant USB pour une interface DMX à CH340 et un clone de Uno (banc) ; réaction de l'ancien
  programme de la carte aux octets `H` et `0` (banc) ; chargeur pendant une sauvegarde (banc) ;
  stratégie Chrome `SerialAllowUsbDevicesForUrls` ; le formulaire de salle du backoffice peut
  envoyer une configuration `lighting` périmée (403) ; libellé i18n de la scène `pause` ; test
  instable du relais à surveiller.
- _Console et frontend_ : cibles de 48 px (`SwitchField`, `BaseToolBar`, actions de ligne) ; noms
  accessibles des liens du menu et des cases de mini-jeux à vérifier ; attributs ARIA de
  `SelectField.vue` ; défaut de `getApiErrorKey` dans `GamesView` ; arrondi des minutes dupliqué ;
  `fetchCurrentGame` sans appelant ; constats de `knip` ; zone de statut vide de 20 px dans le
  lobby.
- _Backend et outillage_ : règles ESLint lourdes laissées de côté pour le backend (#261 :
  `naming-convention`, `no-restricted-imports`, `consistent-return`, `id-length`,
  `consistent-function-scoping`, `no-param-reassign`) ; borne de la référence de média répétée
  dans la contrainte de base et l'OpenAPI ; `periodBoundSchema` dupliqué entre `routes/games` et
  `routes/stats` ; images de production jamais construites ; attribut `merge=union` valable en
  local seulement (`backoffice/CHANGELOG.md`, `docs/recette/banc-materiel.md`) ; issues #129,
  #132, #203, #204 et #215 à mettre à jour ou à fermer.

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
