# Reprise du projet QuizzUP

> Point d'étape du 2026-11-04 : on arrête le mode « projet multi-threads » et on reprend dans une
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

1. ~~**Mini-jeux dans une partie lancée du backoffice**~~ : fait (PR #91).
2. ~~**Fin de partie** : réessai de l'envoi des scores après une panne réseau~~ : fait (branche
   `fix/room-finish-retry`). File persistante `quizzup_room_pending_finishes`
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
5. ~~**Purge RGPD** des emails joueurs 3 ans après leur dernière partie~~ : fait (branche
   `feat/rgpd-purge-emails`). Purge planifiée dans le backend (30 s après le démarrage puis
   toutes les 24 h, `PLAYER_EMAIL_PURGE_INTERVAL_HOURS=0` pour la couper) et
   `npm run purge:emails` dans `backend/`. Purge **par compagnie** (le consentement est donné au
   centre) : un joueur = son email (joueur 1 ou 2e joueur) dans une compagnie ; dernière partie
   dans cette compagnie = `COALESCE(finished_at, started_at, created_at)`, parties supprimées
   comprises ; au-delà de 3 ans, email et consentement effacés dans les parties de cette
   compagnie seulement, noms et scores gardés. Tout se fait en SQL (verrou consultatif) ; test
   d'intégration PostgreSQL dans la CI (job migrations).
6. ~~**6 pupitres**~~ : fait (branche `feat/six-podiums`). `GAME_PODIUMS` = 6 (`@quizzup/shared`) ;
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
n'importe quelle sauvegarde~~ (fait : `fix/launch-resume-save`, reprise limitée au contexte courant) ; typage
de l'ancien contenu : **décision d'Enzo à prendre**. La migration `20261104020000_add_kind_to_questions`
a rempli toutes les anciennes questions avec `kind = 'qcm'` (défaut `NOT NULL`), donc rien n'est à
`NULL` et une ancienne question est indiscernable d'un QCM choisi exprès. Le moteur déduit déjà le
vrai/faux et l'estimation (`game/engine/src/miniGames/questionRules.ts`). Seule option si on veut le
faire : retyper les `qcm` qui suivent la règle du moteur (attention, `true_false` et `estimate`
verrouillent ensuite les réponses dans le backoffice).

## 5. Process de travail

- Une branche par lot (`feat/…`, `fix/…`), Conventional Commits (husky + commitlint).
- Avant PR : `lint`, `type-check`, tests verts dans chaque paquet touché (voir `CLAUDE.md` §5).
- Consigne d'Enzo : relecture par **un** sous-agent indépendant (sans lui donner ses conclusions),
  corriger, puis merger soi-même (merge commit) une fois la CI GitHub verte. Lister les points
  mineurs en « Suivis » dans la PR.
- Mettre à jour OpenAPI, DBML, CHANGELOG (lignes `US:`), i18n fr/en selon le changement.
- Rester économe en tokens : peu de sous-agents, pas de relecture en double.
- **Organisation des agents (impératif, voir `CLAUDE.md` §4.1)** : la session principale
  (Opus 5.5) coordonne et ne code pas ; développement = Sonnet 5.5 effort élevé ; recherche ou
  lecture d'information = Haiku 5.5 (`me-lecteur`) ; réflexion, conception et relecture de PR =
  Opus 5.5. Modèle toujours explicite ; sous-agents surveillés, jamais bloqués ni en boucle.

## 6. Pièges connus

- `npm --prefix shared install` (CLAUDE.md §5) peut ajouter une dépendance parasite
  `"quizzup-backoffice": "file:.."` dans les `package.json` : préférer `cd backoffice/shared && npm install`
  (idem pour backend et frontend), et vérifier `git diff` des `package.json`.
- Sur TERMIVAVOR2, `gh` n'est pas connecté : lancer `gh auth login` (compte `vikorb`) avant d'ouvrir des PR.
- Une autre copie de travail peut exister dans `C:\Users\enzod\Documents\QuizzUp` ; travailler dans un
  worktree séparé pour ne pas se marcher dessus.
- vue-i18n : un `@` dans un texte doit s'écrire `{'@'}` (sinon la page plante). Un test compile toutes les locales.
- Les colonnes bigint reviennent de pg en chaînes : les convertir en nombres.
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
par priorité et les pièges connus. Reprends d'abord la branche WIP
feat/backoffice-mini-games, puis enchaîne les lots dans l'ordre de docs/REPRISE.md §4.
Pour chaque lot : branche dédiée, lint + type-check + tests verts, PR, relecture par un seul
sous-agent indépendant, corrections, merge toi-même quand la CI GitHub est verte. Mets à jour
docs/REPRISE.md à la fin de chaque lot. Sois économe en tokens et ne me dérange que pour une
décision qui change le produit.
```
