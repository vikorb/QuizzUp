Je conçois les lots 13 et 14 en m'appuyant sur le code de `main`. Le lot 1 y est encore en cours : seule la PR #130 est fusionnée, et le hub du direct n'est pas exposé hors de `routes/live.ts`.

**Recommandation en trois lignes.**
- Une session programmée reste une ligne de `games`. Elle reçoit deux nouveaux états, `scheduled` et `cancelled`, et un intervalle prévu `[scheduled_at, scheduled_end_at)`. Une contrainte d'exclusion PostgreSQL (`btree_gist`) interdit le chevauchement dans une salle.
- Rien ne démarre seul. Le passage `scheduled` → `pending` (« ouvrir ») est toujours fait par une personne, depuis l'agenda ou par le bouton « Lancer » de l'écran de salle. La suite ne change pas.
- L'API `/public/v1` est un mince adaptateur sur les mêmes fonctions : clé hachée en SHA-256, limite de débit en mémoire, idempotence par contrainte unique, journal sans corps de requête. Deux socles (migration, constantes et contrat) passent d'abord ; le reste se fait en parallèle sur des fichiers disjoints.

---

## 1. Modèle de données

### Socle A (lot 13) : migration `YYYYMMDDHHMMSS_add_game_scheduling.js`

**Nouvelles colonnes de `games`** (toutes facultatives) :

| Colonne | Type | Contrainte |
| --- | --- | --- |
| `scheduled_at` | timestamptz | — |
| `scheduled_end_at` | timestamptz | — |
| `cancelled_at` | timestamptz | — |
| `players_count` | smallint | `CHECK BETWEEN 1 AND 12`, soit 6 pupitres × 2 joueurs |
| `external_ref` | varchar(100) | — |
| `locale` | varchar(5) | `CHECK IN ('fr','en')` |

On stocke la fin plutôt qu'une durée, et c'est obligatoire. `timestamptz + interval` n'est pas immuable pour PostgreSQL, il ne peut donc pas servir dans une contrainte d'exclusion. `tstzrange(a, b)`, lui, est immuable.

**Contraintes :**
- `games_state_check` est remplacée par `state IN ('scheduled','pending','running','finished','aborted','cancelled')`. Le défaut reste `pending`.
- `games_schedule_range_check` : les deux bornes sont nulles ensemble, ou bien `scheduled_end_at > scheduled_at`.
- `games_scheduled_state_check` : `state <> 'scheduled' OR scheduled_at IS NOT NULL`.
- `games_cancelled_check` : `(state = 'cancelled') = (cancelled_at IS NOT NULL)`.

**Interdiction du chevauchement :**
- `CREATE EXTENSION IF NOT EXISTS btree_gist`. Elle sert à comparer `room_id` (bigint) avec `=` dans un index GiST.
- `ALTER TABLE games ADD CONSTRAINT games_room_schedule_no_overlap EXCLUDE USING gist (room_id WITH =, tstzrange(scheduled_at, scheduled_end_at, '[)') WITH &&) WHERE (scheduled_at IS NOT NULL AND status <> 2 AND state IN ('scheduled','pending','running'))`.

Ce que cela exige :
1. **Le rôle qui migre doit avoir le droit `CREATE` sur la base.** `btree_gist` est une extension « trusted » depuis PostgreSQL 13 ; la CI et Docker sont en version 16.
2. **Le filtre `scheduled_at IS NOT NULL` est indispensable.** `tstzrange(NULL, NULL)` donne un intervalle infini, qui chevaucherait tout.
3. **Les intervalles sont semi-ouverts `[)`.** Deux sessions bout à bout (10:00-11:00 puis 11:00-12:00) sont donc acceptées, ce qui permet une pause de 0.
4. **La violation renvoie le code SQLSTATE `23P01`, et non `23505`.** Il faut ajouter `isExclusionViolation` dans `routes/_shared/dbErrors.ts`.
5. **Les parties terminées, arrêtées ou annulées libèrent leur créneau**, et les parties immédiates (`scheduled_at` nul) ne sont pas concernées. L'index existant `games_room_id_active_unique` (une seule partie `pending`/`running` par salle) ne change pas, et c'est voulu : plusieurs sessions `scheduled` cohabitent dans une salle.

**Index :** `games_company_id_scheduled_at_index` sur `(company_id, scheduled_at) WHERE scheduled_at IS NOT NULL`, pour l'agenda. L'index GiST de la contrainte sert aux recherches de créneaux occupés.

**`down`** : il refuse avec un message clair s'il existe une ligne `scheduled` ou `cancelled`, ou une ligne avec `scheduled_at` renseigné. Sinon il supprime les contraintes et les colonnes, puis remet l'ancien `CHECK`. L'extension reste en place, et le `IF NOT EXISTS` permet de rejouer la migration.

**Statuts :** `status` (0/1/2) ne change pas de sens. Une session programmée est `status = 1`. Annuler n'est pas supprimer : on passe à `state = 'cancelled'` et `status` reste à 1.

### Réglages de créneaux : `rooms.schedule` (jsonb, nul par défaut)

Je tranche pour **une colonne dédiée, pas une section de `rooms.config`**. `config` appartient au PC de salle : il y écrit avec révision et fusion des clés, et le `PATCH` du backoffice l'écrase. Les créneaux appartiennent à l'admin. Les mélanger exposerait l'un à des 409 de révision et l'autre à un écrasement silencieux. Dix colonnes typées seraient rigides pour les horaires par jour.

- **Valeur nulle** : la salle n'a pas de créneaux et n'est pas réservable.
- **Forme** : `{ timezone, slotMinutes, breakMinutes, bookableDesks, publicBooking, days }`.
- **`days`** : les clés vont de `"1"` à `"7"` (jour ISO, 1 = lundi). Une clé absente veut dire jour fermé. Chaque jour vaut `{ opensAt, firstSessionAt?, closesAt }` au format `HH:MM` sur 24 h.
- **Validation (Zod, côté backend)** :
  - fuseau valide (`new Intl.DateTimeFormat('en', { timeZone })` ne lève pas d'erreur) ;
  - `slotMinutes` entre `SESSION_MIN_MINUTES` et `SESSION_MAX_MINUTES` ;
  - `breakMinutes` entre 0 et `SESSION_MAX_BREAK_MINUTES`, 0 par défaut ;
  - `bookableDesks` entre 1 et `GAME_PODIUMS` ; la valeur effective est `min(bookableDesks, getRoomDesksCount(config))` ;
  - `closesAt ≤ opensAt` veut dire « ferme le lendemain », avec 24 h d'ouverture au plus ;
  - `firstSessionAt` doit tomber dans la plage d'ouverture, et vaut `opensAt` s'il est absent ;
  - deux jours consécutifs ne doivent pas se chevaucher (une fermeture après minuit au-delà de l'ouverture du lendemain est refusée).
- **Fuseau** : il est porté par la salle, car une compagnie peut avoir plusieurs sites. Défaut `ROOM_DEFAULT_TIMEZONE = 'Europe/Paris'`. Tout est stocké en UTC (`timestamptz`) et l'affichage utilise `Intl.DateTimeFormat` avec le fuseau de la salle.

### Socle B (lot 14) : migration `YYYYMMDDHHMMSS_create_public_booking_api.js`

**`api_keys`** :
- colonnes : `id` bigIncrements, `company_id` (non nul, FK `companies`, RESTRICT), `name` varchar(100) non nul, `key_prefix` varchar(16) non nul et unique, `key_hash` char(64) non nul et unique, `created_by_admin_id` (FK `admins`, facultatif), `last_used_at`, `status` smallint défaut 1 avec `CHECK IN (1,2)`, `created_at`, `updated_at`, `deleted_at` ;
- la révocation suit la convention : `status = 2` et `deleted_at` renseigné, avec la même contrainte sur `deleted_at` que les autres tables ;
- index `(company_id, status)`.

**`api_idempotency_keys`** :
- colonnes : `id`, `company_id` (non nul, FK), `api_key_id` (non nul, FK), `idempotency_key` varchar(255) non nul, `request_hash` char(64) non nul, `game_id` (non nul, FK `games`), `created_at` ;
- unicité sur `(company_id, idempotency_key)` : la portée est la compagnie, pour qu'un nouvel essai fait après une rotation de clé soit encore dédupliqué ;
- index sur `created_at` pour la purge.

**`api_request_logs`** :
- colonnes : `id`, `company_id` (non nul, FK), `api_key_id` (non nul, FK), `method` varchar(8), `route` varchar(120) (le motif de route, jamais l'URL brute), `status_code` smallint, `error_code` varchar(80) facultatif, `game_id` (FK, facultatif), `duration_ms` integer, `idempotent_replay` boolean défaut false, `created_at` ;
- index `(company_id, created_at DESC, id DESC)` et index sur `created_at`.
- Le journal ne stocke ni adresse IP, ni corps, ni paramètres de requête.

**Changements dans `games`** :
- `api_key_id` (FK `api_keys`, facultatif) avec un index ;
- `admin_id` devient facultatif, avec `games_creator_check` : `admin_id IS NOT NULL OR api_key_id IS NOT NULL` ;
- le `down` refuse s'il existe une ligne avec `admin_id` nul.

### Constantes partagées (`backoffice/shared/src/index.ts`, socles uniquement)

- **Socle A** :
  - états : `GAME_STATE_SCHEDULED`, `GAME_STATE_CANCELLED` ; `GAME_STATES` dans l'ordre du `CHECK` ; `GAME_SLOT_STATES = [scheduled, pending, running]` ;
  - durées : `SESSION_DEFAULT_MINUTES` (60), `SESSION_MIN_MINUTES` (10), `SESSION_MAX_MINUTES` (240), `SESSION_MAX_BREAK_MINUTES` (120), `SESSION_OPEN_EARLY_MINUTES` (60), `SESSION_HORIZON_DAYS` (365), `SESSION_AGENDA_MAX_RANGE_DAYS` (31) ;
  - réservation : `GAME_MAX_PLAYERS` (= `GAME_PODIUMS × 2`), `GAME_LOCALES`, `GAME_EXTERNAL_REF_MAX_LENGTH` ;
  - salle : `ROOM_DEFAULT_TIMEZONE`, types `RoomSchedule` et `RoomScheduleDay` ;
  - direct : `LIVE_EVENT.SCHEDULE_CHANGED = 'schedule_changed'`.
- **Socle B** : `API_KEY_STATUS_ACTIVE`, `API_KEY_STATUS_REVOKED`, `API_KEY_STATUSES`, `API_KEY_TOKEN_PREFIX = 'qzk_'`, `API_KEY_MAX_ACTIVE` (10), `API_LOG_RETENTION_DAYS` (90), `API_IDEMPOTENCY_TTL_HOURS` (24).

---

## 2. Contrats d'API

Le format d'erreur reste celui d'aujourd'hui : `{ error: '<code>', details? }`. Les ids sont des nombres.

### Backoffice (lot 13)

Aucune nouvelle permission : on réutilise `GAME` et `ROOM`. Toutes les routes passent par `canAccessCompanyContext`.

**`POST /companies/:companyId/games`** (`game:create`, ouvert à user, admin et superadmin) :
- nouveaux champs facultatifs :
  - `scheduledAt` : date ISO 8601 avec décalage, à la minute près (secondes à 0) ;
  - `durationMinutes` : par défaut le `slotMinutes` de la salle, sinon `SESSION_DEFAULT_MINUTES` ;
  - `playersCount`, `externalRef`, `locale`.
- Avec `scheduledAt`, la partie est créée en `scheduled`, `participants` peut être vide (de 0 à 6) et le contrôle `room_busy` ne s'applique pas.
- Sans `scheduledAt`, rien ne change.
- Nouvelles erreurs : 400 `session_in_past` (fin ≤ maintenant), 400 `session_too_far`, 409 `slot_taken` (contrainte `23P01`).
- La création manuelle peut sortir de la grille des créneaux : le personnel décide. Seul le chevauchement est interdit.

**`GET /companies/:companyId/games?roomId=&from=&to=`** :
- les filtres sont facultatifs ; on filtre sur `COALESCE(scheduled_at, started_at, created_at)` ;
- erreur 400 `range_too_large` au-delà de 31 jours ;
- chaque ligne gagne `scheduledAt`, `scheduledEndAt`, `cancelledAt`, `playersCount`, `externalRef`, `locale`, puis `source` (`backoffice` ou `api`) avec le lot 14.

**`PATCH /companies/:companyId/games/:gameId`** (`game:update`) :
- uniquement en `scheduled` ;
- champs modifiables : `roomId`, `scheduledAt`, `durationMinutes`, `roundsCount`, `questionsPerRound`, `miniGames`, `playersCount`, `externalRef`, `locale`, et `participants` (remplacement complet dans une transaction) ;
- erreurs : 409 `game_not_scheduled`, 409 `slot_taken`, 400 `podium_not_in_room`.

**`POST /companies/:companyId/games/:gameId/cancel`** (`game:update`) :
- `scheduled` devient `cancelled`, avec `cancelled_at` renseigné ;
- refaire l'appel sur une session déjà annulée renvoie 200 ;
- sinon erreur 409 `game_not_scheduled`.

**`POST /companies/:companyId/games/:gameId/open`** (`game:update`) :
- `scheduled` devient `pending` ;
- erreurs : 409 `game_not_scheduled`, 409 `session_not_open_yet` (plus de 60 min avant le début), 409 `room_busy` (index unique existant), 409 `room_inactive`, 409 `company_inactive`.
- Il n'y a pas de borne de fin : une session non lancée, même après son créneau, peut toujours être ouverte.

**`POST .../abort`** ne change pas.

**`PUT /companies/:companyId/rooms/:roomId/schedule`** (`room:update`, admin et superadmin uniquement) :
- le corps vaut `{ schedule: RoomSchedule | null }` et la réponse `{ room }` ;
- erreurs : 400 `invalid_body` (avec détails), 404 `not_found`, 409 `company_deleted` ;
- `roomSelect` et `RoomRow` gagnent `schedule`, qui est donc relu par `GET /companies/:companyId/rooms*` et par `/room/me`.

**`GET /room/games/current`** renvoie désormais `{ game, next }`. `next` est la session `scheduled` la plus proche de la salle dont `scheduled_end_at > now`, au même format que `game` (noms seulement, aucun e-mail).

**`POST /room/games/:gameId/open`** (compte de salle, limité à sa salle) : mêmes règles et mêmes codes que la version backoffice, avec le même helper.

**Suppression d'une salle** : `abortRoomActiveGames` passe aussi ses sessions `scheduled` en `cancelled`.

### Backoffice (lot 14)

Nouvelles ressources dans la matrice : `apiKey` (list, create, delete) et `apiLog` (list), accordées à l'admin et au superadmin, pas au rôle `user`.

- **`GET /companies/:companyId/api-keys`** renvoie `{ apiKeys: [{ id, name, keyPrefix, status, createdAt, lastUsedAt, createdBy }] }`, jamais l'empreinte.
- **`POST /companies/:companyId/api-keys`** prend `{ name }` et renvoie 201 `{ apiKey, secret }`. Le secret n'est renvoyé qu'ici.
  - Erreurs : 409 `api_key_limit_reached`, 409 `company_inactive`, 409 `company_deleted`.
- **`DELETE /companies/:companyId/api-keys/:apiKeyId`** révoque la clé. L'appel est idempotent et renvoie 200 `{ apiKey }`, ou 404 `not_found`.
- **`GET /companies/:companyId/api-logs?apiKeyId=&statusClass=2xx|4xx|5xx&before=&limit=`** renvoie `{ logs, nextBefore }`.
  - `limit` vaut au plus 100 et la pagination se fait par curseur sur l'id.

### API publique `/public/v1`

**Authentification :**
- en-tête `Authorization: Bearer qzk_…`, avec un preHandler dédié ;
- un JWT n'ouvre jamais `/public`, et une clé n'ouvre jamais le backoffice ;
- erreurs : 401 `api_key_missing`, 401 `api_key_invalid` (même réponse pour une clé inconnue ou révoquée), 403 `company_inactive`.

**Limite de débit :**
- fenêtre fixe d'une minute, en mémoire ;
- par clé : `PUBLIC_API_RATE_LIMIT_PER_MINUTE`, 120 par défaut ;
- par IP pour les échecs d'authentification : `PUBLIC_API_AUTH_FAILURES_PER_MINUTE`, 20 par défaut ;
- dépassement : 429 `rate_limited` avec `Retry-After`, et en-têtes `RateLimit-Limit` et `RateLimit-Remaining` ;
- comme le hub du direct, cela suppose une seule instance.

Autres règles :
- corps limité à 16 Ko (413 `payload_too_large`) ;
- `trustProxy` réglé par `TRUST_PROXY`, sans quoi l'IP vue est celle de Caddy.

**Versionnement :**
- dans v1, on ne fait que des ajouts (champs facultatifs, nouveaux codes d'erreur) ;
- le client doit traiter un code inconnu de façon générique ;
- tout changement incompatible ouvre `/public/v2` à côté de v1.

**Routes :**

1. **`GET /public/v1/rooms`** renvoie les salles actives de la compagnie dont `schedule.publicBooking` vaut vrai : `{ rooms: [{ id, name, timezone, slotMinutes, breakMinutes, bookableDesks, maxPlayers, days }] }`.
2. **`GET /public/v1/availability?room=&date=YYYY-MM-DD`** renvoie `{ roomId, date, timezone, slots: [{ startsAt, endsAt, localTime }] }`.
   - `date` est une date locale de la salle.
   - Erreurs : 400 `invalid_query` ; 404 `room_not_found` (salle d'une autre compagnie, non réservable ou inactive) ; 422 `date_out_of_range` (avant la veille ou au-delà de l'horizon).
3. **`POST /public/v1/bookings`** exige l'en-tête `Idempotency-Key` (1 à 255 caractères ASCII visibles).
   - Corps : `{ roomId, startsAt, playersCount?, locale?, externalRef?, participants? }`. Les participants reprennent la forme du backoffice (`podium`, `displayName`, `email`, `emailConsent`, `secondPlayer`), avec `emailConsent: true` obligatoire pour tout e-mail.
   - Réponse : 201 `{ booking }`.
   - Erreurs : 400 `idempotency_key_required` ; 422 `idempotency_key_reused` (même clé, corps différent) ; 422 `slot_unavailable` (hors grille, jour fermé, passé ou trop loin) ; 409 `slot_taken` ; 422 `too_many_players` (pupitre au-delà de `bookableDesks`, ou `playersCount` au-delà de 2 × `bookableDesks`).
   - Le format de partie prend les valeurs par défaut ; le lot 3 ajoutera un format.
4. **`GET /public/v1/bookings/:id`**, **`PATCH /public/v1/bookings/:id`** (mêmes champs, `participants` remplace tout, autorisé seulement en `scheduled` sinon 409 `booking_not_modifiable`) et **`DELETE /public/v1/bookings/:id`** (passe en `cancelled`, idempotent, 409 `booking_not_cancellable` si la session est ouverte, en cours ou terminée).
   - Elles ne voient que les sessions de la compagnie créées par l'API (`api_key_id IS NOT NULL`), quelle que soit la clé.
   - Elles renvoient 404 `booking_not_found` aussi bien pour un id inexistant que pour un id d'une autre compagnie.
5. **`booking`** vaut `{ id, roomId, state, startsAt, endsAt, playersCount, locale, externalRef, participants: [{ podium, displayName, hasEmail, secondPlayer }], createdAt, updatedAt }`. Les e-mails ne sont jamais renvoyés.
6. **`GET /public/v1/openapi.yaml`** sert, sans authentification, le fichier `backoffice/docs/api/public-v1.yaml`, distinct de `openapi.yaml`.

**Idempotence :**
- dans une seule transaction, on insère d'abord la ligne `api_idempotency_keys` avec `request_hash` (SHA-256 du corps validé par Zod, sérialisé), puis la partie ;
- un second appel concurrent avec la même clé est bloqué par l'index unique jusqu'au commit du premier, reçoit une violation `23505`, puis relit la ligne et rejoue ;
- le rejeu renvoie 201, l'état **courant** de la réservation et l'en-tête `Idempotent-Replayed: true` ;
- une erreur annule toute la transaction et n'est donc jamais mémorisée ;
- la ligne est purgée après 24 h.

**Calcul des disponibilités** (fonction pure dans `backoffice/shared/src/schedule.ts`, utilisée par le backend et l'agenda) :

1. Le jour ISO de `date` se calcule sur la date du calendrier, sans fuseau. Pas d'entrée dans `days` : liste vide.
2. On convertit `opensAt`, `firstSessionAt` et `closesAt` en minutes depuis 00:00 heure locale du jour D. Si `closesAt ≤ opensAt`, on ajoute 1440 à `closesAt`. Si `firstSessionAt < opensAt`, on lui ajoute 1440.
3. Le pas vaut `slotMinutes + breakMinutes`. Avec une pause de 0, les créneaux sont bout à bout, ce que la contrainte `[)` accepte.
4. Pour `t = first` tant que `t + slotMinutes ≤ close` (contrôle en minutes d'horloge locale), on construit le début local `D + t`. Il peut tomber le lendemain : un créneau après minuit appartient au jour d'ouverture D.
5. On convertit ce début en UTC avec `zonedLocalToUtc(localDateTime, timezone)` :
   - on teste les deux décalages du fuseau, à `guess − 12 h` et `guess + 12 h`, où `guess` est l'heure locale lue comme si elle était en UTC ;
   - on garde les candidats dont le rendu local redonne exactement l'heure demandée ;
   - aucun candidat : l'heure n'existe pas (passage à l'heure d'été), le créneau est sauté ;
   - deux candidats : l'heure est ambiguë (retour à l'heure d'hiver), on garde le plus tôt.
   - La fin vaut le début plus `slotMinutes` minutes réelles.
6. On écarte un créneau si son début est ≤ maintenant, si son début dépasse maintenant + `SESSION_HORIZON_DAYS`, ou s'il chevauche une session occupée.
   - Les sessions occupées sont celles de la salle dont l'état est dans `GAME_SLOT_STATES`, avec `status <> 2` et un intervalle qui touche la journée. Une seule requête les récupère.
7. Une réservation n'est acceptée que si `startsAt` est exactement le début d'un créneau calculé à l'étape 5 pour cette date locale (sans le filtre « occupé » : c'est la base qui tranche avec `slot_taken`).

Cas limites couverts par les tests :
- Europe/Paris le 28 mars 2027 (le créneau 02:30 disparaît) et le 31 octobre 2027 (pas de chevauchement, un trou d'1 h) ;
- fermeture à 01:00 ;
- jour fermé ;
- pause de 0 ;
- dernier créneau qui ne tient pas avant la fermeture ;
- America/New_York.

Une partie immédiate en cours ne bloque pas un créneau proche. Cette limite est assumée : l'ouverture renverra `room_busy` tant que la partie ne sera pas finie.

---

## 3. Cycle de vie d'une session programmée

**Transitions :**
- `scheduled` → `pending` par **open** (personnel au backoffice, ou compte de salle) ;
- `pending` → `running` par **start** (salle, comme aujourd'hui) ;
- `running` → `finished` par **finish** ;
- `pending` ou `running` → `aborted` par **abort** (personnel) ;
- `scheduled` → `cancelled` par **cancel** (personnel) ou par **DELETE** de l'API.
- Une partie créée sans `scheduledAt` part directement en `pending`, comme aujourd'hui.

**Qui fait quoi :**
- user, admin et superadmin créent, modifient, annulent et ouvrent les sessions de leur compagnie ;
- l'API crée, modifie et annule seulement les réservations faites par l'API, et ne peut ni ouvrir ni arrêter ;
- le compte de salle ouvre seulement les sessions de sa salle.
- On ne modifie qu'en `scheduled`.

**Ce que voit l'écran de salle** (bloc `next`) :
- **Plus de 60 min avant le début** : « Prochaine session : jeu. 14:00 », avec les pupitres et les noms. Le bouton « Lancer » est désactivé, avec l'heure à partir de laquelle il sera possible.
- **De début − 60 min à la fin du créneau** : « Lancer » est actif. Il valide les joueurs en local (erreur `noPlayers` existante s'il n'y en a pas, sans rien changer en base), puis appelle `open`, puis le flux existant (contenu, préchargement, `start`). Après l'heure de début, l'écran affiche « en retard de N min ».
- **Après la fin du créneau** : la session disparaît de l'écran et reste visible dans l'agenda comme « non lancée ». Cet état se déduit, il n'est pas stocké. On peut encore l'ouvrir ou l'annuler depuis l'agenda.
- **Si une partie `pending` ou `running` existe** : elle reste prioritaire et `next` s'affiche en ligne secondaire (« Ensuite : 15:00 »).

**À l'heure dite, rien ne se passe en base.** Aucune tâche ne change d'état.

**Une session qui déborde** sur la suivante ne pose aucun problème en base, puisque seuls les intervalles prévus sont contraints. L'ouverture de la session suivante répond `room_busy` jusqu'à la fin de la partie en cours.

**Flux en direct :**
- chaque création, modification, annulation ou ouverture (backoffice, salle, API) émet `schedule_changed` `{ roomId }` vers les flux du personnel de la compagnie et vers le flux de la salle ;
- les clients relisent alors l'agenda ou `/room/games/current` ;
- la présence (`room_status`) existante sert d'en-tête de colonne dans l'agenda : en ligne, en partie, hors ligne.
- Il faut que le lot 1 expose le hub. Il est aujourd'hui créé à l'intérieur de `liveRoutes` ; il faudra par exemple `app.decorate('liveHub')`, très probablement dans la PR « 2 fin du polling ». En attendant, l'agenda se recharge après chaque action et au retour du focus, et la salle relit `current` comme elle le fait déjà.

---

## 4. Écrans

**Agenda (nouvelle route `/agenda`, lien dans `NavbarView`, accessible au rôle `user`)** :
- **En-tête** : choix de la salle (`SelectField`), date (`<input type="date">` natif), boutons jour précédent et jour suivant, présence de la salle.
- **Corps** : une liste chronologique, pas une grille de calendrier.
  - Les créneaux de la grille (calculés par la fonction partagée) apparaissent libres avec une action « Programmer ».
  - Les sessions affichent l'heure locale de la salle, les noms ou le nombre de joueurs, la référence externe, la source (backoffice ou API) et un `StatusPill` d'état (`scheduled`, `pending`, « non lancée »…). Actions : Modifier, Annuler (`ConfirmModal`), Ouvrir (seulement si c'est autorisé).
  - Les sessions hors grille et les parties immédiates du jour s'intercalent à leur heure.
- **États** :
  - chargement : texte d'état ;
  - erreur : code traduit et bouton Réessayer ;
  - vide : « Aucun créneau ce jour : salle fermée ou créneaux non réglés », avec un lien vers les réglages pour l'admin.
- **Composants réutilisés** : `SectionLayout`, `BaseToolBar`, `SelectField`, `StatusPill`, `UiButton`, `ConfirmModal`, `BaseBanner`, et `utils/game/state.ts` (tonalités).

**Programmer ou modifier** : on réutilise `CreateGameView` et `CreateGameForm`.
- Une case « Programmer pour plus tard » fait apparaître date et heure (`<input type="time">`), interprétées dans le fuseau de la salle avec `zonedLocalToUtc`, plus la durée, le nombre de joueurs et la référence.
- Les participants deviennent facultatifs pour une session programmée.
- Préremplissage par `?roomId=&scheduledAt=` depuis l'agenda.
- Mode édition sur `games/:gameId/edit`, seulement en `scheduled`. L'erreur `slot_taken` s'affiche près du champ date.

**Réglages de créneaux (admin)** :
- nouvelle action « Créneaux » dans `RoomTableActions`, qui ouvre un panneau `RoomSchedulePanel` sur le modèle de `RoomAccountPanel`, dans `ClientDetailRoomsSection` ;
- champs :
  - fuseau (`SelectField` rempli par `Intl.supportedValuesOf('timeZone')`) ;
  - durée du créneau, pause (0 par défaut), pupitres ouverts à la réservation, réservation publique (`SwitchField`) ;
  - sept lignes de jours : interrupteur « fermé » et trois `<input type="time">` ;
- **aperçu en direct** : « Lundi : 10:30, 11:30… », calculé par la fonction partagée. C'est le meilleur contrôle pour l'admin ;
- un bouton « Désactiver les créneaux » met la valeur à nul ;
- erreurs : `invalid_body` détaillé par champ.

**Clés d'API et journal (admin, nouvelle section de `ClientDetailsView`)** :
- **Tableau des clés** (`BaseTable`) : nom, préfixe, création, dernière utilisation, statut. Une seule action primaire : « Créer une clé ».
  - La création ouvre une fenêtre qui affiche le secret une seule fois, avec un bouton Copier (`navigator.clipboard`) et l'avertissement « ne sera plus affichée ».
  - La révocation passe par `ConfirmModal`.
- **Journal** : tableau des 100 derniers appels (date, clé, méthode, route, statut, code d'erreur traduit sinon affiché brut, lien vers la session), filtres par clé et par classe de statut, bouton « Plus ancien ».
- **États** : vide (« Aucune clé » ou « Aucun appel »), chargement, erreur.

**Écran de salle (`StaffGameLobby`)** :
- le bloc `next` décrit au §3 est intégré à l'état `waiting` actuel ;
- `fetchCurrentGame` renvoie `{ game, next }`, et une nouvelle fonction `openRoomGame` est ajoutée ;
- l'heure s'affiche dans le fuseau de la salle, lu depuis `/room/me`, et non celui du PC ;
- le clavier seul suffit, puisque « Lancer » est le bouton actuel ;
- pas de minuterie nouvelle hors du cycle de vie déjà nettoyé au démontage.

---

## 5. Décisions ouvertes (§11, points 2, 3 et 6)

**Point 2 : session non lancée à l'heure.**
- **Recommandation** : elle reste jusqu'à une action du personnel. Une annulation automatique priverait de sa session un groupe arrivé en retard, et ne libère rien d'utile, puisque le créneau est déjà passé.
- **Défaut implémenté** : aucune tâche ; l'état « non lancée » est déduit et affiché dans l'agenda.
- **Changer d'avis** coûte une requête `UPDATE … SET state='cancelled'` ajoutée à l'ordonnanceur existant, plus une constante de délai.

**Point 3 : réserver sans les e-mails.**
- **Recommandation** : oui, les joueurs sont facultatifs. L'inscription par QR (lot 2) ou par le personnel les complète, et on ne collecte que ce qui sert.
- **Défaut implémenté** : `participants` et `playersCount` facultatifs. Une session sans joueur s'ouvre, mais ne se lance pas (`noPlayers`).
- **Changer d'avis** : `min(1)` dans le schéma Zod.

**Point 6 : prénoms et e-mails reçus par l'API.**
- **Recommandation** : les accepter, avec les mêmes règles que le backoffice : `emailConsent: true` attesté par le centre, masquage pour `user`, purge à 3 ans, e-mails jamais renvoyés. C'est le même traitement par le même responsable (le centre), par un autre canal.
- **Défaut implémenté** : c'est ce comportement. La mise en production des clés attend de toute façon l'accord de sous-traitance (lot 10).
- **Changer d'avis** : le schéma refuse `email` (422 `emails_not_accepted`), en une ligne.

---

## 6. Données personnelles et sécurité

**E-mails :**
- stockés dans `game_participants`, comme aujourd'hui ;
- la purge existante les couvre sans modification : la date de dernière partie vaut `COALESCE(finished_at, started_at, created_at)`. Pour une session future, `created_at` est plus tôt, donc la purge est plus prudente ;
- un test doit le prouver sur une réservation venue de l'API ;
- `maskPlayerEmails` s'applique aux sessions de l'agenda ;
- l'API ne renvoie que `hasEmail` ;
- aucune table nouvelle ne contient d'e-mail : l'idempotence ne garde qu'une empreinte, le journal ne garde aucun corps.

**Journaux :**
- `api_request_logs` est conservé 90 jours et `api_idempotency_keys` 24 h, purgés par le même ordonnanceur que la purge RGPD ;
- pino ne journalise ni les en-têtes ni les corps par défaut, et il ne faut pas en ajouter ;
- les détails d'erreur Zod partent au client, jamais dans les logs.

**Clés :**
- format `qzk_` + 8 caractères de préfixe + `_` + 32 octets aléatoires en base64url ;
- on stocke le SHA-256 du jeton entier. Pas de bcrypt : avec 256 bits d'entropie, le hachage lent n'apporte rien et coûterait à chaque appel ;
- la recherche se fait par l'index unique de l'empreinte ;
- la clé est relue en base à chaque appel, donc une révocation est immédiate ;
- `last_used_at` est mis à jour au plus une fois par minute ;
- les échecs d'authentification sont limités par IP (`TRUST_PROXY` est nécessaire) ;
- le secret n'est montré qu'une fois ;
- le préfixe `qzk_` permet une règle de détection de secrets dans le code ;
- **à documenter : la clé ne doit jamais être mise dans un navigateur.** Le CORS global n'autorise pas l'en-tête `Idempotency-Key`, ce qui empêche déjà un POST depuis une page.

**Énumération :**
- tout est filtré par la compagnie de la clé ;
- la réponse est 404 identique pour un id inexistant ou étranger ;
- pas de 403 qui révélerait l'existence d'une ressource ;
- la limite de débit s'applique ;
- les ids séquentiels restent acceptables dans ces conditions.

**Rejeu :**
- TLS par Caddy ;
- un POST rejoué avec la même clé d'idempotence ne crée rien ;
- PATCH et DELETE sont idempotents par nature ;
- le vrai risque est une clé volée. Les parades sont la révocation et le journal consultable.

---

## 7. Découpage en lots de développement

**Socle A (13.0, S, à fusionner en premier).**
- Contenu :
  - la migration du lot 13 et `db.dbml` ;
  - les constantes et types partagés du lot 13 ;
  - le test de contrat `tests/backend/src/db/gameSchema.test.ts`, à adapter pour lire le `CHECK` de la nouvelle migration (aujourd'hui il lit celui de 2026-11-03) ;
  - le test `*.pg.test.ts` de la contrainte : chevauchement refusé, sessions bout à bout acceptées, session annulée qui libère son créneau, `scheduled_at` nul ignoré ;
  - les libellés i18n `games.state.scheduled` et `games.state.cancelled` ;
  - **tous les codes d'erreur du lot 13** dans `locales/{fr,en}/index.json` ;
  - le **contrat OpenAPI** des routes du lot 13 dans `openapi.yaml`.
- Les codes d'erreur et le contrat sont posés à l'avance pour que les PR suivantes ne touchent plus ces fichiers sensibles.

**Vague 1, en parallèle après 13.0 (fichiers disjoints) :**
- **13.1 Créneaux, fonction pure (S).**
  - Fichiers : `shared/src/schedule.ts` et une ligne d'export dans `index.ts`.
  - Tests : `tests/backend/src/shared/schedule.test.ts` (changements d'heure, minuit, jour fermé, pause de 0, heure inexistante ou ambiguë).
  - Exclu : toute route.
- **13.2 Réglages de salle, backend (S).**
  - Fichiers : `routes/companies/rooms/idSchedule.ts`, `_schemas.ts` (`roomScheduleSchema`), `_shared.ts` (`roomSelect`), une ligne dans `companies.ts`, `types/room.ts`.
  - Tests : admin OK, `user` 403, admin A sur la compagnie B 403, fuseau invalide, jours qui se chevauchent, valeur nulle.
- **13.3 Sessions, backend (M).**
  - Fichiers : `games/_schemas.ts`, `games/_shared.ts` (extraction de `insertGameWithParticipants` et `openScheduledGame`, `gameSelect`, `toGameRow`), `games.ts`, `games/id.ts` (PATCH), nouveaux `games/idOpen.ts` et `games/idCancel.ts`, `_shared/dbErrors.ts`, `rooms/_account.ts` (annulation des sessions à la suppression d'une salle), `types/game.ts`.
  - Tests : chaque route (succès, entrée invalide, non connecté, A/B), mise en correspondance `23P01` → `slot_taken`.
  - Test pg : deux créations concurrentes, une seule passe.

**Vague 2 :**
- **13.4 Routes de salle (S, après 13.3).** Fichier `room.ts` (`next`, `open`). Tests dans `room.test.ts`, dont une salle qui ne voit ni n'ouvre la session d'une autre salle.
- **13.5 Agenda, frontend (M, après 13.1).**
  - Fichiers : `views/AgendaView.vue`, `views/agenda/**`, route et lien dans `NavbarView`, toutes les fonctions de `gamesService.ts` et `types/game.ts` liées aux sessions, `locales/*/agenda.json` (chargé par le glob, sans modifier `index.json`).
  - Tests : les trois états, les actions, et l'affichage dans le fuseau de la salle avec une horloge simulée.
- **13.7 Réglages, frontend (S, après 13.1).**
  - Fichiers : `views/clients/rooms/RoomSchedulePanel.vue`, `RoomTableActions.vue`, `ClientDetailRoomsSection.vue`, `roomsService.ts`, `types/room.ts` (frontend), `locales/*/room.json`.
- **14.0 Socle B (S, après 13.3, qui doit être fusionné).**
  - Contenu :
    - la migration du lot 14 et `db.dbml` ;
    - les constantes partagées ;
    - les ressources `apiKey` et `apiLog` dans `permissions.ts` ;
    - `src/security/apiKeys.ts` (génération et empreinte, une quinzaine de lignes) ;
    - la correction `adminId` facultatif dans `toGameRow` (aujourd'hui `Number(null)` donnerait 0) ;
    - `public-v1.yaml` complet (contrat d'abord) ;
    - les codes d'erreur du lot 14 dans `index.json`.

**Vague 3 :**
- **13.6 Formulaire de programmation et édition (S-M, après 13.5).** Fichiers `views/games/creation/**`, `CreateGameView.vue`, route d'édition, `locales/*/games.json`.
- **13.8 Écran de salle (S, après 13.4 et après la PR « 2 fin du polling » du lot 1**, qui modifie aussi `StaffGameLobby.vue**)**.
  - Fichiers : `StaffGameLobby.vue`, `utils/roomApi.ts`, locales de room-app.
  - Tests room-app ; scénario Playwright dans `game/e2e` (session programmée affichée, puis « Lancer », puis jeu) ; seuils de couverture de room-app.
- **14.1 Clés et journal, backend (M).**
  - Fichiers : `routes/companies/apiKeys/**`, `routes/companies/apiLogs.ts`, une ligne dans `companies.ts`, purge du journal et de l'idempotence branchée dans `server.ts`.
  - Tests : A/B, `user` 403, secret renvoyé une seule fois, empreinte jamais renvoyée, limite de 10 clés, purge.
- **14.2 Socle public : authentification, débit, journal, salles et disponibilités (M, après 14.0 et 13.1).**
  - Fichiers : `src/plugins/publicApi.ts`, `src/security/rateLimit.ts`, `routes/public.ts`, `routes/public/rooms.ts`, `routes/public/availability.ts`, une ligne dans `routes/index.ts`, `trustProxy` dans `app.ts`, `.env.example` (`PUBLIC_API_RATE_LIMIT_PER_MINUTE`, `PUBLIC_API_AUTH_FAILURES_PER_MINUTE`, `TRUST_PROXY`).
  - Tests : 401 et 429 avec horloge simulée, clé révoquée, compagnie inactive, une clé A qui ne voit pas les salles de B, journal écrit sans corps.

**Vague 4 :**
- **14.4 Réservations (M, après 14.2).**
  - Fichiers : `routes/public/bookings.ts`, une ligne dans `routes/public.ts`.
  - Tests : idempotence (rejeu, corps différent), créneau hors grille, `slot_taken`, A/B, réservation d'une compagnie invisible pour l'autre, e-mails jamais renvoyés, purge d'une réservation venue de l'API.
  - Tests pg : deux POST concurrents avec la même clé d'idempotence donnent une seule session ; deux POST sur le même créneau donnent un 201 et un 409.
- **14.6 Clés et journal, frontend (M, après le contrat de 14.1).** Fichiers `views/clients/details/apiKeys/**`, `ClientDetailsView.vue`, `apiKeysService.ts`, `types/apiKey.ts`, `locales/*/apiKeys.json`.
- **13.9 Événement `schedule_changed` (S, après le lot 1 PR 2, 13.3 et 13.5).** Émission dans les routes concernées (et dans `bookings.ts` s'il est déjà fusionné), écoute dans l'agenda et dans la salle.
- **14.7 Bac à sable (S, après 14.4).** Créneaux de la salle de démonstration dans `quizz_content_demo_room.js` et guide « essayer l'API » avec un appel d'exemple. Aucune clé dans le seed.

**Parallélisme maximal :**
- 13.1, 13.2 et 13.3 en même temps ;
- puis 13.4, 13.5, 13.7 et 14.0 ;
- puis 13.6, 13.8, 14.1 et 14.2 ;
- puis 14.4, 14.6 et 13.9.

`openapi.yaml` est écrit dans le socle A. Une PR qui s'en écarte modifie seulement sa propre section, et le conflit reste local.

---

## 8. Risques et points à valider

**Ce qui peut casser l'existant :**
- Les écrans qui supposent quatre états : `GamesView` (statistiques), `GamesToolbar` (options suivant `GAME_STATES`, test inclus) et `getGameStateTone`.
- Le test de contrat du schéma.
- `toGameRow` lorsque `adminId` devient nul.
- `participants.min(1)`, qui ne doit être assoupli qu'avec `scheduledAt`.
- `abortRoomActiveGames`.
- `roomSelect` qui gagne `schedule` : OpenAPI et tests de `/room/me` à mettre à jour.
- Le `mockDb` n'applique ni contrainte ni valeur par défaut : le chevauchement **doit** être testé en `*.pg.test.ts`.

**À essayer sur un vrai PostgreSQL :**
- création de `btree_gist` avec le rôle de production (droit `CREATE`) ;
- `down` puis `up` dans la CI ;
- remontée du code `23P01` à travers Knex ;
- concurrence des réservations et de l'idempotence (deux connexions) ;
- utilisation des index par l'agenda ;
- purge sur des sessions futures.

**Environnement :**
- ICU complet dans `node:22-alpine` : vérifier `Intl.supportedValuesOf('timeZone')` et `Europe/Paris` dans le conteneur ;
- `TRUST_PROXY` derrière Caddy, à régler avec le lot 12, qui a le même besoin ;
- limite de débit et hub en mémoire : une seule instance du backend, à écrire dans `REPRISE.md`.

**Banc et poste kiosque** (seul 13.8 est concerné) :
- la prochaine session reste affichée plusieurs heures sans fuite ;
- « Lancer » depuis `next` avec de vrais buzzers et le son ;
- l'heure est affichée dans le fuseau de la salle même si Windows est réglé autrement.

---

**Questions fermées pour Enzo ou Victoria :**
1. Une session non lancée reste-t-elle jusqu'à une action du personnel, sans annulation automatique ? Oui ou non.
2. Peut-on réserver par l'API sans aucun joueur ? Oui ou non.
3. L'API accepte-t-elle prénoms et e-mails, avec un consentement attesté par le centre ? Oui ou non.
4. Le bouton « Lancer » de l'écran de salle peut-il ouvrir une session programmée créée au backoffice ou par l'API ? Cela ne contredit pas la décision du 4 novembre selon laquelle seul le backoffice inscrit les joueurs. Oui ou non.
5. Le choix des thèmes à la programmation, cité au §5 du cadrage, reste-t-il hors du lot 13 ? Le modèle actuel ne stocke pas de thèmes par partie. Oui ou non.
6. Garde-t-on le journal des appels 90 jours ? Oui ou non.

**Fichiers principaux lus :**
- `backoffice/backend/db/migrations/20261103220200_create_games_tables.js`
- `backoffice/backend/src/routes/games.ts`
- `backoffice/backend/src/routes/games/_shared.ts`
- `backoffice/backend/src/routes/room.ts`
- `backoffice/backend/src/routes/companies/rooms/_account.ts`
- `backoffice/backend/src/live/hub.ts`
- `backoffice/backend/src/security/permissions.ts`
- `backoffice/backend/src/jobs/purgePlayerEmails.ts`
- `backoffice/tests/backend/src/db/gameSchema.test.ts`
- `game/room-app/src/views/lobby/StaffGameLobby.vue`