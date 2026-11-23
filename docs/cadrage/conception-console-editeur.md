# Lot 12 : console éditeur isolée et route publique des demandes de démonstration

**Recommandation.**
1. Une seule garde réseau, placée dans `app.authenticate` : toute requête d'un compte superadmin dont l'adresse (`req.ip`, calculée par Fastify avec `trustProxy`) n'est pas dans `CONSOLE_ALLOWED_CIDRS` reçoit un 403. Même chose à la connexion, où la réponse est un 401 identique à un mauvais mot de passe. Si la variable est absente, l'accès est refusé.
2. TOTP superadmin écrit avec `node:crypto`, en connexion en deux temps par jeton de défi de 5 minutes. Le secret est chiffré en AES-256-GCM avec une clé dédiée.
3. Le frontend est construit deux fois (`--mode centre` et `--mode console`) grâce à un alias Vite. La route `/public/v1/demo-requests` stocke les demandes en base, sans envoi d'e-mail en V1, avec `@fastify/rate-limit` comme seule nouvelle dépendance.

**Ce qui me ferait changer d'avis.**
- Si personne n'ouvre la console chaque jour, l'envoi d'un e-mail redevient nécessaire (point 4).
- Si le relais public passait par la même plage que le VPN, il faudrait une plage d'opérateurs distincte (point 7).

---

## 1. Contrôle réseau côté API

**Constat dans le code.**
- `buildApp` crée `Fastify({ logger: true })` sans `trustProxy`. En recette, `req.ip` vaut donc toujours l'adresse du conteneur Caddy, qui est une adresse privée.
- Conséquence : une liste « réseaux privés RFC 1918 » laisserait passer tout internet. Le « réseau privé » doit donc être la plage des postes opérateurs du VPN, jamais une plage générique.

**Source de vérité de l'adresse.** On utilise uniquement `req.ip`, et on ne lit jamais `X-Forwarded-For` à la main.
- **`trustProxy`** reçoit `TRUST_PROXY` : une liste CIDR exacte du réseau Docker entre Caddy et l'API. Ce sous-réseau est fixé dans le compose (ipam) pour que la valeur soit stable.
- **Valeurs refusées.** `true` et `*` sont refusés au démarrage. Avec `true`, Fastify prendrait l'adresse la plus à gauche de `X-Forwarded-For`, que le client peut falsifier.
- **Lecture de la chaîne.** Avec une liste, `proxy-addr` remonte la chaîne depuis la droite et s'arrête au premier saut non approuvé.
- **Rôle de Caddy.** Sans `trusted_proxies`, Caddy remplace le `X-Forwarded-For` reçu par l'adresse du pair direct, ce qui bloque l'usurpation dès l'entrée.
- **Absence de `TRUST_PROXY`.** On garde l'adresse du socket : c'est le cas du développement local, où l'API est appelée directement.

**Variables d'environnement.**
- **`CONSOLE_ALLOWED_CIDRS`** : liste CIDR IPv4 et IPv6 séparée par des virgules.
  - Absente ou vide : tout superadmin est refusé, quel que soit l'environnement.
  - Une entrée invalide empêche le démarrage.
- **Développement.** On ouvre explicitement, sans dépendre de `NODE_ENV` (que la recette ne définit pas aujourd'hui) :
  - `.env.example` met `127.0.0.1/32,::1/128` ;
  - `backoffice/docker-compose.yml` met `0.0.0.0/0,::/0`. C'est acceptable parce que ses ports sont liés à `127.0.0.1`, et un commentaire le dira.
- **Recette.** `deploy/recette/docker-compose.yml` transmet `CONSOLE_ALLOWED_CIDRS` et `TRUST_PROXY` sans valeur par défaut. Une recette mal configurée est donc fermée, pas ouverte.
- **Comparaison des adresses.** On utilise `net.BlockList` de Node (`addSubnet`, `check`) et on normalise `::ffff:a.b.c.d`. Aucune dépendance n'est ajoutée.
- **Démarrage.** On journalise le nombre de plages autorisées, ou « console fermée ».

**Point d'application unique.** Nouveau module `backend/src/security/consoleNetwork.ts`, qui lit et contrôle les deux variables et expose un test d'appartenance. Il sert à trois endroits, tous dans l'authentification :
- **`app.authenticate` (`plugins/auth.ts`)**, juste après `checkSession`. Le rôle y est relu en base : si `admin.role === ADMIN_ROLE_SUPERADMIN` et que l'adresse est hors liste, la réponse est 403 `{ "error": "forbidden" }`. On journalise un avertissement avec l'id de l'admin et la route, ce qui sert d'alarme.
- **`POST /login`** : la branche superadmin hors réseau répond 401 `invalid_credentials` après la vérification bcrypt, sans créer de session.
- **Les routes du deuxième facteur** (point 2).

Aucune route n'a donc de test recopié. Les tests de routes existants (`createRouteApp` simule `authenticate`) ne voient pas la garde et ne régressent pas.

**Superadmin dans le contexte d'une compagnie.** La garde porte sur le rôle de celui qui appelle, pas sur la route. Toutes les requêtes superadmin sont couvertes, y compris :
- les accès croisés sur `/companies/:companyId/*` ;
- les écritures de contenu `global` ;
- les salles supprimées visibles, la création de comptes superadmin, les parties de toutes les compagnies ;
- les flux SSE.

Un superadmin ne peut donc rien faire depuis `app.<domaine>`. Il passe par la console. Une liste limitée aux routes « réservées » laisserait un jeton volé utilisable sur tout le reste de l'API.

**Connexion du superadmin.** Elle est impossible hors réseau privé : la réponse est 401 `invalid_credentials`, la même qu'un mauvais mot de passe. Un 403 confirmerait que le mot de passe est juste.

**Ce que voit un attaquant.**
- Avec un jeton superadmin valide, il reçoit 403 `{ "error": "forbidden" }`, le même corps que `requireApiPermission`.
- À la connexion, il reçoit un 401 identique à un échec ordinaire.
- Sur le nom d'hôte de la console, Caddy coupe la connexion (`abort`).

**Routes concernées aujourd'hui.**
- **Réservées au superadmin par la matrice :**
  - `GET /companies` et `POST /companies` (`company:list`, `company:create`) ;
  - `PATCH /companies/:id/status` (`company:updateStatus`) ;
  - `DELETE /companies/:id/permanent` (`company:permanentDelete`).
  - `company:delete` figure dans la matrice mais aucune route ne l'utilise.
- **Comportements réservés au superadmin dans des routes partagées :**
  - `PATCH /companies/:id` avec `status` ;
  - portée `global` sur `POST`/`PATCH /themes` et `/questions` (`routes/_shared/scope.ts`) ;
  - salles supprimées dans `GET /companies/:companyId/rooms` et `GET .../rooms/:id` ;
  - création d'un compte avec le rôle `superadmin` (`companies/admins/index.ts`) ;
  - accès à toute compagnie dans toutes les politiques de `companiesPolicy.ts` et dans `games/_shared.ts`.
- **Ajoutées par ce lot :** `GET /demo-requests`, `PATCH /demo-requests/:id`, `DELETE /demo-requests/:id`, `DELETE /me/totp`.
- **Non concernées :** `/health`, `/docs` et `POST /login`, qui n'utilisent pas `authenticate`.

## 2. Double authentification TOTP du superadmin

**Bibliothèque.** On l'écrit avec `node:crypto` : HMAC-SHA1, 6 chiffres, période de 30 s, fenêtre de ±1 pas, comparaison par `timingSafeEqual`, encodage base32 RFC 4648.
- Cela représente une quarantaine de lignes, vérifiables avec les vecteurs de l'annexe B de la RFC 6238 (secret `12345678901234567890`, T = 59 → `94287082`, soit `287082` sur 6 chiffres).
- `otpauth` ou `otplib` ajouteraient une dépendance pour moins de code que leurs tests ; la partie sensible de sécurité vient déjà de la bibliothèque standard.

**Modèle de données** (migration `20261124000000_create_admin_totp.js`).
- **Table `admin_totp`** :
  - `admin_id` : bigint, clé primaire, référence `admins`, ON DELETE CASCADE ;
  - `secret_enc` : texte au format `v1.<iv>.<tag>.<chiffré>` en base64 ;
  - `confirmed_at` : timestamptz, `null` tant que l'enrôlement est en cours ;
  - `last_used_step` : bigint null, sert à l'anti-rejeu ;
  - `failed_attempts` : smallint, défaut 0 ;
  - `locked_until` : timestamptz null ;
  - `created_at`, `updated_at`.
- **Table `admin_totp_recovery_codes`** : `id`, `admin_id` (FK CASCADE), `code_hash` (char 64), `used_at` (null), `created_at`, avec un index unique sur (`admin_id`, `code_hash`).
- **`up` révoque les sessions superadmin ouvertes** (`admin_sessions.revoked_at = now()`), pour qu'aucune session d'avant la double authentification ne survive.
- **`down` supprime les deux tables.** Ce sont des données de sécurité recréées par un nouvel enrôlement, pas des données métier ; le commentaire de la migration le dira.
- Mettre à jour `db.dbml`.

**Chiffrement au repos.**
- Algorithme : AES-256-GCM avec `node:crypto`.
- Clé : `TOTP_ENCRYPTION_KEY`, 32 octets en base64, distincte de `JWT_SECRET`, injectée comme secret du compose, jamais dans le dépôt, sauvegardée à part dans un gestionnaire de mots de passe.
- Données associées : `admin_id`, pour qu'un chiffré recopié sur une autre ligne ne se déchiffre pas.
- Une sauvegarde de la base sans la clé ne livre aucun secret.
- **Clé absente** : la connexion superadmin répond 503 `totp_unavailable` et une erreur est journalisée au démarrage. Les centres ne sont pas touchés : on ne bloque pas toute l'API pour la console.

**Codes de secours.**
- 10 codes au format `xxxxx-xxxxx` en base32, soit 50 bits d'entropie.
- Stockés hachés en SHA-256 après normalisation (minuscules, sans tiret). bcrypt n'apporte rien avec cette entropie et imposerait une boucle sur dix hachages.
- Usage unique, consommé par un seul `UPDATE … WHERE used_at IS NULL` atomique.

**Connexion en deux temps.** On retient un jeton de défi plutôt qu'un état de session.
- `POST /login` sur un superadmin, dans le réseau, avec un mot de passe juste, répond 200 `{ "mfa": "totp" | "enroll", "challengeToken": "…" }`. Aucune session n'est créée.
- Le jeton est un JWT signé par `app.jwt`, valable 5 minutes, contenant `sub` et `typ: "mfa_challenge"`, sans `sid`.
- `authenticate` refuse explicitement tout jeton portant `typ` (401 `unauthorized`). Les routes de défi refusent tout jeton sans `typ: "mfa_challenge"`.
- Pourquoi ce choix : `admin_sessions`, `checkSession` et le glissement d'une heure restent intacts. Un état « session en attente » aurait obligé à ajouter une exception dans `authenticate`.
- Les autres rôles ne changent pas : toujours `{ token, admin }`.

**Contrats** (tous passent la garde réseau, limite de débit par adresse, point 4) :

| Route | Corps | Succès | Erreurs |
| --- | --- | --- | --- |
| `POST /login/totp` | `challengeToken`, `code` (6 chiffres = TOTP, sinon code de secours) | `{ token, admin, recoveryCodesRemaining? }` | 401 `mfa_challenge_invalid`, 401 `totp_invalid` (code faux ou rejoué, même réponse), 429 `too_many_attempts` + `Retry-After`, 409 `totp_not_enrolled` |
| `POST /login/totp/enroll` | `challengeToken` | `{ secret, otpauthUrl }` (régénère le secret tant que `confirmed_at` est null) | 401 `mfa_challenge_invalid`, 409 `totp_already_enrolled` |
| `POST /login/totp/enroll/confirm` | `challengeToken`, `code` | `{ token, admin, recoveryCodes: string[10] }` | 401 `mfa_challenge_invalid`, 401 `totp_invalid`, 409 `totp_already_enrolled` |
| `DELETE /me/totp` (authentifié, superadmin) | `code` (TOTP ou code de secours) | 204 ; efface secret et codes, révoque toutes les sessions de l'admin ; prochain login = enrôlement | 401 `totp_invalid`, 403 `forbidden` |

- `otpauthUrl` utilise l'émetteur `TOTP_ISSUER`, facultatif, défaut `QuizzUp`, puisque le nom du produit n'est pas figé.
- **Anti-rejeu** : un code n'est accepté que si son pas est strictement supérieur à `last_used_step`, mis à jour par un `UPDATE` conditionnel.
- **Limite d'essais** : 5 échecs, puis `locked_until` à 15 minutes ; le compteur repart à zéro après un succès. La limite par adresse s'y ajoute.

**Perte du téléphone.**
1. Se connecter avec un code de secours.
2. Appeler `DELETE /me/totp`.
3. Se réenrôler à la connexion suivante.

**Tout perdu** (téléphone et codes, ou `TOTP_ENCRYPTION_KEY`) : commande `npm run totp:reset -- --username <x>` dans `backend/`. Elle suit le modèle de `purgePlayerEmailsCli.ts`, efface `admin_totp` et les codes, et révoque les sessions. Elle demande un accès au serveur, ce qui est voulu. On ne prévoit pas de réinitialisation d'un superadmin par un autre : la commande suffit pour deux personnes.

**Superadmins existants.** Rien à préparer.
- À la première connexion après la mise en production, le mot de passe dans le réseau privé ouvre l'enrôlement forcé : pas de blocage possible tant que mot de passe et VPN sont là.
- Le risque accepté est la fenêtre « premier arrivé enrôle », limitée au réseau privé.
- Pas d'interrupteur pour désactiver le TOTP, même en local : c'est une branche de moins et un piège de moins en production.

**Écrans** (`LoginForm.vue` devient un parcours par étapes ; tout le texte en `fr`/`en`) :
- **Code** : `inputmode="numeric"`, `autocomplete="one-time-code"`, lien « Utiliser un code de secours ».
- **Enrôlement** : clé groupée par 4 avec bouton copier et lien `otpauth://`. Pas de QR code (bibliothèque front) en V1.
- **Codes de secours** : affichés une seule fois, avec boutons copier et télécharger en `.txt`, et une case « Je les ai enregistrés » obligatoire pour continuer.
- **Après un code de secours** : bandeau « il vous reste N codes ».
- **Profil** (`/profil`) : section « Double authentification » avec « Réinitialiser », qui demande un code puis déconnecte.

## 3. Séparation des frontends

**Mécanisme.**
- **Vite.** `vite.config.ts` passe à `defineConfig(({ mode }) => …)` avec un alias `@surface` :
  - `mode === 'console'`, `development` ou `test` → `src/surface/console.ts` ;
  - tout autre mode, y compris `production` et `centre` → `src/surface/centre.ts`.
  - Le build par défaut est donc le build sûr, et le travail en local reste inchangé (tous les écrans).
- **Contenu des deux modules.** Chacun exporte `routes`, une liste de routes enfants, et `navItems`, les entrées de menu.
  - `centre.ts` exporte deux listes vides ;
  - `console.ts` contient `clients`, `clients-create` et `demo-requests`, en `component: () => import(…)`, plus le lien « Clients » et « Demandes de démo ».
- **Pourquoi un alias.** Le build centre ne lit jamais ces fichiers. On ne dépend pas de l'élagage de Rollup.
- **Routeur.** `router/index.ts` retire les imports statiques de `ClientsView` et `CreateClientView` et ajoute `...surfaceRoutes` aux enfants de `/`. La garde `requiresSuperadmin` est conservée.
- **Menu.** `SideBar.vue` lit `navItems` au lieu de tester le rôle pour le lien `/clients`.
- **Écrans partagés.** `ClientDetailsView` reste commun, car l'admin voit sa propre compagnie. Ses branches superadmin sont inoffensives, l'API refusant.
- **Fichiers de configuration.**
  - `tsconfig.app.json` : chemin `@surface/*` vers `console.ts` (la vérification de types porte sur le sur-ensemble) ;
  - `backoffice/vitest.frontend.config.ts` et `frontend/vitest.config.ts` : même alias vers `console.ts` ;
  - `package.json` : scripts `build:centre` (`vite build --mode centre`), `build:console` (`vite build --mode console`) et `check:surface`.
- **Textes.** Les locales restent communes, donc les textes de la console sont présents dans le lot centre. Ce sont des textes, pas des écrans. On sépare les fichiers de traduction seulement si cela gêne.

**Docker et Caddy (recette).**
- **`Dockerfile.web`** construit deux fois :
  - centre avec `VITE_API_URL=https://api.<domaine>` vers `/srv/backoffice` ;
  - console avec `VITE_API_URL=/api` vers `/srv/console`.
- **La console appelle l'API sur son propre nom d'hôte**, chemin `/api`, même origine, sans CORS. Sinon son trafic passerait par `api.<domaine>`, donc par internet, et la garde la refuserait.
- **Nouveau bloc `console.{$DOMAIN}` dans le `Caddyfile`** :
  - `@hors not remote_ip {$CONSOLE_ALLOWED_CIDRS}` → `abort` ;
  - `handle_path /api/*` → `reverse_proxy backend:3001`, avec `flush_interval -1` sur `/api/room/stream` et `/api/companies/*/live` ;
  - fichiers statiques de `/srv/console`.
- **Le bloc `bo` ne change pas.** Il sert le lot centre.
- **Certificat du nom de la console** : à régler dans la documentation d'hébergement privée (autorité interne de Caddy ou défi DNS). Cela ne change pas le code.

**Test de garantie.** `frontend/scripts/check-surface.mjs`, sur le modèle de `check-lines.mjs` :
- les écrans réservés à la console portent un attribut statique `data-surface="console"` sur leur élément racine ;
- le script construit les deux modes et échoue si `data-surface` apparaît dans `dist` du centre, ou s'il est absent de `dist` de la console (sans cette seconde condition, le test ne pourrait jamais échouer) ;
- étape à ajouter dans le job frontend de `.github/workflows/ci.yml`.

## 4. Route `POST /public/v1/demo-requests` et conventions `/public/v1`

**Conventions communes à tout `/public/v1`** (à recopier dans le brief du lot 14) :
1. **Enregistrement.** Un seul plugin `routes/public/index.ts`, enregistré avec `prefix: '/public/v1'`. Une ressource par dossier : `routes/public/demoRequests/`, puis `routes/public/bookings/` pour le lot 14.
2. **Authentification.** Jamais `app.authenticate`, ni jeton JWT, ni cookie. Le lot 14 ajoute sa propre authentification par clé, dans son plugin.
3. **Format d'erreur.** Le même que le backoffice : statut HTTP plus `{ "error": "<code_snake_case>", "details"?: {…} }`. `details` vaut seulement `fieldErrors` de Zod pour `invalid_body`.
   - Le plugin public pose son `setErrorHandler` et son `setNotFoundHandler`, sans pile ni message brut :
     - `invalid_json` (400), `invalid_body` (400) ;
     - `unsupported_media_type` (415), `payload_too_large` (413) ;
     - `not_found` (404), `rate_limited` (429), `server_error` (500).
   - Le lot 14 ajoute `unauthorized` (401) et `conflict` (409) au besoin.
4. **Limite de débit.** `@fastify/rate-limit`, plugin officiel de Fastify. Aucune bibliothèque de ce type n'est installée aujourd'hui ; seuls `@fastify/cors`, `jwt`, `swagger` et `swagger-ui` le sont.
   - Enregistré une fois dans `app.ts` avec `global: false` et stockage en mémoire. C'est cohérent avec la contrainte « une seule instance » déjà posée par le hub SSE.
   - Chaque route déclare `config.rateLimit` (`max`, `timeWindow`, `keyGenerator`). Clé par défaut `req.ip`, d'où la dépendance au point 1 ; le lot 14 utilisera l'id de la clé.
   - 429 renvoie `{ "error": "rate_limited" }` et l'en-tête `Retry-After`.
   - Sert aussi à `/login` et `/login/totp*` : 10 par minute par adresse. Aujourd'hui `/login` n'a aucune limite.
5. **CORS.** Aucun par défaut sous `/public/v1` : une API appelée de serveur à serveur n'en a pas besoin. Les routes ouvertes à un navigateur sont listées explicitement grâce à l'option `delegator` de `@fastify/cors` dans `app.ts`. Les autres routes gardent `CORS_ORIGIN` tel quel.
6. **Format des données.** Champs JSON en camelCase, dates ISO 8601 en UTC. Une route = une entrée dans `openapi.yaml` avec le schéma `PublicError`. La séparation en un fichier OpenAPI public reste au lot 14.

**Contrat.** Corps JSON, limité à 16 Ko par `bodyLimit` de la route :

| Champ | Règle |
| --- | --- |
| `name` | chaîne de 1 à 120 caractères |
| `centerName` | chaîne de 1 à 160 caractères |
| `email` | `z.email()`, 254 caractères au plus |
| `phone` | facultatif, `^[+0-9 ().-]{6,32}$` |
| `roomsCount` | entier de 1 à `DEMO_REQUEST_ROOMS_MAX` (50) |
| `message` | facultatif, `DEMO_REQUEST_MESSAGE_MAX` (2000) caractères au plus |
| `consent` | doit valoir `true`, sinon 400 |
| `website` | champ piège, absent ou vide attendu |
| `locale` | facultatif, `fr` ou `en` |

- Réponse : 202 `{ "ok": true }`.
- Si le champ piège est rempli : la même réponse 202, mais rien n'est stocké.
- Limite : 5 demandes par heure et par adresse.
- Les constantes `DEMO_REQUEST_*` vont dans `@quizzup/shared` pour que la vitrine les réutilise.

**Stockage** (migration `20261124010000_create_demo_requests.js`). Table `demo_requests`, sans `company_id` : c'est une ressource de l'éditeur. C'est une exception à la règle multi-tenant, à noter dans `db.dbml`.
- `id` : bigIncrements ;
- `contact_name` : varchar 120 ;
- `center_name` : varchar 160 ;
- `email` : varchar 254 ;
- `phone` : varchar 32, null ;
- `rooms_count` : smallint, CHECK de 1 à 50 ;
- `message` : texte null ;
- `locale` : varchar 2, null ;
- `consent_at` : timestamptz, non null ;
- `processed_at` : timestamptz null ;
- `processed_by` : bigint null, FK `admins`, ON DELETE SET NULL ;
- `created_at`, `updated_at` ;
- index sur (`processed_at`, `created_at`).

Choix de modèle :
- Pas de colonne `status` : 0/1/2 a déjà un autre sens dans le projet.
- On ne stocke ni l'adresse IP ni le navigateur.
- Le `down` refuse si la table contient des lignes.

**Conservation et purge.**
- Suppression définitive 12 mois après `created_at` (durée à confirmer, questions finales), traitée ou non.
- Fonction `jobs/purgeDemoRequests.ts`, lancée par une seconde instance de `startPlayerEmailPurgeScheduler`. Le planificateur gagne une option `label` dont la valeur par défaut garde le texte actuel. Même intervalle `PLAYER_EMAIL_PURGE_INTERVAL_HOURS`, documenté comme réglant toutes les purges RGPD.

**Console.**
- Ressource `API_RESOURCE.DEMO_REQUEST = 'demoRequest'` dans `permissions.ts`, actions `list`, `update` et `delete`, pour le superadmin seulement.
- `GET /demo-requests` → `{ demoRequests, pendingCount }`, les plus récentes d'abord, sans pagination (le volume est faible).
- `PATCH /demo-requests/:id` avec `{ processed: boolean }` → `{ demoRequest }`, ou 404 `not_found`.
- `DELETE /demo-requests/:id` → 204. C'est une suppression définitive, pour le droit à l'effacement.
- Écran `DemoRequestsView.vue` (surface console uniquement) :
  - filtre « À traiter / Traitées » ;
  - colonnes date, nom, centre, e-mail, téléphone, salles, message dépliable ;
  - actions « Marquer traitée / Rouvrir » et « Supprimer » (`useConfirm`) ;
  - les trois états chargement, erreur, vide.

**Journaux.**
- Le journal par défaut de Fastify n'écrit pas les corps de requête. Il est interdit de journaliser le corps ou les détails Zod de cette route.
- Un test injecte un e-mail témoin et vérifie qu'il n'apparaît pas dans le flux du journal.
- L'adresse IP reste dans le journal d'accès habituel ; sa durée de vie est bornée par la rotation des journaux Docker, à régler dans le compose.

**Notification.** Pas d'envoi d'e-mail en V1 : la consultation en console suffit.
- Un envoi d'e-mail demanderait une dépendance SMTP, un fournisseur, de la configuration et du travail de délivrabilité, pour quelques demandes par mois.
- Cela contredit le cadrage §2 (« qui envoie l'e-mail ») : à confirmer par Enzo (questions finales).

## 5. Décision ouverte : VPN ou liste d'adresses

**Recommandation : VPN (WireGuard).**
- En mode liste d'adresses, le trafic de la console passe par le relais public. Caddy doit alors faire confiance au relais (`trusted_proxies`), `TRUST_PROXY` doit l'inclure, et le relais doit poser `X-Forwarded-For` correctement.
- Cela fait trois réglages à ne pas rater, sur le chemin même qui expose le serveur.
- Avec le VPN, la console contourne le relais, et Caddy comme l'API voient directement l'adresse du poste.

**Option par défaut qui marche dans les deux cas sans réécriture.** Le code ne connaît qu'une liste de plages, `CONSOLE_ALLOWED_CIDRS`, et `req.ip`.
- **VPN** : la variable contient la plage des postes opérateurs, et `TRUST_PROXY` le seul réseau de Caddy.
- **Liste d'adresses** : la variable contient les adresses publiques en /32, et `TRUST_PROXY` ajoute le relais.
- **Secours** si le VPN tombe : ajouter son adresse /32 à la variable et redémarrer l'API.
- Le passage d'un mode à l'autre se fait dans la configuration (compose et Caddy), jamais dans le code.

## 6. Découpage en PR

**12a (S). Contrôle réseau côté API** (`feat(backend)`)
- Fichiers :
  - `security/consoleNetwork.ts`, `app.ts` (`trustProxy`), `plugins/auth.ts`, `routes/auth.ts` ;
  - `.env.example` (`CONSOLE_ALLOWED_CIDRS`, `TRUST_PROXY`), `tests/backend/setup/env.ts` (`CONSOLE_ALLOWED_CIDRS ||= '127.0.0.1/32,::1/128'`) ;
  - `backoffice/docker-compose.yml`, `deploy/recette/docker-compose.yml` avec sous-réseau fixé, et son `README`.
- Exclu : Caddy et le frontend.
- Tests :
  - `consoleNetwork.test.ts` : IPv4, IPv6, adresse mappée, CIDR invalide, liste vide fermée, `TRUST_PROXY=true` refusé ;
  - `plugins/auth.test.ts` avec `inject({ remoteAddress })` :
    - **superadmin hors plage → 403 avec un jeton valide** ;
    - superadmin dans la plage → 200 ;
    - admin hors plage → 200 ;
    - `X-Forwarded-For` usurpé sans `TRUST_PROXY` → 403 ;
    - socket Caddy avec XFF « poste, publique » → 403 ;
  - `routes/auth.test.ts` : superadmin hors plage → 401 `invalid_credentials` et aucune ligne insérée dans `admin_sessions`.
- Doc : `.env.example`, CHANGELOG, et une mention dans la description de sécurité d'`openapi.yaml`.

**12b (S). Limite de débit et socle `/public/v1`** (`feat(backend)`)
- Fichiers : dépendance `@fastify/rate-limit`, `app.ts` (plugin, `delegator` CORS, `VITRINE_ORIGINS`), `routes/public/index.ts`, `routes/index.ts`, limite sur `/login`, `.env.example`, `openapi.yaml` (`PublicError`).
- Tests :
  - 429 avec `Retry-After` et `rate_limited` ;
  - normalisation de `invalid_json`, 415, 413 et 404 sous le préfixe ;
  - requête préliminaire CORS acceptée pour l'origine de la vitrine, refusée pour l'origine `bo` sur `/public/v1` ;
  - origines existantes inchangées ailleurs.
- Ordre : se développe en parallèle de 12a ; merger 12a d'abord (conflit limité à `app.ts`).

**12c (M). Demandes de démonstration côté serveur** (`feat(backend)`)
- Fichiers :
  - migration ;
  - `routes/public/demoRequests/{index.ts,_schemas.ts}` et `routes/demoRequests/{index.ts,id.ts,_schemas.ts}` ;
  - `permissions.ts`, `jobs/purgeDemoRequests.ts`, option `label` du planificateur, `server.ts` ;
  - `shared/src/index.ts`, `openapi.yaml`, `db.dbml`, CHANGELOG.
- Tests :
  - route publique : 202 avec une ligne, piège → 202 sans ligne, chaque champ invalide, `consent: false`, 6e envoi → 429, e-mail absent du journal ;
  - console : superadmin peut lister, modifier, supprimer ; admin et user → 403 ; 404 sur id inconnu ;
  - `permissions.test.ts` ;
  - `demoRequests.pg.test.ts` : 13 mois supprimée, 11 mois gardée, `down` refusé si la table n'est pas vide.
- Ordre : après 12b.

**12d (M). TOTP côté serveur** (`feat(backend)`)
- Fichiers :
  - migration ;
  - `security/totp.ts`, `security/secretBox.ts`, `security/resetTotpCli.ts` et le script `totp:reset` ;
  - `routes/auth.ts`, `routes/login/{totp.ts,enroll.ts}`, `routes/me/totp.ts`, `plugins/auth.ts` (refus de `typ`) ;
  - `shared/src/index.ts` (`TOTP_CODE_LENGTH`) ;
  - `.env.example` (`TOTP_ENCRYPTION_KEY`, `TOTP_ISSUER`), `setup/env.ts` (clé de test) ;
  - `openapi.yaml`, `db.dbml`, CHANGELOG.
- Tests :
  - vecteurs de la RFC 6238, fenêtre ±1, rejeu refusé, blocage au 5e échec puis fin du blocage (horloge simulée) ;
  - code de secours à usage unique ;
  - défi expiré → 401, défi utilisé comme jeton porteur → 401, jeton normal sur `/login/totp` → 401 ;
  - routes de défi hors réseau → refusées ;
  - chiffrement aller-retour, chiffré altéré ou autre `admin_id` → échec ;
  - clé absente → 503 ;
  - `DELETE /me/totp` révoque les sessions ;
  - mise à jour du test existant « connexion superadmin → jeton » (`routes/auth.test.ts`, vers la ligne 125), qui devient « → défi ».
- Ordre : après 12a et 12b, en parallèle de 12c.

**12e (M). Deux constructions du frontend** (`feat(frontend)`)
- Fichiers :
  - `vite.config.ts`, `src/surface/{console,centre}.ts`, `router/index.ts`, `SideBar.vue`, attribut `data-surface` dans `ClientsView` et `CreateClientView` ;
  - `tsconfig.app.json`, les deux configurations Vitest, `package.json`, `scripts/check-surface.mjs` ;
  - `.github/workflows/ci.yml` ;
  - `Dockerfile.web`, `Caddyfile` (bloc console), `deploy/recette/docker-compose.yml`.
- Tests : `check-surface`, et un test qui vérifie que les routes du centre ne contiennent pas `clients` ni `clients-create`. Lancer `npm run knip`.
- Ordre : en parallèle de 12a à 12d.

**12f (M). Connexion en deux temps et enrôlement côté écran** (`feat(frontend)`)
- Fichiers :
  - `utils/auth.ts` (`loginApi` renvoie aussi `mfa`), `views/login/LoginForm.vue` ;
  - `views/login/{TotpStep,TotpEnrollStep,RecoveryCodesStep}.vue` ;
  - section du profil ;
  - `types/api`, `utils/api.ts` (nouveaux codes d'erreur) ;
  - locales `fr`/`en`.
- Tests : composants des trois étapes, traduction de chaque code d'erreur, case obligatoire avant de continuer, compilation des locales.
- Ordre : se développe à partir du contrat de 12d ; merger après 12d.

**12g (S). Écran des demandes dans la console** (`feat(frontend)`)
- Fichiers : `services/demoRequestsService.ts`, `views/DemoRequestsView.vue`, `surface/console.ts`, locales.
- Tests : trois états, filtre, marquer traitée, suppression confirmée, présence du marqueur `data-surface`.
- Ordre : après 12c et 12e.

**Ordre global.** 12a et 12e d'abord, en parallèle. Puis 12b. Puis 12c et 12d en parallèle. Puis 12f et 12g.

**Fichiers chauds partagés.** Pour chacun, la PR à merger en premier et les suivantes qui rebasent :

| Fichier | PR qui le touchent |
| --- | --- |
| `shared/src/index.ts` | 12c, 12d |
| `openapi.yaml` | 12a, 12b, 12c, 12d |
| `db.dbml` | 12c, 12d |
| `permissions.ts` | 12c seulement |
| `routes/index.ts` | 12b, 12c, 12d |
| `app.ts` | 12a, 12b |
| `.env.example` et `setup/env.ts` | 12a, 12b, 12d |
| `deploy/recette/docker-compose.yml` | 12a, 12e |
| locales et `utils/api.ts` | 12f, 12g |
| CHANGELOG | toutes |

**Banc matériel.** Rien : ce lot ne touche pas la salle.

**Recette, à faire à la main avant de clore le lot** :
- depuis internet, un jeton superadmin valide reçoit 403 sur `GET /companies`, et le nom de la console coupe la connexion ;
- depuis le VPN : connexion, enrôlement, flux en direct ouvert plus de 10 minutes par `/api` ;
- `req.ip` journalisé à l'avertissement correspond bien à l'adresse du poste.

## 7. Risques

- **S'enfermer hors de la console.**
  - Variable absente : la console est fermée par conception. Il faut renseigner `CONSOLE_ALLOWED_CIDRS` avant de déployer 12a en recette (le README le dira en tête).
  - Secours : adresse /32 et redémarrage ; `npm run totp:reset` pour le TOTP ; clé de chiffrement sauvegardée hors serveur.
  - Aucun de ces secours ne passe par la console elle-même.
- **Erreur de configuration du proxy.** Trois pièges, chacun ouvrirait ou fermerait la console :
  - `TRUST_PROXY=true`, refusé au démarrage ;
  - une plage autorisée qui contient l'adresse du relais ou du réseau Docker : tout internet passerait. Règle écrite dans `.env.example` : « seulement les postes opérateurs ». Le journal de démarrage affiche les plages ;
  - un proxy Docker en espace utilisateur (IPv6, boucle locale) qui masque l'adresse source : la vérification de recette ci-dessus le détecte.
- **Régression des tests existants.**
  - Les tests de routes simulent `authenticate` : non touchés.
  - `plugins/auth.test.ts` passe des comptes superadmin en `127.0.0.1` : couvert par la valeur posée dans `setup/env.ts`. Un `backend/.env` local sans la variable fermerait l'accès, d'où le `||=`.
  - Le test de connexion superadmin de `routes/auth.test.ts` change de sens dans 12d : c'est voulu.
  - Aucun scénario e2e n'utilise le superadmin.
- **Révocation des sessions superadmin par la migration 12d.** Il faudra se reconnecter juste après le déploiement : à annoncer.

---

## Questions fermées pour Enzo et Victoria

1. Retient-on le VPN (WireGuard) pour la console, la liste d'adresses restant un secours de configuration ?
2. La V1 se passe-t-elle d'un envoi d'e-mail pour les demandes de démonstration, avec consultation en console, contrairement au cadrage §2 ?
3. Les demandes de démonstration sont-elles supprimées 12 mois après réception (au lieu de 3 ans) ?
4. Accepte-t-on un enrôlement TOTP par clé à saisir, sans QR code, en V1 ?
5. Le TOTP superadmin est-il obligatoire partout, y compris en local et en démo, sans interrupteur ?
6. Victoria (lot 10) rédige-t-elle le texte de la case de consentement et la mention correspondante dans la politique de confidentialité avant la mise en ligne de la vitrine ?

**Fichiers lus :**
- `backoffice/backend/src/plugins/auth.ts`
- `backoffice/backend/src/routes/auth.ts`
- `backoffice/backend/src/app.ts`
- `backoffice/backend/src/security/permissions.ts`
- `backoffice/backend/src/security/companiesPolicy.ts`
- `backoffice/frontend/src/router/index.ts`
- `backoffice/frontend/vite.config.ts`
- `deploy/recette/Caddyfile`
- `deploy/recette/Dockerfile.web`
- `backoffice/tests/backend/src/routes/_helpers/testApp.ts`
- `backoffice/tests/backend/setup/env.ts`