---
paths:
  - "backoffice/backend/db/**"
  - "backoffice/docs/db/**"
---

# Base de données (PostgreSQL, migrations Knex)

- **Jamais** de modification d'une migration déjà poussée : on en ajoute une nouvelle
  (`YYYYMMDDHHMMSS_description.js` dans `backend/db/migrations`).
- Chaque migration a un `down` qui marche : la CI joue `migrate:latest`, annule une à une les
  migrations datées d'après le 2026-05-21, puis rejoue `migrate:latest`. Si le retour arrière détruirait des données, le `down` refuse avec un message
  clair (exemple : `20261104040000_raise_game_podiums_to_six.js`).
- Une migration qui transforme des données existantes garde de quoi revenir en arrière (exemple :
  table de trace `question_kind_retypings`).
- **Statuts** : `0` inactif, `1` actif, `2` supprimé, `3` brouillon (thèmes, questions, réponses).
  Suppression logique : `status = 2` **et** `deleted_at` renseigné.
- **Colonnes** : `company_id`, `created_at`, `updated_at`, `deleted_at`, `firstname`, `lastname`,
  `username`, `email`, `mdp_hash`.
- Une liste de valeurs autorisées (contrainte `CHECK`) doit rester alignée sur la constante de
  `@quizzup/shared` ; un test compare les deux (`tests/backend/src/db/gameSchema.test.ts`).
- Tout changement de schéma met à jour `backoffice/docs/db/db.dbml` dans la même PR.
- Les tests `*.pg.test.ts` refusent toute base dont le nom ne finit pas par `_test`. Ne contourne
  pas ce garde-fou.
- Le seed `quizz_content.js` fait un `TRUNCATE CASCADE` : jamais sur une base qui contient des
  données réelles.
