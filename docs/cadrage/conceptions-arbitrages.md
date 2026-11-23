# Conceptions de la V1 : sommaire et arbitrages

Les conceptions détaillent les lots du cadrage (`cadrage-v1.md` §5 et `cadrage-v1-interfaces.md`).
Chacune a été écrite seule, à partir du code de `main` du 23 novembre 2026. Ce document dit où
elles se recoupent et laquelle l'emporte. **En cas de désaccord, ce fichier prime sur les
conceptions.**

| Lots           | Conception                                                    | Issue |
| -------------- | ------------------------------------------------------------- | ----- |
| 1              | issue GitHub n° 129 (pilotage en direct)                      | #129  |
| 2, 6, 7, 8     | `conception-accueil-apres-partie-exploitation-contenu.md`     | #141  |
| 3, 4, extraits | `conception-formats-mini-jeux.md`                             | #143, #144 |
| 5              | `conception-spectacle-config-salle.md`                        | #145, #144 |
| 12             | `conception-console-editeur.md`                               | #141  |
| 13, 14         | `conception-sessions-api.md`                                  | #142  |

Rien de ce qui touche au matériel n'a été validé sur une vraie salle : les protocoles de banc des
conceptions restent à dérouler (`docs/recette/banc-materiel.md`).

## Arbitrages

1. **Limiteur de débit.** Un seul, écrit à la main, en mémoire :
   `backend/src/security/rateLimit.ts`. Pas de `@fastify/rate-limit` (la conception du lot 12 le
   proposait). Raison : trois lots en ont besoin, la logique tient en quelques dizaines de lignes,
   et le backend ne tourne qu'en une instance, comme le hub du direct.
2. **Socle public unique.** Les lots 2, 6, 12 et 14 créaient chacun `routes/public/index.ts`. Une
   seule PR pose le socle (issue #141) : limiteur, `trustProxy` réglé par `TRUST_PROXY`,
   conventions `/public/v1` (format d'erreur, CORS piloté par `VITRINE_ORIGINS`), nouvelles
   ressources de la matrice de permissions. La garde réseau de la console (12a) et les routes
   métier viennent ensuite.
3. **QR code.** Le générateur SVG (`qrSvg.ts`) sort du socle : il arrive avec la première route qui
   s'en sert (lot 2).
4. **Index unique des parties actives.** Le lot 2 scinde `games_room_id_active_unique` (une partie
   en attente et une partie en cours peuvent coexister dans une salle). Le lot 13 le laissait
   inchangé : le lot 2 l'emporte, dans sa propre migration.
5. **`playersCount`.** Le lot 13 ajoute la colonne `games.players_count` (effectif annoncé à la
   réservation). Le champ calculé du même nom prévu par l'historique (7a) est renommé
   `participantsCount`.
6. **Session programmée sans joueurs.** `participants: []` est accepté quand `scheduledAt` est
   fourni, avec ou sans inscription libre.
7. **Mini-jeu « don de points ».** Remplacé par « patate chaude » (doublon avec le vol de points).
   À confirmer : décision ouverte de la conception des formats.

## Horodatages de migration réservés

Plusieurs lots avancent en même temps. Chaque migration prend l'horodatage réservé ici, pour que
l'ordre d'application ne dépende pas de l'ordre des merges. Dernière migration avant cette vague :
`20261104060000_add_config_revision_to_rooms.js`.

| Horodatage         | Lot  | Migration                                              |
| ------------------ | ---- | ------------------------------------------------------ |
| `20261124000000`   | 13.0 | `add_game_scheduling`                                  |
| `20261124010000`   | P1   | `add_marketing_consent_to_game_participants`           |
| `2026112402xxxx`   | 2    | accueil des joueurs (demandes d'inscription, index)    |
| `2026112403xxxx`   | 6    | logo, bons                                             |
| `20261124040000`   | 7e   | `create_room_logs`                                     |
| `2026112405xxxx`   | 8    | import, option enfants, questions déjà jouées          |
| `20261124060000`   | 12   | double authentification                                |
| `20261124061000`   | 12   | `create_demo_requests`                                 |
| `2026112407xxxx`   | 14   | `create_public_booking_api`                            |
| `20261124080000`   | 3.3  | `add_format_to_games`                                  |
| `20261124090000`   | A.2  | `add_audio_effect_to_questions`                        |
| `20261124100000`   | 4.1  | mini-jeux de la V1.1 (contrainte CHECK)                |

Une migration qui dépend d'une autre prend un horodatage plus grand que celle dont elle dépend.

## Décisions qui restent ouvertes

Chaque conception se termine par ses questions. Tant qu'elles n'ont pas de réponse, le choix par
défaut écrit dans la conception est celui qui est développé ; il est repris dans la description de
la PR concernée.
