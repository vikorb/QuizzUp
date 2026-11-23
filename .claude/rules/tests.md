---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "backoffice/tests/**"
  - "game/e2e/**"
---

# Tests

Objectif du projet : beaucoup de tests unitaires, fonctionnels et de bout en bout pour ne jamais
régresser. Un changement sans test n'est pas fini.

- **Où** : backoffice dans `backoffice/tests/{backend,frontend}/src`, en miroir de `src`
  (`routes/companies/idStatus.ts` → `companies.idStatus.test.ts`), mocks et fabriques dans les
  dossiers `_helpers`. Paquets `game/*` : dossier `tests/` du paquet (avec son `_helpers`).
  Parcours complets : `game/e2e` (Playwright, Chromium).
- **Quoi tester** : le comportement vu de l'extérieur (réponse HTTP, événement émis, texte affiché),
  pas le détail interne. Pour une route : succès, entrée invalide, non connecté, rôle interdit,
  autre compagnie.
- **Un bug = un test qui échoue d'abord**, puis la correction.
- **Un test doit pouvoir échouer.** Pas d'assertion sur un mock qu'on vient de programmer, pas de
  `expect(true)`.
- **Déterminisme** : horloge simulée, graine fixée, pas d'attente en temps réel. Un test instable se
  corrige à la cause (exemple : précharger les écrans paresseux), il ne se relance pas.
- **Interdit pour passer au vert** : `.skip`, `.only`, `.todo` laissés dans le code, seuil de
  couverture baissé, assertion supprimée, règle de lint désactivée.
- **Seuils de couverture** (lignes / fonctions / branches / instructions) : `game/engine`,
  `game/hardware`, `game/artnet-bridge` 90 / 90 / 85 / 90 ; `game/room-app` 80 / 80 / 75 / 80.
- **PostgreSQL réel** : les tests `*.pg.test.ts` tournent en CI (job migrations) et seulement sur
  une base dont le nom finit par `_test`. La CI les prend par motif (`.pg.test.ts`) et les lance l'un
  après l'autre sur **une seule base partagée**, dans un ordre non garanti : chaque fichier prépare
  ses propres données (`TRUNCATE <ses tables>, admins, companies RESTART IDENTITY CASCADE` en
  `beforeEach` s'il insère sans identifiant explicite) et laisse la base migrée au dernier niveau.
- **Bout en bout** : toute fonctionnalité qui traverse backoffice et écran de salle (lancement,
  commande à distance, inscription, fin de partie) a un scénario Playwright.
