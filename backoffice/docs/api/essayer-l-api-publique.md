# Essayer l'API de réservation sur la compagnie de démonstration

Ce guide montre, avec `curl`, comment lister une salle, voir ses créneaux libres et réserver, sur
la compagnie « QuizzUP Démo » livrée avec la version de démonstration. Le contrat complet (champs,
codes d'erreur, limites) est dans [`public-v1.yaml`](public-v1.yaml) ; ce guide n'en montre que le
chemin le plus court.

Tout se passe en local : l'API répond sur `http://localhost:3001`, et aucune réservation n'est
envoyée hors de votre poste.

## 1. Préparer

1. Lancer la démonstration depuis la racine du dépôt : `npm run demo` (voir le
   [guide de test](../../../docs/recette/guide-de-test.md)).
2. La compagnie de démo contient « Salle 1 », réservable tous les jours de 10 h à 20 h (heure de
   Paris), en créneaux d'une heure, avec 4 pupitres ouverts à la réservation. Ces réglages sont
   posés à la création de la salle seulement : une salle de démo créée avant ce lot, ou dont les
   créneaux ont été désactivés, n'est pas modifiée (la liste `rooms` de l'étape 3 reste alors
   vide). Pour repartir d'une base neuve : `npm run demo:reset` **efface toutes les données de
   démo**, puis `npm run demo`.
3. **Aucune clé d'API n'est fournie** : une clé est un secret, elle se crée à la main (étape 2).

Pour la suite, gardez ces variables dans votre terminal (shell POSIX, par exemple Git Bash) :

```bash
API=http://localhost:3001
```

## 2. Créer une clé d'API

Le secret d'une clé n'est montré qu'une fois, à sa création. Les comptes de démo sont
`demo-admin` et son mot de passe `DEMO_SEED_PASSWORD` (`Demo1234!` par défaut, **en local
seulement**).

Se connecter. La réponse donne un `token` et `admin.company_id` :

```bash
curl -s -X POST "$API/login" \
  -H 'Content-Type: application/json' \
  -d '{ "identifier": "demo-admin", "password": "Demo1234!" }'
```

Créer la clé, avec ce `token` et ce `company_id` (`1` ci-dessous est un exemple) :

```bash
curl -s -X POST "$API/companies/1/api-keys" \
  -H 'Authorization: Bearer <token-du-backoffice>' \
  -H 'Content-Type: application/json' \
  -d '{ "name": "Essai en local" }'
```

La réponse porte `secret` : c'est la clé, au format `qzk_<8 caractères>_<secret>`. Copiez-la tout
de suite, elle ne sera plus affichée. Dans la suite, `<votre-cle>` désigne cette valeur, par exemple :

```bash
KEY=qzk_00000000_exemple-fictif-a-remplacer-par-votre-cle
```

La clé n'ouvre que `/public/v1` et que les salles de sa compagnie. Ne la mettez jamais dans un
navigateur ni dans une application distribuée, et ne la versionnez pas.

## 3. Lister les salles réservables

```bash
curl -s "$API/public/v1/rooms" -H "Authorization: Bearer $KEY"
```

Réponse `200` (l'`id` de votre salle peut différer) :

```json
{
  "rooms": [
    {
      "id": 1,
      "name": "Salle 1",
      "timezone": "Europe/Paris",
      "slotMinutes": 60,
      "breakMinutes": 0,
      "bookableDesks": 4,
      "maxPlayers": 8,
      "days": {
        "1": { "opensAt": "10:00", "closesAt": "20:00" },
        "2": { "opensAt": "10:00", "closesAt": "20:00" },
        "3": { "opensAt": "10:00", "closesAt": "20:00" },
        "4": { "opensAt": "10:00", "closesAt": "20:00" },
        "5": { "opensAt": "10:00", "closesAt": "20:00" },
        "6": { "opensAt": "10:00", "closesAt": "20:00" },
        "7": { "opensAt": "10:00", "closesAt": "20:00" }
      }
    }
  ]
}
```

Les clés de `days` vont de `"1"` (lundi) à `"7"` (dimanche). Sans clé valide : `401`
`{ "error": "api_key_missing" }` ou `{ "error": "api_key_invalid" }`.

## 4. Voir les créneaux libres d'un jour

`room` est l'identifiant de la salle, `date` un jour local de la salle (`AAAA-MM-JJ`), à partir de
la veille et dans l'année qui vient. Prenez une date future : les créneaux passés ne sont pas
proposés.

```bash
curl -s "$API/public/v1/availability?room=1&date=2027-03-10" \
  -H "Authorization: Bearer $KEY"
```

Réponse `200` (10 créneaux ; les 2 premiers sont montrés). `startsAt` est en UTC, `localTime` dans
le fuseau de la salle :

```json
{
  "roomId": 1,
  "date": "2027-03-10",
  "timezone": "Europe/Paris",
  "slots": [
    {
      "startsAt": "2027-03-10T09:00:00.000Z",
      "endsAt": "2027-03-10T10:00:00.000Z",
      "localTime": "10:00"
    },
    {
      "startsAt": "2027-03-10T10:00:00.000Z",
      "endsAt": "2027-03-10T11:00:00.000Z",
      "localTime": "11:00"
    }
  ]
}
```

Erreurs : `400 invalid_query` (paramètre manquant ou mal formé), `404 room_not_found` (salle d'une
autre compagnie, inactive ou non réservable), `422 date_out_of_range`.

## 5. Réserver un créneau

`startsAt` doit être **exactement** un `startsAt` renvoyé à l'étape 4. L'en-tête `Idempotency-Key`
est obligatoire : choisissez une valeur unique par réservation voulue (un numéro de commande ou un
UUID). `playersCount`, `locale`, `externalRef` et `participants` sont facultatifs.

```bash
curl -s -X POST "$API/public/v1/bookings" \
  -H "Authorization: Bearer $KEY" \
  -H 'Idempotency-Key: essai-2027-000001' \
  -H 'Content-Type: application/json' \
  -d '{
    "roomId": 1,
    "startsAt": "2027-03-10T09:00:00.000Z",
    "playersCount": 4,
    "locale": "fr",
    "externalRef": "RESA-ESSAI-000001",
    "participants": [{ "podium": 1, "displayName": "Camille" }]
  }'
```

Réponse `201` (les e-mails ne sont jamais renvoyés, seulement `hasEmail`) :

```json
{
  "booking": {
    "id": 128,
    "roomId": 1,
    "state": "scheduled",
    "startsAt": "2027-03-10T09:00:00.000Z",
    "endsAt": "2027-03-10T10:00:00.000Z",
    "playersCount": 4,
    "locale": "fr",
    "externalRef": "RESA-ESSAI-000001",
    "participants": [
      { "podium": 1, "displayName": "Camille", "hasEmail": false, "secondPlayer": null }
    ],
    "createdAt": "2026-11-24T18:00:00.000Z",
    "updatedAt": null
  }
}
```

Essayez ensuite :

- **Rejouer la même commande** (même `Idempotency-Key`, même corps) : `201` avec la même
  réservation et l'en-tête `Idempotent-Replayed: true`. Rien n'est créé en double.
- **Même clé, corps différent** : `422 idempotency_key_reused`.
- **Réserver le même créneau avec une autre `Idempotency-Key`** : `409 slot_taken`.
- **Un `startsAt` qui n'est pas dans la grille** (par exemple `2027-03-10T09:30:00.000Z`) :
  `422 slot_unavailable`.
- **Plus de joueurs que `maxPlayers`** : `422 too_many_players`.
- **Sans `Idempotency-Key`** : `400 idempotency_key_required`.

## 6. Lire, modifier, annuler

```bash
# Lire (404 booking_not_found si l'identifiant n'est pas une réservation de votre compagnie)
curl -s "$API/public/v1/bookings/128" -H "Authorization: Bearer $KEY"

# Modifier : au moins un champ, les champs absents sont gardés
curl -s -X PATCH "$API/public/v1/bookings/128" \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "playersCount": 6 }'

# Annuler : libère le créneau (200, état "cancelled")
curl -s -X DELETE "$API/public/v1/bookings/128" -H "Authorization: Bearer $KEY"
```

Une réservation que le centre a déjà ouverte ne se modifie plus (`409 booking_not_modifiable`) et
ne s'annule plus (`409 booking_not_cancellable`). La session réservée apparaît dans l'agenda du
backoffice (compte `demo-admin`), à l'heure de la salle.

## Aller plus loin

- Contrat complet : [`public-v1.yaml`](public-v1.yaml), servi aussi sans clé par
  `GET /public/v1/openapi.yaml`.
- Limite de débit : 120 requêtes par minute et par clé ; au-delà, `429 too_many_requests` avec
  `Retry-After`.
- Une clé se révoque par `DELETE $API/companies/<company_id>/api-keys/<id-de-la-clé>` (avec le
  jeton du backoffice de l'étape 2) ; la révocation est immédiate.
