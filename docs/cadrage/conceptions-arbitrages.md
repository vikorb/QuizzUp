# Conceptions de la V1 : sommaire et arbitrages

Les conceptions détaillent les lots du cadrage (`cadrage-v1.md` §5 et `cadrage-v1-interfaces.md`).
Chacune a été écrite seule, à partir du code de `main` du 23 novembre 2026. Ce document dit où
elles se recoupent et laquelle l'emporte. **En cas de désaccord, ce fichier prime sur les
conceptions.**

| Lots                       | Conception                                                                | Issue   |
| -------------------------- | ------------------------------------------------------------------------- | ------- |
| 1                          | issue GitHub n° 129 (pilotage en direct)                                  | #129    |
| Socle public               | arbitrage 2 de ce fichier                                                 | #141    |
| 2, 6, 7, 8                 | `conception-accueil-apres-partie-exploitation-contenu.md`                 | à créer |
| 3                          | `conception-formats-mini-jeux.md`                                         | #143    |
| 4                          | `conception-formats-mini-jeux.md`                                         | à créer |
| Extraits transformés, voix | `conception-formats-mini-jeux.md`, `conception-spectacle-config-salle.md` | #144    |
| 5                          | `conception-spectacle-config-salle.md`                                    | #145    |
| 12                         | `conception-console-editeur.md`                                           | à créer |
| 13                         | `conception-sessions-api.md`                                              | #142    |
| 14                         | `conception-sessions-api.md`                                              | à créer |

Rien de ce qui touche au matériel n'a été validé sur une vraie salle : les protocoles de banc des
conceptions restent à dérouler (`docs/recette/banc-materiel.md`).

## Arbitrages

1. **Limiteur de débit.** Un seul, écrit à la main, en mémoire :
   `backend/src/security/rateLimit.ts`. Pas de `@fastify/rate-limit` (la conception du lot 12 le
   proposait). Raison : trois lots en ont besoin, la logique tient en quelques dizaines de lignes,
   et le backend ne tourne qu'en une instance, comme le hub du direct. Le code d'erreur d'un
   dépassement (429) est `too_many_requests`, partout.
2. **Socle public unique.** Les lots 2, 6, 12 et 14 créaient chacun le point d'entrée de
   `/public/v1` (`routes/public/index.ts`, ou `routes/public.ts` pour le lot 14). Une seule PR
   pose le socle (issue #141) : limiteur, `trustProxy` réglé par `TRUST_PROXY`, conventions
   `/public/v1` (format d'erreur, CORS piloté par `VITRINE_ORIGINS`), ressources `player`,
   `voucher`, `stats` et `roomLog` de la matrice de permissions. La garde réseau de la console
   (12a) et les routes métier viennent ensuite.
   - `TRUST_PROXY` : le socle applique dès le départ les règles de la conception de la console.
     `true` et `*` sont refusés ; la valeur est une liste d'adresses ou de plages. Sans elles,
     l'adresse du client est falsifiable.
   - Fichier du socle : `routes/public/index.ts` (dossier). Le lot 14 y ajoute ses routes, il ne
     crée pas `routes/public.ts`.
   - Permissions : les autres ressources (`apiKey`, `apiLog`, celles de la console) arrivent avec
     leur lot.
3. **QR code.** Le générateur SVG (`qrSvg.ts`) sort du socle : il arrive avec la première route qui
   s'en sert (lot 2).
4. **Index unique des parties actives.** Le lot 2 scinde `games_room_id_active_unique` (une partie
   en attente et une partie en cours peuvent coexister dans une salle). Le lot 13 le laissait
   inchangé : le lot 2 l'emporte, dans sa propre migration. Conséquence : `open` réussit pendant
   qu'une partie est `running` et ne répond `room_busy` que si une partie `pending` existe déjà
   dans la salle.
5. **`playersCount`.** Le lot 13 ajoute la colonne `games.players_count` (effectif annoncé à la
   réservation). Le champ calculé du même nom prévu par l'historique (7a) est renommé
   `participantsCount`.
6. **Session programmée sans joueurs.** `participants: []` est accepté quand `scheduledAt` est
   fourni, avec ou sans inscription libre.
7. **Mini-jeu « don de points ».** Remplacé par « patate chaude » (doublon avec le vol de points).
   À confirmer : décision ouverte de la conception des formats.
8. **CORS de `/public/v1`.** Les pages publiques pour téléphone (`/rejoindre/`, `/bon/`) sont
   servies par l'origine de l'application. `VITRINE_ORIGINS` est la liste de toutes les origines
   autorisées à appeler `/public/v1` : la vitrine et l'origine qui sert ces pages. Le test 12b
   devient : « une origine absente de la liste est refusée ». Les routes de `/public/v1` restent
   publiques : la liste limite les navigateurs, elle n'authentifie personne. Raison : ces pages
   appellent l'API depuis l'origine de l'application, qui serait sinon refusée.
9. **`GET /companies/:companyId/games`.** Un seul contrat : paramètres `state`, `roomId`, `from`,
   `to`, `limit`, `offset` ; réponse `{ games, total }` ; `limit` plafonné à 200 ; `from` et `to`
   filtrent `COALESCE(scheduled_at, started_at, created_at)`. Pas de plafond de période : la
   pagination borne déjà la réponse. Ordre : 7a pose le contrat, 13.3 n'ajoute que la colonne
   filtrée. Raison : les deux lots modifient le même handler.
10. **Fumée activable par l'API du personnel.** La route `PATCH /companies/:companyId/rooms/:id`
    refuse un `config` qui fait passer `lighting.smoke.enabled` de faux à vrai ou qui modifie les
    réglages de fumée (code `smoke_config_forbidden`). Seul le compte de salle, sur place et après
    le test de coupure, peut les enregistrer. Raison : la garde de l'écran de salle est un
    contrôle côté client, alors que l'API accepte un `config` libre. Tant que ce lot n'est pas
    livré, « ne peuvent plus activer la fumée » ne vaut que pour l'écran de salle.
11. **Plafond des éclairs.** 3 éclairs par seconde au plus, pour toutes les scènes (livrées,
    réglées par salle, boucles). Les scènes `buzz`, `answer-correct` et `victory` livrées le
    dépassent (environ 7 par seconde au buzz) : elles sont ralenties dans un lot à part. La
    décision ouverte n° 3 de la conception du lot 5 devient « relever le plafond au-dessus de 3
    par seconde ? », avec non pour réponse par défaut. Raison : 3 par seconde est le seuil usuel
    contre l'épilepsie photosensible.
12. **Fumée pendant la pause.** La coupure de la fumée à la mise en pause sort de RA5, sans
    dépendance à H2. Raison : la pause est déjà dans `main` (PR #131), donc un jet de fumée
    continue pendant la pause aujourd'hui, et la coupure n'a pas besoin du modèle de show.
13. **E-mails d'une session annulée.** À l'annulation d'une session programmée (backoffice ou API
    de réservation), les e-mails et les consentements de ses participants sont effacés tout de
    suite, avec un test. Raison : sinon ils restent 3 ans pour des joueurs qui n'ont jamais joué.
14. **Limiteur global des jetons invalides.** Supprimé. Seule la limite par adresse reste.
    Raison : un seul client pouvait saturer le compteur et bloquer l'accueil par QR de tous les
    centres.
15. **Format et `PATCH`.** Un `PATCH` du lot 13 qui change `roundsCount` ou `questionsPerRound`
    passe le format à `custom`. Raison : la règle 3.3 refuse des nombres accompagnant un autre
    format.
16. **`GET /room/games/current`.** Tout ce qui décrit la partie courante va dans `game` (`join`,
    `pendingRegistrationsCount`, `kidsMode`, `avoidQuestionIds`, `format`). `next` (prochaine
    session programmée) est au premier niveau, à côté de `game`. Raison : plusieurs lots modifient
    cette réponse, un emplacement fixe évite les conflits.
17. **Codes 401 de l'API à clé.** Ceux du lot 14 : `api_key_missing` et `api_key_invalid`.
    Raison : un seul texte pour les deux conceptions.
18. **Liste d'adresses de la console.** Une seule variable, `CONSOLE_ALLOWED_CIDRS`, séparée par
    des espaces (format attendu par Caddy) ; le backend accepte espaces et virgules. Raison :
    avec des virgules, Caddy refuserait de démarrer.

### Lots de sécurité à part

Trois lots partent tout de suite, sans attendre les autres lots :

1. Garde serveur sur la fumée : `smoke_config_forbidden` sur `PATCH /companies/:companyId/rooms/:id`
   (arbitrage 10).
2. Plafond des éclairs à 3 par seconde : ralentir `buzz`, `answer-correct` et `victory`
   (arbitrage 11).
3. Coupure de la fumée à la pause, sans dépendance à H2 (arbitrage 12).

## Horodatages de migration réservés

Plusieurs lots avancent en même temps. Chaque migration prend l'horodatage réservé ici, pour que
l'ordre d'application ne dépende pas de l'ordre des merges. Dernière migration avant cette vague :
`20261104060000_add_config_revision_to_rooms.js`.

| Horodatage       | Lot  | Migration                                           |
| ---------------- | ---- | --------------------------------------------------- |
| `20261124000000` | 13.0 | `add_game_scheduling`                               |
| `20261124010000` | P1   | `add_marketing_consent_to_game_participants`        |
| `2026112402xxxx` | 2    | accueil des joueurs (demandes d'inscription, index) |
| `20261124030000` | 6    | `add_logo_to_companies`                             |
| `20261124030100` | 6    | `create_vouchers`                                   |
| `20261124040000` | 7e   | `create_room_logs`                                  |
| `2026112405xxxx` | 8    | import, option enfants, questions déjà jouées       |
| `20261124060000` | 12   | double authentification                             |
| `20261124061000` | 12   | `create_demo_requests`                              |
| `2026112407xxxx` | 14   | `create_public_booking_api`                         |
| `20261124080000` | 3.3  | `add_format_to_games`                               |
| `20261124090000` | A.2  | `add_audio_effect_to_questions`                     |
| `20261124100000` | 4.1  | mini-jeux de la V1.1 (contrainte CHECK)             |

Une migration qui dépend d'une autre prend un horodatage plus grand que celle dont elle dépend.

## Décisions qui restent ouvertes

Chaque conception se termine par ses questions. Tant qu'elles n'ont pas de réponse, le choix par
défaut écrit dans la conception est celui qui est développé ; il est repris dans la description de
la PR concernée.
