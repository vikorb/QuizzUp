---
paths:
  - "backoffice/backend/**"
  - "backoffice/shared/**"
---

# Backend (Fastify, Knex, PostgreSQL) et constantes partagées

- **Une ressource = un dossier** sous `backend/src/routes/<ressource>/` : un fichier par forme d'URL
  (`id.ts`, `idStatus.ts`), schémas Zod dans `_schemas.ts`, helpers de la ressource dans
  `_shared.ts`. Ce qui sert à plusieurs ressources va dans `routes/_shared/`. Regarde une ressource
  voisine avant d'en créer une.
- **Toute entrée est validée par Zod** à la frontière (corps, paramètres, query). Les énumérations
  viennent de `@quizzup/shared` (`z.enum(MINI_GAMES)`), jamais d'une liste recopiée.
- **Erreurs stables** : un code en `snake_case` (`podium_not_in_room`) que le frontend traduit. Un
  nouveau code côté serveur = une clé i18n `fr` et `en` côté client dans la même PR.
- **Permissions** : toute route protégée passe par la matrice rôle × ressource × action de
  `src/security/permissions.ts`. Pas de test de rôle écrit à la main dans une route.
- **Multi-tenant** : toute requête sur une donnée de compagnie est filtrée par `company_id`, sauf
  pour le superadmin. Chaque route nouvelle a un test « un admin de la compagnie A ne voit ni ne
  modifie la compagnie B ».
- **Données personnelles** : e-mails des joueurs masqués pour le rôle `user` ; ne jamais les écrire
  dans un journal ; toute nouvelle donnée de joueur doit être couverte par la purge RGPD
  (`npm run purge:emails`).
- **Constantes** : une valeur lue par le back et le front vit dans `backoffice/shared/src/index.ts`.
  Après modification : `cd backoffice/shared && npm run build`, sinon back et front lisent
  l'ancienne version.
- **Pièges connus** : les `bigint` (ids, `company_id`) sont déjà lus en nombres par `src/db.ts`
  (`types.setTypeParser`) : ne pas les reconvertir, et ne pas créer de client `pg` ailleurs ; le `mockDb`
  des tests n'applique pas les valeurs par défaut de la base.
- **Doc dans la même PR** : `backoffice/docs/api/openapi.yaml` si une route change,
  `backend/.env.example` si une variable change.
