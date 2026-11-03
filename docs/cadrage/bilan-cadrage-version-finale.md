# QuizzUp — Bilan et cadrage de la version finale

> Date : 3 novembre 2026 · Rédigé pour Enzo · Statut : **proposition à discuter, rien n'est codé**
>
> Référence de style et d'organisation : le dépôt GitHub `vikorb/QuizzUp` (branche `main`, dernier merge #53).
> Source d'intentions produit : la version locale « LumenQuiz » (`quizzup-claudefable`) et son document `PASSATION-LUMENQUIZ.md`.

---

## 1. Résumé en 10 lignes

1. Le dépôt GitHub est un **backoffice solide** (Fastify + Knex + PostgreSQL, Vue 3 + Vite + i18n) : auth, compagnies, comptes, thèmes, questions, réponses. Process carré : issues US, Conventional Commits, husky, CHANGELOG, **62 fichiers de tests / ~386 cas**.
2. Il n'a **aucun moteur de jeu** : les tables `games/rounds/…` existent seulement dans le DBML, les vues Parties / Joueurs / Stats sont des titres vides, l'OpenAPI décrit des routes non implémentées.
3. La version locale va beaucoup plus loin côté **jeu et salle** : moteur de session pur et déterministe, 10 manches × 4 thèmes proposés, choix du thème par un joueur, app Electron de salle, temps réel Socket.IO, DMX (Art-Net, effets, fumée sécurisée, arrêt d'urgence), dashboards opérateur/gérant/admin.
4. Mais elle est écrite dans une autre stack (NestJS, Prisma, React, pnpm), avec **très peu de tests (15 cas)** et sans i18n. On ne la recopie pas : on **réécrit ses fonctionnalités dans le style GitHub**.
5. Votre nouvelle idée (« plein de jeux tirés au sort, et dans chaque jeu les joueurs choisissent le thème ») demande de **séparer le gameplay (mini-jeu) du contenu (thème)**. Dans la version locale, le gameplay est collé au thème (`ThemeType`), c'est le principal point à revoir.
6. Les **buzzers qui émulent un clavier** ne sont pas gérés dans la version locale (les buzzers ne sont que des boutons cliquables à l'écran). C'est à construire.
7. Recommandation d'architecture : **TypeScript partout**, on garde Fastify/Knex/Vue, et on ajoute un dossier `game/` avec un **moteur pur**, un **agent de salle local** (autorité de la partie, matériel, offline) et un **écran de salle en Vue 3**.
8. Pas besoin de changer de langage. Seule exception éventuelle : un firmware ESP32 (C++) si un jour on veut des buzzers avec retour LED.
9. Proposition de découpage en **8 lots** qui tient dans le budget cloud restant (~162 $), en priorisant ce qui rend une partie jouable de bout en bout.
10. **10 questions à trancher ensemble** avant les gros chantiers (section 9).

---

## 2. État du dépôt GitHub (la référence)

### 2.1 Stack et organisation

| Élément | Détail |
|---|---|
| Monorepo | Racine git + `backoffice/` (`backend/`, `frontend/`, `shared/`, `docs/`, `tests/`). `game/` prévu mais absent. |
| Backend | Fastify 5, TypeScript (CommonJS), Knex 3, PostgreSQL, `@fastify/jwt`, Zod 4, Swagger UI |
| Frontend | Vue 3.5, Vite, vue-router 5, vue-i18n 11 (fr/en), `@mdi/js`. **Pas** de Pinia ni de lib de composants : composants maison (`BaseTable`, `StatBar`, `StatusPill`, `ConfirmModal`, …) |
| Shared | `@quizzup/shared` : **uniquement des constantes** (statuts, rôles, scopes, modes, types de média) |
| Tests | Vitest centralisé dans `backoffice/tests/` (back + front), mocks centralisés dans `_helpers/` |
| Qualité | ESLint (simple-import-sort, unicorn, unused-imports, vue), Prettier, vue-tsc, knip, husky + commitlint + lint-staged |
| Docs | `openapi.yaml`, `db.dbml` (+ PDF/SVG), `architecture.md` (mermaid), `design-system.md` (néon bleu-violet, Exo 2) |
| Process | Issues « US-XXX-NN » avec critères d'acceptation et labels (`priority:must/should/could`, `feature:*`, `role:*`), une branche par sujet, PR, CHANGELOG référencé par US |
| CI | GitLab (clone de `main` sur GitHub) : lint → tests → build → Sonar → Lighthouse → audit → deploy. **Ne valide pas les branches de PR.** |

### 2.2 Ce qui fonctionne

- **Auth** : JWT + sessions en base (`admin_sessions`), expiration par inactivité glissante.
- **RBAC** : matrice rôle × ressource × action (`backend/src/security/permissions.ts`), rôles `superadmin` / `admin` / `user`.
- **Multi-tenant** : isolation par `company_id`, contenu avec scope `global` ou `company`.
- **Compagnies et comptes** : CRUD, activation/désactivation, suppression logique, suppression définitive (superadmin).
- **Thèmes** : CRUD, statut (dont brouillon), mode `classic/image/audio/mixed`, scope.
- **Questions / réponses** : CRUD, relation **n-n question ↔ thèmes** (`question_themes`), jusqu'à 4 réponses, plusieurs bonnes réponses possibles, au moins une bonne réponse obligatoire, `type_media` + `media_url` (sans stockage réel).
- **Design** : refonte néon terminée (PR #53), menu latéral adaptatif.

### 2.3 Ce qui manque ou est en décalage

| Sujet | Constat |
|---|---|
| Moteur de jeu | Inexistant. |
| Tables de jeu | Dessinées dans le DBML mais **non migrées**, et le dessin ne colle plus à la cible : `rounds` porte un `question_id` (une ligne = une question), `games.room` est un `varchar` unique, aucune notion de mini-jeu, de choix de thème ni de pupitre. **À redessiner.** |
| Salles | Aucune entité `rooms` (ni établissements). |
| Joueurs | Table `players` dessinée seulement ; l'issue #34 exige email + username pour chaque joueur. |
| Vues | `GamesView`, `PlayersView`, `StatsView` = un simple titre. |
| OpenAPI | Documente `/players`, `/games`, `/maps`, `/shop/items`, `/assets/upload-url`, `/stats/overview` qui **n'existent pas** dans le code. À nettoyer ou marquer « prévu ». |
| Temps réel | Rien (pas de WebSocket). |
| Matériel | Rien. |
| Issues ouvertes | 23, dont le bloc **US-GAME-01 à 06** (#33 à #36, #37, #45), stats (#38, #39, #40, #41, #8, #12, #18, #25), joueurs (#11, #13), accueil (#5, #6, #7), filtres/pagination (#42, #43), états UX (#44), déconnexion auto (#3). |
| Permissions contenu | Le rôle `user` (staff du client) a aujourd'hui le droit de **créer** thèmes/questions/réponses. La version locale réserve la création de contenu à l'éditeur. À trancher. |

---

## 3. Ce qu'apporte la version locale (LumenQuiz)

À prendre comme **catalogue de fonctionnalités et d'intentions**, pas comme modèle de code.

### 3.1 Intentions produit

- **4 espaces séparés** : Salle (le PC de la salle, plein écran, « spectacle »), Opérateur (lance les parties, pilote plusieurs salles), Gérant (statistiques de son centre, paiement « à venir »), Admin plateforme (éditeur de contenu + business).
- **Participant = un nom sur un pupitre**, pas un compte (joueur seul ou équipe, même traitement).
- **Rendu jeu télé** : écran central, sol en perspective, rampe de lumières, **4 pupitres en ligne** × **4 buzzers A/B/C/D** = 16 buzzers.
- **Wording neutre** côté gérant (« activité par salle », pas de classement des salles).

### 3.2 Modèle de jeu v2

- Session = **10 manches** ; par manche : **4 thèmes tirés au sort**, **1 joueur désigné** pour choisir (manche 1 au hasard, ensuite au hasard **en excluant le leader**, repli si égalité), puis **10 questions tirées** dans le thème choisi.
- Trois gameplays, **portés par le thème** : `SPEED` (points décroissants), `FIRST_BUZZ` (premier qui buzze, pénalité, la main repasse), `TIMED_CORRECT_ANSWER` (tout le monde répond dans le temps).
- Points, pénalité et temps **par question** ; thème actif ≥ 10 questions.
- Questions **snapshotées** dans la manche (l'historique ne bouge pas si le thème est modifié).
- **Moteur pur** (pas d'horloge, pas d'I/O, piloté par des `TICK`) → testable et rejouable. Le hasard est injectable mais **la graine n'est pas enregistrée**, donc une partie n'est pas réellement rejouable depuis l'historique.

### 3.3 Salle, temps réel, matériel

- Le moteur tourne **dans l'app de salle** (process main Electron), qui reçoit au lancement un paquet autonome (thèmes + participants) → **la partie continue sans réseau**, les événements sont bufferisés puis resynchronisés (ingestion idempotente côté serveur).
- Socket.IO (namespace `/rt`, JWT), heartbeat 15 s, salle hors ligne après 45 s, **accusé de réception** du lancement.
- DMX : drivers simulation et **Art-Net** (UDP), effets (fade, flash, pulse, chase, rainbow, strobe borné, blackout), lecteur de scènes, mapping **événement de jeu → scène**.
- **Fumée** : durée max, cooldown, niveau max, confirmation. **Arrêt d'urgence logiciel** + réarmement humain.
- Configuration de salle **sur grille** (zones TOP / LEFT / RIGHT / FLOOR / BACK, une case = un équipement), faisceaux simulés à l'écran.
- Pièges déjà rencontrés et documentés (agent de salle fantôme ouvert deux fois, course heartbeat/présence, équipements empilés) : précieux, à anticiper.

### 3.4 Gestion

- Dashboards opérateur (mes stats jour/mois, sessions récentes), gérant (activité salles/opérateurs), admin (revenus estimés, clients, fiche client, supervision technique).
- **Pricing MVP** : 149 €/salle active/mois, 200 joueurs inclus, +19 € par tranche de 50 joueurs.
- Détail de session complet (manches, points, timeline), exports PDF/CSV préparés mais désactivés.

### 3.5 Limites de la version locale

- **Buzzers physiques non branchés** : aucune lecture clavier, uniquement des clics à l'écran.
- Pas de projecteurs motorisés (pan/tilt) ni de « spot sur le pupitre qui a buzzé ».
- Gameplay soudé au thème → impossible de faire « plusieurs jeux, le joueur choisit le thème ».
- Réponses stockées en JSON dans la session → pas d'analytics par question.
- Tests faibles, pas d'i18n, double modèle legacy (`Quiz`) + v2 (`Theme`).

---

## 4. Tableau de confrontation

Légende : ✅ présent sur GitHub · 🟡 présent mais différent · ❌ absent sur GitHub. La colonne « Reco » est une proposition, **pas une décision**.

| # | Fonctionnalité (version locale) | GitHub | Reco |
|---|---|---|---|
| 1 | Rôle Admin plateforme | ✅ `superadmin` | Garder le nom GitHub. |
| 2 | Rôle Gérant | ✅ `admin` (client licencié) | Garder ; ajouter l'espace « stats » gérant. |
| 3 | Rôle Opérateur | 🟡 `user` (staff, peut créer du contenu) | Garder `user` = opérateur ; **décider** s'il peut créer du contenu. |
| 4 | Rôle Salle (compte appareil) | ❌ | Ajouter, mais **comme appareil** (table `rooms` + jeton d'appairage), pas comme un compte admin. |
| 5 | Établissements (`Venue`) | ❌ | Reporter : une compagnie = des salles suffit pour la V1. |
| 6 | Salles (`Room`) + config matérielle | ❌ | Ajouter (lot L1). |
| 7 | Thèmes globaux créés par l'éditeur | 🟡 scope `global` **et** `company` | Garder les deux scopes (un client peut ajouter ses thèmes maison). |
| 8 | Gameplay porté par le thème (`ThemeType`) | ❌ (le `mode` GitHub = type de média) | **Ne pas reprendre tel quel** : le gameplay devient un **mini-jeu** séparé (section 5). |
| 9 | Points / pénalité / temps par question | ❌ | Règles par défaut dans le mini-jeu, surcharge optionnelle par question. |
| 10 | Thème actif ≥ 10 questions | ❌ | Ajouter (validation à l'activation), seuil en constante partagée. |
| 11 | Explication de la réponse, difficulté | ❌ | Ajouter `explanation` et `difficulty` sur `questions`. |
| 12 | Question liée à plusieurs thèmes | ✅ (n-n) — **mieux que la version locale** | Garder. |
| 13 | Plusieurs bonnes réponses | ✅ | Garder ; préciser la règle de scoring par mini-jeu. |
| 14 | Session 10 manches, 4 thèmes proposés, choix par un joueur, exclusion du leader | ❌ | Ajouter, nombre de manches paramétrable (format court/standard). |
| 15 | Snapshot des questions dans la manche | ❌ | Ajouter (jsonb) **+** réponses normalisées en table pour les stats. |
| 16 | Moteur pur déterministe | ❌ | Ajouter dans `game/engine`, avec **graine enregistrée** pour rejouer une partie. |
| 17 | Lancement par l'opérateur (participants seulement) | ❌ (issue #34 plus lourde) | Fusionner : nom obligatoire, email optionnel. |
| 18 | App de salle offline + resync idempotente | ❌ | Ajouter (agent de salle). |
| 19 | Temps réel (présence, heartbeat, ack) | ❌ | Ajouter (Socket.IO sur Fastify). |
| 20 | Écran de jeu TV (pupitres en ligne, buzzers A-D) | ❌ | Ajouter en Vue 3 avec le design system néon existant. |
| 21 | Buzzers physiques | ❌ (et ❌ en local) | **À construire** (section 6.1). |
| 22 | DMX lumière + fumée + sécurités | ❌ | Ajouter (section 6.2), simulation obligatoire. |
| 23 | Config de salle sur grille | ❌ | Ajouter (écran de config de salle). |
| 24 | Dashboards opérateur / gérant / admin | ❌ (vues vides, issues #38, #39…) | Ajouter dans le backoffice Vue, en suivant les issues existantes. |
| 25 | Historique / détail de session | ❌ (issues #33, #37) | Ajouter. |
| 26 | Pricing MVP et projection de revenus | ❌ | Lot tardif, à confirmer. |
| 27 | Paiement | ❌ (placeholder en local) | Hors V1 sauf décision contraire. |
| 28 | i18n fr/en | ✅ — **mieux que la version locale** | Garder, étendre à l'écran de salle. |
| 29 | Tests | ✅ ~386 cas — **mieux que la version locale** | Garder le niveau d'exigence, viser une couverture forte du moteur. |
| 30 | Design scroll « par pages » (Apple/Tesla) | ❌ | Finition, plus tard. |

---

## 5. Cadrage : jeux multiples tirés au sort, thèmes choisis par les joueurs

### 5.1 Le principe

On sépare trois notions :

- **Mini-jeu** (le *comment on joue*) : règles, scoring, usage des buzzers, ambiance lumière. Catalogue en code, activable par compagnie.
- **Thème** (le *sur quoi*) : contenu, déjà en place sur GitHub.
- **Question** : avec un **type** (QCM, vrai/faux, estimation, média) qui conditionne les mini-jeux compatibles.

Déroulé d'une manche :

```
Tirage du mini-jeu ──► Présentation (lumière + écran)
   │
   ▼
Tirage de 4 thèmes compatibles avec ce mini-jeu
   │
   ▼
Désignation du joueur qui choisit (hasard, leader exclu)
   │
   ▼
Le joueur choisit avec SES buzzers A/B/C/D (= 4 thèmes)  ◄── les 4 buzzers servent naturellement au choix
   │
   ▼
Tirage des questions du thème ──► Questions ──► Révélation ──► Bilan de manche
```

Règles de tirage proposées :

- Pas deux fois le même mini-jeu d'affilée, pondération configurable (un « gros » mini-jeu plus rare).
- Un thème déjà joué dans la session n'est plus proposé.
- La **dernière manche peut être imposée** (finale « tout ou rien »).
- Repli si pas assez de thèmes compatibles : on élargit (thèmes déjà joués, puis mini-jeu suivant).
- Tout est tiré avec une **graine enregistrée** : on peut rejouer, tester et expliquer n'importe quelle partie.

### 5.2 Catalogue de mini-jeux proposé

Tous originaux, pensés pour 4 pupitres × 4 buzzers. Les trois premiers existent déjà dans la version locale.

| Mini-jeu | Principe | Buzzers | Questions | Priorité |
|---|---|---|---|---|
| **Rapidité** | Tout le monde répond, points décroissants avec le temps | A-D = réponses | QCM | V1 |
| **Premier buzz** | Le premier qui buzze répond seul ; faux = pénalité, la main passe | n'importe lequel pour buzzer, puis A-D | QCM | V1 |
| **Chrono** | Bonne réponse dans le temps imparti, points fixes | A-D | QCM | V1 |
| **Vrai ou faux éclair** | Rafale de questions courtes | A = vrai, B = faux | Vrai/faux | V1 |
| **Quitte ou double** | Avant la question, chacun mise (A = 0, B = ×1, C = ×2, D = tapis) | A-D deux fois | QCM | V2 |
| **Mort subite** | Une erreur = éliminé de la manche, le dernier debout rafle le bonus | A-D | QCM | V2 |
| **Vol de points** | Le premier juste choisit un adversaire (son pupitre = son buzzer) et lui vole des points | A-D puis choix de cible | QCM | V2 |
| **Série** | Multiplicateur qui grimpe à chaque bonne réponse consécutive, retombe à l'erreur | A-D | QCM | V2 |
| **Estimation** | Question chiffrée, 4 fourchettes proposées | A-D = fourchettes | Estimation | V2 |
| **Révélation progressive** | Image floue qui se dévoile, plus on répond tôt plus on gagne | buzz puis A-D | Image | V3 (stockage média requis) |
| **Blind test** | Extrait audio | buzz puis A-D | Audio | V3 (stockage média requis) |
| **Duel** | Deux joueurs tirés au sort s'affrontent, les autres parient sur le vainqueur | A-D | QCM | V3 |

Chaque mini-jeu se déclare de la même façon :

- **Prérequis** : types de question acceptés, média requis, nombre minimum de joueurs.
- **Règles** : temps, points, pénalités, nombre de questions par manche.
- **Machine à états** : phases et transitions, pures et testées.
- **Signaux d'ambiance** : quels événements déclenchent quelles scènes (lumière, fumée, spot sur un pupitre).
- **Écrans** : composant Vue d'affichage pour la salle.

Ajouter un mini-jeu = ajouter un module + ses tests, sans toucher au cœur du moteur.

### 5.3 Données (à faire valider, puis migrations Knex + DBML + OpenAPI)

Tables nouvelles ou revues, aux conventions du dépôt (`company_id`, statuts 0/1/2, `created_at`/`updated_at`/`deleted_at`) :

| Table | Rôle |
|---|---|
| `rooms` | Salle d'une compagnie : nom, statut, config matérielle (jsonb : buzzers, équipements DMX, grille), jeton d'appairage de l'agent. |
| `game_modes` | Catalogue des mini-jeux connus (code, nom i18n, version). |
| `company_game_modes` | Activation / pondération des mini-jeux par compagnie. |
| `games` | La partie (= session) : salle, opérateur, format, **graine**, statut (préparée, en cours, terminée, annulée), horodatages. Remplace le `games` actuel du DBML. |
| `game_participants` | Nom affiché, pupitre (1-4), score final, joueur lié optionnel. |
| `game_rounds` | Ordre, mini-jeu, thèmes proposés, thème choisi, qui a choisi et pourquoi, snapshot des questions (jsonb). |
| `game_answers` | Une ligne par réponse (participant, question, choix, juste/faux, temps de réponse, points) : **alimente les stats par question**. |
| `game_events` | Journal horodaté avec numéro de séquence (idempotence de la resynchro). |
| `questions` (évolution) | `kind` (qcm, true_false, estimate…), `difficulty`, `explanation`, surcharges optionnelles de points/temps. |

### 5.4 Lien avec les issues GitHub existantes

Les US-GAME-01 à 06 restent la colonne vertébrale côté backoffice. Il faudra **réécrire #34** (création de partie) : aujourd'hui elle demande nombre de manches, mode de jeu et thème choisis à la création, alors que la cible tire mini-jeux et thèmes **pendant** la partie. Je propose de créer les nouvelles US (moteur, mini-jeux, salle, matériel) au même format que les existantes.

---

## 6. Cadrage : communication site ↔ matériel en salle

### 6.1 Buzzers qui émulent un clavier

Ce sont des encodeurs USB (type encodeur arcade) vus par l'ordinateur comme un clavier : chaque buzzer envoie une touche. Atouts : aucun pilote, branché-ça-marche. Points de vigilance et réponses proposées :

| Risque | Parade |
|---|---|
| Disposition AZERTY / QWERTY | Lire la **touche physique** (`event.code`), jamais le caractère (`event.key`). |
| Auto-répétition quand on reste appuyé | Ignorer les événements répétés, un appui = un buzz jusqu'au relâchement. |
| Raccourcis système (Windows, F11, Ctrl…) | N'utiliser que lettres/chiffres, bloquer les combinaisons, mode kiosque. |
| La fenêtre perd le focus → les buzzers ne marchent plus | App plein écran qui garde le focus (Electron) + alerte visible « buzzers inactifs ». |
| Appuis simultanés perdus (ghosting) | Vérifier que l'encodeur gère plusieurs touches à la fois ; prévoir 2 encodeurs (2 pupitres chacun) si besoin. |
| Équité de « qui a buzzé en premier » | Horodater **au moment de la capture** sur la machine de salle (précision de l'ordre de la milliseconde, liée à la fréquence USB). Comme tout est sur la même machine, les temps sont comparables. |
| Câblage inconnu | **Mode apprentissage** dans la config de salle : « appuyez sur le buzzer A du pupitre 1 », etc. Le mapping touche → (pupitre, bouton) est stocké dans la config de la salle. Écran de test qui allume chaque buzzer à l'écran. |

Architecture : une abstraction « source d'entrée » unique. V1 = clavier. Plus tard, on peut brancher sans rien changer au moteur une source **série/ESP32** (buzzers avec LED pilotées) ou **tablettes** (joueurs à distance, démo commerciale).

### 6.2 Lumières, spots et machine à fumée

Un navigateur ne peut pas parler DMX (pas d'UDP). Il faut donc un **agent local** sur le PC de la salle.

- **Sortie** : un **nœud Art-Net Ethernet** (déjà supporté par la version locale, matériel courant et peu cher) ; en option une interface **USB DMX** (port série). sACN plus tard si besoin.
- **Spots** : deux familles à distinguer, à confirmer selon votre matériel :
  - **PAR LED fixes** (RGB/RGBW) : couleur et intensité → ambiance et couleur par pupitre.
  - **Lyres / projecteurs motorisés** (pan/tilt) : on enregistre une **position par pupitre** pendant la config, puis le jeu peut dire « spot sur le pupitre 3 » (celui qui a buzzé, celui qui choisit le thème, le gagnant).
  - Profils d'appareils en bibliothèque (mapping des canaux) ; import depuis l'Open Fixture Library plus tard.
- **Machine à fumée** : soit pilotée en DMX (canal fumée), soit via un **relais DMX** pour une machine non-DMX. Sécurités reprises de la version locale (durée max, cooldown, niveau max, confirmation), plus deux ajouts :
  - **Chien de garde** : beaucoup d'appareils DMX **gardent la dernière valeur reçue**. Si l'agent plante en pleine fumée, la fumée continue. L'agent doit envoyer en permanence des trames, et le nœud doit être configuré pour couper en cas de perte de signal ; à défaut, un relais avec temporisation matérielle.
  - **Arrêt d'urgence physique** coupant l'alimentation fumée/lumières : le bouton logiciel ne suffit pas seul (sécurité des personnes, ERP).
- **Ambiance** : un mapping « événement de jeu → scène » par défaut (repris de la version locale), surchargeable par mini-jeu et par salle. Le mode **simulation** reste obligatoire pour développer et tester sans matériel.

### 6.3 Protocole

Un seul protocole versionné et validé (schémas partagés) entre trois acteurs :

```
 Cloud (backend Fastify)  ◄──── WebSocket sécurisé ────►  Agent de salle (PC de la salle)
   contenu, lancement,            lancement + ack,          moteur de jeu (autorité),
   historique, stats,             événements par lots,      buzzers, DMX, fumée,
   présence des salles            présence, heartbeat       offline + resynchro
                                                                 │
                                                     WebSocket local (même machine / LAN)
                                                                 │
                                          Écran de salle (Vue 3)   Tablette opérateur (optionnel)
```

---

## 7. Recommandations de langages et d'architecture

### 7.1 Ce que je recommande de garder

- **TypeScript partout**, **Fastify + Knex + PostgreSQL**, **Vue 3 + Vite + vue-i18n**, Vitest, les conventions du dépôt. C'est la référence, c'est cohérent, et il n'y a pas de gain à passer à NestJS/Prisma/React.
- Le dossier **`game/`** à côté de `backoffice/`, comme prévu par le `CLAUDE.md`.

### 7.2 Où tourne le moteur (le choix le plus structurant)

| Option | Pour | Contre |
|---|---|---|
| A. Moteur dans le cloud | Une seule autorité, simple à superviser | Une coupure Internet arrête la partie ; latence des buzzers ; le matériel est de toute façon local |
| **B. Moteur dans l'agent de salle (reco)** | Partie jouable sans Internet, buzzers et DMX sur la même machine, latence nulle | Un logiciel à installer et mettre à jour dans chaque salle |

Je recommande **B**, qui respecte l'esprit du `CLAUDE.md` (« serveur autoritatif + WebSocket, découplé du matériel ») : l'agent de salle **est** le serveur autoritatif de la salle, le cloud reste maître du contenu, des comptes et de l'historique.

### 7.3 Organisation proposée

```
game/
├─ engine/      moteur pur TS (aucune I/O) : session, tirages avec graine, mini-jeux en modules
├─ agent/       agent de salle Node/TS : exécute le moteur, lit les buzzers, pilote le DMX,
│               parle au cloud, file d'attente offline
├─ room-app/    écran de salle en Vue 3 (même design system néon que le backoffice)
└─ desktop/     coquille Electron qui embarque agent + room-app (plein écran, focus, auto-update)
```

- **Electron** plutôt qu'un navigateur en mode kiosque : on maîtrise le focus clavier (vital pour les buzzers), l'UDP Art-Net, le port série et les mises à jour, avec un seul installateur. Tauri serait plus léger mais ajouterait du Rust : pas rentable ici.
- **Temps réel** : Socket.IO branché sur Fastify (reconnexion, accusés de réception et salons inclus, déjà éprouvé par la version locale).
- **Contrats partagés** : étendre `@quizzup/shared` avec les types et schémas du protocole et du moteur (aujourd'hui il ne contient que des constantes), pour que backend, agent et écrans ne dérivent pas.

### 7.4 Améliorations d'outillage suggérées

- **npm workspaces** à la racine : aujourd'hui il faut 5 `npm install` successifs. Optionnel, à discuter.
- **GitHub Actions sur les PR** (lint + type-check + tests) : comble le trou noté dans le `CLAUDE.md` (la CI GitLab ne valide que `main`). Depuis le cloud je n'ai pas accès à GitLab (`glab`), donc un garde-fou GitHub me permettrait aussi de prouver que mes PR sont vertes.
- **Stockage média** (S3 compatible ou disque local + URL signées) : prérequis des mini-jeux image et audio.

---

## 8. Proposition de lots et budget

Estimations indicatives de coût cloud (elles dépendent beaucoup du nombre d'allers-retours). Chaque lot = issues US + branche + PR + tests + docs (DBML, OpenAPI, CHANGELOG, i18n).

| Lot | Contenu | Résultat visible | Coût estimé |
|---|---|---|---|
| **L0** Socle | GitHub Actions sur PR, nettoyage OpenAPI, US rédigées | PR vérifiées automatiquement | ~5 $ |
| **L1** Données | Migrations `rooms`, `games`, `game_*`, évolution `questions`, DBML, OpenAPI | Schéma cible en base | ~15 $ |
| **L2** Moteur | `game/engine` : session, tirages avec graine, choix de thème, 4 mini-jeux V1, tests intensifs | Partie simulable en tests | ~25 $ |
| **L3** Backoffice jeu | Salles, lancement de partie, liste et détail des parties (#33 à #37) | L'opérateur lance une partie | ~25 $ |
| **L4** Salle | Agent de salle, écran de salle Vue, buzzers clavier (apprentissage + test), offline | Partie jouable de bout en bout | ~30 $ |
| **L5** Matériel | DMX simulation + Art-Net, scènes, fumée sécurisée + chien de garde, spots par pupitre | La salle s'allume et fume | ~25 $ |
| **L6** Mini-jeux V2 | Quitte ou double, mort subite, vol de points, série, estimation | Variété de jeu | ~20 $ |
| **L7** Stats | Dashboards client et admin (#38, #39, #8, #25) | Pilotage de l'activité | ~15 $ |
| | | **Total** | **~160 $** |

Ordre conseillé : L0 → L1 → L2 → L3 → L4 → L5, puis L6/L7 selon le budget restant. Mini-jeux média, paiement, pricing et design « scroll par pages » viennent après.

---

## 9. Questions à trancher ensemble

1. **Moteur dans la salle (reco) ou dans le cloud ?**
2. **Electron (reco) ou navigateur en mode kiosque** pour l'écran de salle ?
3. **Le staff (`user`) peut-il créer du contenu**, ou seulement l'éditeur et le client (`admin`) ?
4. **On garde les thèmes « maison » des clients** (scope `company`) ? Reco : oui.
5. **Joueurs** : simple nom sur un pupitre (reco), ou email + username obligatoires comme dans l'issue #34 ? (L'email impose RGPD et consentement.)
6. **Format de partie** : 10 manches × 10 questions (≈ 100 questions, c'est long), ou formats courts au choix de l'opérateur (ex. 5, 8, 10 manches) ?
7. **Matériel exact** : modèle des encodeurs de buzzers, machine à fumée (DMX ou non), spots (PAR fixes ou lyres motorisées), interface DMX déjà achetée ? Des références ou photos m'aideraient énormément.
8. **Mini-jeux** : le catalogue de la section 5.2 vous parle ? Lesquels en V1 ?
9. **Pricing / paiement** dans le périmètre de la version finale, ou plus tard ?
10. **Nom** : on garde « QuizzUp » partout (reco), « LumenQuiz » n'étant que le nom de la version locale ?

Dès que ces points sont tranchés, je rédige les US au format du dépôt et je démarre par L0 + L1.

---

## 10. Décisions d'Enzo (3 novembre 2026)

| # | Sujet | Décision |
|---|---|---|
| 1 | Où tourne le moteur | Explications données, **confirmation attendue** (reco : dans la salle). |
| 2 | Electron | Explications données, **confirmation attendue**. |
| 3 | Création de contenu | **Seulement l'éditeur (`superadmin`) et le client (`admin`)**. Le staff (`user`) perd le droit de créer. |
| 4 | Thèmes maison des clients | **Oui**, on garde le scope `company`. |
| 5 | Joueurs | **Email collecté, avec conformité RGPD** (consentement explicite, finalité, durée de conservation, droit à l'effacement). |
| 6 | Format | **10 manches × 10 questions**. |
| 7 | Matériel | Références à venir. **Principe : chaque client a son propre matériel → tout doit être universel** (mapping des buzzers par apprentissage, profils d'appareils DMX configurables, plusieurs sorties DMX possibles, simulation sans matériel). |
| 8 | Mini-jeux | Catalogue présenté, choix de la V1 en attente. |
| 9 | Pricing / paiement | **Plus tard.** |
| 10 | Nom | **QuizzUP**. |

**Mise à jour du 3 novembre (soir)** : comptes de salle **conservés** (rôle dédié « salle », connecté sur le PC de la salle). Première version = **un seul mini-jeu, le blind test éclair**, pour poser toute la chaîne audio dès le départ. Electron remis en question → étude « sans installation » ci-dessous.

---

## 11. Étude : une salle « sans rien installer »

Idée : le PC de la salle ouvre simplement le site QuizzUP dans **Chrome ou Edge**, se connecte avec le **compte de salle**, et tout fonctionne. Le moteur de jeu tourne alors **dans la page web** elle-même.

### 11.1 Ce qui marche dans un navigateur

| Besoin | Faisable sans installation ? | Comment |
|---|---|---|
| Buzzers clavier | ✅ | Lecture des touches physiques dans la page, plein écran. L'API *Keyboard Lock* de Chrome/Edge capte même Échap et les raccourcis en plein écran. |
| Plein écran, kiosque | ✅ | Bouton « Lancer la salle » qui passe en plein écran. Option : raccourci Chrome en mode `--kiosk` (pas une installation, juste une icône). |
| Son (blind test) | ✅ | Web Audio : lecture précise à la milliseconde d'un extrait coupé à 1 s, 5 s, 20 s. Le navigateur exige un premier clic avant de jouer du son → le bouton « Lancer la salle » sert aussi à ça. |
| Partie sans Internet | ✅ | Site en **PWA** : l'application et tout le contenu de la partie (questions + fichiers audio) sont mis en cache au lancement ; la partie continue si la connexion coupe, puis le résultat est renvoyé au serveur au retour du réseau. |
| Lumières / fumée en **USB DMX** | ✅ (Chrome/Edge uniquement) | **Web Serial** : la page parle directement aux interfaces USB-DMX compatibles « DMX USB Pro » (Enttec et nombreux clones) ou à un petit boîtier Arduino/ESP32. Le navigateur demande une seule fois l'autorisation d'accéder à l'interface, puis s'en souvient. |
| Lumières en **Art-Net** (réseau) | ❌ | Un navigateur ne peut pas envoyer d'UDP. Il faudrait soit une interface USB à la place, soit un petit « pont » optionnel (seul cas où quelque chose serait à installer). |
| Firefox / Safari | ⚠️ | Jeu et buzzers OK, mais **pas de Web Serial** → pas de lumières. On exige Chrome ou Edge sur le PC de salle. |

### 11.2 Risques et parades

- **La page perd le focus** (notification Windows, clic ailleurs) → les buzzers ne répondent plus. Parade : alerte plein écran « Cliquez pour réactiver les buzzers », et mode kiosque recommandé.
- **Onglet fermé ou PC qui se met en veille** pendant la partie → l'état de la partie est sauvegardé en continu dans le navigateur (IndexedDB) et reprend à la réouverture. On demande aussi au navigateur de garder l'écran allumé (*Wake Lock*).
- **Sécurité fumée** : si l'onglet plante, il n'envoie plus de trames DMX et certaines interfaces gardent la dernière valeur. Parade : privilégier une interface ou un boîtier qui coupe la fumée en l'absence de signal, et l'**arrêt d'urgence physique** reste obligatoire.
- **Mises à jour** : rien à faire, le site est à jour à chaque ouverture (avantage net sur Electron).

### 11.3 Recommandation

**Partir sur le 100 % navigateur (PWA, Chrome/Edge) avec le compte de salle.** Electron n'apporte vraiment que l'Art-Net et un focus clavier garanti ; ça ne vaut pas l'installation. On garde une porte ouverte : un « pont » local optionnel, plus tard, pour les clients équipés uniquement en Art-Net.

Conséquence sur l'architecture (remplace la section 7.3) :

```
game/
├─ engine/     moteur pur TS (aucune I/O), testé, rejouable avec une graine
└─ room-app/   écran de salle Vue 3 en PWA : exécute le moteur, lit les buzzers,
               joue l'audio, pilote le DMX par Web Serial, cache offline
backoffice/    + rôle « salle », salles, lancement, historique, upload audio
```

---

## 12. Mini-jeu V1 : blind test éclair

### 12.1 Règle proposée (à valider)

1. Les 4 propositions de réponse s'affichent (A, B, C, D).
2. **Palier 1** : l'extrait joue **1 seconde**. Les joueurs peuvent buzzer.
3. Personne ne trouve → **palier 2** : l'extrait rejoue depuis le début pendant **5 secondes**.
4. Personne ne trouve → **palier 3** : **20 secondes**.
5. Toujours personne → **perdu pour tout le monde**, on révèle la réponse.

Points dégressifs, par exemple **100 / 50 / 20** selon le palier.

Points à trancher :

- **Qui répond ?** Option A (proposée) : le **premier qui buzze** répond seul avec A-D ; faux = pénalité et bloqué jusqu'à la fin de la question, les autres peuvent encore buzzer. Option B : tout le monde répond en même temps à chaque palier, tous les justes marquent.
- **Pénalité** en cas de mauvaise réponse : oui / non, combien ?
- **Réponse à 4 choix ou libre ?** Avec les buzzers A-D, 4 choix est le plus naturel.

### 12.2 Ce que ça construit d'entrée (la « stack audio »)

- **Backoffice** : upload d'un fichier audio sur une question (type média `audio` déjà prévu), définition du point de départ de l'extrait, lecteur de pré-écoute.
- **Stockage** des fichiers (stratégie à poser : disque serveur ou stockage objet compatible S3), formats acceptés (mp3/ogg), taille max.
- **Salle** : préchargement de tous les extraits avant la partie (pas de blanc pendant le jeu, et marche hors ligne), lecture coupée précisément au palier.

**Décisions d'Enzo** : le premier qui buzze répond seul (faux = bloqué pour cette question, les autres peuvent encore buzzer) ; **pas de pénalité** ; points **100 / 50 / 20** selon le palier.

### 12.3 Droits musicaux (SACEM, YouTube, Spotify)

*Synthèse de recherche, pas un avis juridique.*

- **SACEM + SPRE** : dues par **le lieu qui diffuse** (chaque centre client), quelle que soit la source du son. Pas de barème spécifique « escape game » trouvé ; ordres de grandeur 2026 des minimums annuels HT : commerce ~165 €, café-restaurant ~461 € (SPRE comprise), bar dansant / karaoké ~749 € + SPRE. Une activité où la musique est au cœur du jeu sera probablement classée haut ; chiffrage exact via le simulateur sacem.fr ou un contact SACEM. -20 % en déclarant avant de diffuser.
- **Spotify / YouTube ne contournent rien** : leurs conditions limitent l'usage au **personnel et non commercial** ; les conditions développeur Spotify interdisent aussi de constituer des bases de contenus. Et même avec une source autorisée, la SACEM reste due pour la diffusion publique.
- **La plateforme** : héberger et distribuer des extraits de tubes demande en plus des droits de reproduction (auteurs et producteurs). C'est le vrai sujet pour des thèmes « éditeur ».
- **Pistes réalistes** :
  1. La technique audio est construite telle quelle, indépendante de la source.
  2. Thèmes éditeur sur du **contenu sans tubes** : bruitages, instruments, sons du quotidien, musiques libres de droits sous licence commerciale.
  3. Les **centres uploadent leurs propres extraits** dans leurs thèmes maison, sous leur responsabilité (clause dans les CGU), puisqu'ils déclarent déjà leur diffusion.
  4. Avant de vendre des blind tests « tubes » éditeur : **avis d'un juriste / contact SACEM-SDRM** pour une licence plateforme.
