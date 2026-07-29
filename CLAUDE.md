# QuizzUp — Guide pour Claude

> Mémo chargé à chaque session. Objectif : comprendre vite le projet, respecter les
> conventions, et travailler proprement. Tenir ce fichier à jour quand une règle change.

## 1. Le produit

QuizzUp est une solution de **quiz pour salles de jeu** (escape game, laser game, centres de
loisirs). Une salle équipée (pupitres, buzzers, lumières, écran) fait tourner des parties de
quiz ; le tout est piloté par un **backoffice** de gestion.

Rôles (multi-tenant) :

- **superadmin** — l'éditeur (nous). Accès à tout, toutes les compagnies.
- **admin** — le client licencié (un escape game / centre). Gère sa compagnie et ses comptes.
- **user** — un membre du staff du client. Droits restreints.
- **player / joueur** — le client final qui joue en salle.

État d'avancement :

- ✅ **Backoffice** (auth, compagnies, comptes, thèmes, questions, réponses) : mûr et testé.
- 🔨 **Moteur de jeu temps réel** (parties, buzzers, lumières, écran de salle, pupitres) :
  **prochain grand chantier, pas encore commencé**. Les tables `games/rounds/…` sont dessinées
  dans le DBML mais **pas encore migrées**.

## 2. Structure du dépôt (monorepo)

Racine git = `C:\git\QuizzUp`. Le code applicatif vit sous `backoffice/`.

```
backoffice/
├─ backend/    Fastify + TypeScript + Knex + PostgreSQL
├─ frontend/   Vue 3 + Vite + TypeScript
├─ shared/     @quizzup/shared — constantes/types partagés back+front
├─ docs/       openapi.yaml, db.dbml, architecture (mermaid)
└─ tests/      espace de tests centralisé
```

À venir : un dossier `game/` (moteur temps réel) à côté de `backoffice/`.

## 3. Remotes & CI — IMPORTANT

Le code et la CI sont **volontairement séparés sur deux plateformes** :

- `origin` → **GitHub** `github.com/vikorb/QuizzUp` = **le code**. On pousse le code ici.
- `gitlab` → **GitLab** `gitlab.com/victoriaoruba06/quizzup` = **la CI uniquement**. Son
  `.gitlab-ci.yml` fait un `git clone` de GitHub puis lance lint → tests → build → Sonar →
  Lighthouse → audit deps → deploy.

Conséquences à retenir :

- La CI GitLab clone **la branche par défaut de GitHub (`main`)** : telle quelle elle valide
  `main`, **pas** une branche de feature. (Un garde-fou pré-merge — GitHub Actions sur PR, ou
  branche paramétrée côté GitLab — reste à ajouter.)
- Le `.gitlab-ci.yml` vit sur le **repo GitLab**, pas dans ce dépôt GitHub. Pour le modifier,
  agir côté GitLab.
- Identité des commits = **perso** : `Victoria Oruba <victoriaoruba06@gmail.com>` (config
  **locale** à ce repo).
- CLI : **GitHub → `gh`** (connecté `vikorb`), **GitLab → `glab`** (connecté `victoriaoruba06`).
- Le compte GitLab **Sopra** (`innersource.soprasteria.com`) est isolé sur son propre hôte et
  **ne doit jamais** servir ici.

## 4. Workflow de travail

Mode par défaut : **autonome**.

1. Compléter ou créer une issue.
2. Créer une **branche dédiée** (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
3. En local : **lint + type-check + tests verts** avant de proposer quoi que ce soit.
4. Ouvrir une **PR GitHub** (`gh pr create`).
5. Déclencher / lire la **CI GitLab** (`glab ci … -R victoriaoruba06/quizzup`), signaler quand
   c'est vert.
6. L'utilisateur relit et merge.

Exceptions : petites tâches (doc, config) peuvent être **poussées directement sur `main`** si
l'utilisateur le demande.

Commits : **Conventional Commits** (`feat(scope): …`, `fix`, `docs`, `refactor`, `chore`,
`test`). **husky (à la racine) + commitlint** valident chaque message de commit ; un
`pre-commit` lance lint-staged (voir §5 et `CONTRIBUTING.md`).
Objectif qualité explicite du projet : **beaucoup de tests unitaires / fonctionnels / e2e pour
éviter les régressions**.

## 5. Stack & commandes

**Installation locale (obligatoire avant de lancer les tests)** — les tests importent
`backend/src` et `frontend/src`, donc il faut les deps des **4** packages + le build de `shared`,
sinon erreurs `Cannot find package 'zod'` / `Tsconfig not found` :

```bash
npm install                                    # racine (husky), depuis la racine du repo
cd backoffice
npm install                                    # workspace backoffice (lint/test/type-check)
npm --prefix shared install && npm --prefix shared run build
npm --prefix backend install
npm --prefix frontend install
```

**Qualité — depuis `backoffice/`** (orchestre back + front, à lancer avant chaque PR) :

```bash
npm run lint           # eslint .            (npm run lint:fix pour corriger)
npm run format         # prettier --write    (npm run format:check pour vérifier)
npm test               # test:backend + test:frontend (vitest)
npm run test:backend   # vitest --config vitest.backend.config.ts
npm run test:frontend  # vitest --config vitest.frontend.config.ts
npm run test:coverage
npm run type-check     # front + back + tests (vue-tsc / tsc)
```

**Backend — depuis `backoffice/backend/`** (`type: commonjs`) — serveur & base de données :

```bash
npm run dev       # tsx watch src/server.ts
npm run build     # tsc
npm run migrate   # knex migrate:latest
npm run rollback  # knex migrate:rollback
npm run seed      # knex seed:run
```

**Frontend — depuis `backoffice/frontend/`** (`type: module`) — Vue 3, Vite, Router, i18n :

```bash
npm run dev
npm run build
npm run knip      # code mort
```

**Shared — depuis `backoffice/shared/`** : `npm run build` (à builder avant back/front qui en dépendent).

**Docker** (depuis `backoffice/`) : `docker compose up --build`
→ backend `:3001`, frontend `:4173`, Swagger `:3001/docs`, Postgres `:5434`.

**CI GitLab** : `glab ci list -R victoriaoruba06/quizzup`, `glab ci status`, `glab ci run`.

**Git hooks (husky, à la racine)** : `commit-msg` = commitlint (Conventional Commits),
`pre-commit` = lint-staged (`eslint --fix` + `prettier`) sur les fichiers stagés de `backoffice/`.
Le pre-commit se **désactive proprement** si `backoffice/node_modules` est absent. Pour installer :
`npm install` à la racine (câble husky via `prepare`) puis `npm install` dans `backoffice/`.

Env : copier `backoffice/backend/.env.example` → `.env` (idem frontend). `DATABASE_URL` → `localhost:5434`.

## 6. Base de données & conventions

- PostgreSQL. Migrations Knex dans `backoffice/backend/db/migrations`, seeds dans `db/seeds`.
- **Statuts harmonisés** : `0=inactif`, `1=actif`, `2=supprimé` (+ `3=draft` pour
  theme/question/answer). Suppression **logique** : `status=2` + `deleted_at` renseigné.
- Conventions colonnes : `company_id`, `created_at`, `updated_at`, `deleted_at`, `firstname`,
  `lastname`, `username`, `email`, `mdp_hash`.
- Changement de schéma → **nouvelle migration** (ne jamais modifier une migration déjà
  partagée) **et** mise à jour de `docs/db/db.dbml`.

## 7. Auth, sécurité & permissions

- **Auth** : JWT + sessions en base (`admin_sessions`) avec expiration par **inactivité
  glissante (1h)**. Voir `backend/src/plugins/auth.ts`.
- **RBAC** : matrice rôle × ressource × action dans `backend/src/security/permissions.ts`.
- **Multi-tenant** : isolation par `company_id` ; le superadmin voit tout. Le contenu
  (thèmes/questions) a un **scope** `global` vs `company`.
- **Constantes** rôles/statuts/scopes dans `@quizzup/shared` — **toujours les réutiliser**,
  jamais dupliquer une valeur.

## 8. Règles de doc à tenir à jour (projet)

- **Swagger** `docs/api/openapi.yaml` si une route change.
- **DBML** `docs/db/db.dbml` si la base change.
- **`.env.example`** si une variable change.
- **i18n** : ajouter les clés `fr` (et `en`) nécessaires côté frontend.
- README / CONTRIBUTING / CHANGELOG selon le cas.

## 9. Pointeurs

- `backoffice/README.md` — installation & fonctionnalités
- `backoffice/CONTRIBUTING.md` — conventions détaillées
- `backoffice/docs/architecture/architecture.md` — schémas mermaid
- `backoffice/docs/api/openapi.yaml` — API
- `backoffice/docs/db/db.dbml` — schéma DB (importable dans dbdiagram.io)

## 10. Pièges connus / TODO

- `JWT_SECRET` par défaut dans `docker-compose.yml` → à externaliser (secret) avant prod.
- Stockage média (image/audio/vidéo des questions) : `type_media` existe mais **pas** de
  stratégie d'upload/stockage.
- CI GitLab valide `main`, pas les branches de PR (cf. §3).
- Node local très récent (v25) vs CI `node:22` — surveiller les écarts.
- Moteur de jeu : privilégier un **serveur autoritatif + WebSocket**, **découplé du matériel**
  (tablettes/navigateur d'abord, passerelle hardware ESP32/MQTT ensuite via le même protocole).
