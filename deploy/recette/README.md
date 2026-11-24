# Recette en ligne (VPS + HTTPS)

Met QuizzUP en ligne sur un petit serveur pour le tester **depuis le PC d'une vraie salle** :
backoffice, écran de salle et API en **HTTPS** (obligatoire pour piloter une interface USB DMX
depuis Chrome / Edge hors de `localhost`).

```
https://bo.<DOMAIN>      backoffice du centre (gérant, staff) : sans les écrans de l'éditeur
https://console.<DOMAIN> console de l'éditeur (superadmin) : filtrée par CONSOLE_ALLOWED_CIDRS
https://salle.<DOMAIN>   écran de salle (compte de salle)
https://api.<DOMAIN>     API (Swagger : /docs)
```

Le frontend du backoffice est construit **deux fois** (`build:centre`, `build:console`) : `bo.`
ne contient pas le code de la console, et `console.` appelle l'API sur son propre nom d'hôte
(chemin `/api`, même origine), donc sans passer par `api.<DOMAIN>`. Le superadmin se connecte sur
`console.<DOMAIN>`, depuis une adresse de `CONSOLE_ALLOWED_CIDRS` : ailleurs, la connexion est
coupée.

Caddy obtient et renouvelle seul les certificats Let's Encrypt. Pas besoin d'acheter un nom de
domaine : `sslip.io` transforme l'IP du serveur en domaine (`51-15-12-34.sslip.io`).

> **Avant de déployer : renseigner `CONSOLE_ALLOWED_CIDRS` dans `.env`.** Le compte superadmin
> (l'éditeur) ne peut se connecter que depuis les adresses de cette liste, et l'API refuse son
> jeton partout ailleurs. Variable vide ou absente : **aucun superadmin ne passe**, la console est
> fermée (le compte `admin` des seeds compris). Y mettre seulement l'adresse des postes des
> opérateurs, jamais le réseau Docker ni celle du serveur. Voir `.env.example`.

## Ce qu'il faut

- Un VPS Linux (Ubuntu 24.04 ou Debian 12), **2 Go de RAM minimum** (4 Go conseillés pour
  la construction des images), 20 Go de disque. Ex. Hetzner CX22, OVH VPS Starter/Value.
- Ports **80** et **443** ouverts (pare-feu du fournisseur).
- Un accès SSH.

## Installation (une fois)

```bash
# Sur le serveur
curl -fsSL https://get.docker.com | sh
git clone https://github.com/vikorb/QuizzUp.git && cd QuizzUp
cp deploy/recette/.env.example deploy/recette/.env
nano deploy/recette/.env          # DOMAIN, ACME_EMAIL, mots de passe et secrets
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env up -d --build
```

Premier démarrage : 3 à 6 minutes (construction des images, migrations, données de démo).
Comptes créés : voir `docs/recette/guide-de-test.md` ; leur mot de passe est `SEED_PASSWORD`.

## Mettre à jour

```bash
cd QuizzUp && git pull
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env up -d --build
```

Un `.env` créé avant l'ajout de `CONSOLE_ALLOWED_CIDRS` doit recevoir cette variable (voir plus
haut), sinon le superadmin est refusé. Le réseau Docker est fixé à `172.29.250.0/24` dans le
compose : `TRUST_PROXY` doit valoir ce sous-réseau, le compose n'a plus de valeur par défaut. Un
ancien `.env` avec `TRUST_PROXY=172.16.0.0/12` est à corriger en `172.29.250.0/24` : la plage de
confiance doit être celle du réseau de Caddy, pas plus large. Pour un autre sous-réseau, le changer
dans le compose et dans `.env` ; sans bonne valeur, l'API voit l'adresse de Caddy pour tous les
clients, les limites de débit deviennent communes à tout le monde et la console reste fermée.

Sur une recette déjà installée, le réseau Docker existe avec un autre sous-réseau : il faut le
recréer une fois (les volumes, donc les données, sont conservés), puis vérifier le résultat :

```bash
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env down
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env up -d --build
docker network ls                      # repérer le réseau de la recette
docker network inspect <réseau> --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Ne jamais ajouter `-v` à `down` : cela supprimerait la base et les extraits audio.

Les données (base, extraits audio, certificats) sont dans des volumes Docker : une mise à jour
ne les efface pas. Tous les seeds tournent au premier démarrage (base vide) ; ensuite seul le seed de démo
est rejoué, et il ne recrée jamais ce qui a été modifié ou supprimé au backoffice.

## Suivre / dépanner

```bash
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env ps
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env logs -f backend web
```

- **Certificat refusé** : vérifier que les ports 80/443 sont ouverts et que `DOMAIN` pointe bien
  sur l'IP du serveur (`ping bo.<DOMAIN>` ; idem pour `console.<DOMAIN>`).
- **Écran de salle « API injoignable »** : l'URL de l'API est figée à la construction de l'image
  `web` ; après un changement de `DOMAIN`, relancer avec `--build`.
- **Tout remettre à zéro** (efface base et extraits) : `… down -v` puis `… up -d --build`.

## Journaux et données personnelles

Avec `TRUST_PROXY` réglé, les journaux du backend contiennent l'adresse réelle des clients
(personnel et joueurs) : une donnée personnelle. Les garder 30 jours au plus.

## Limites de cette recette

- Pas de sauvegarde automatique de la base : c'est un environnement de test.
- Le backend tourne avec `tsx` (TypeScript à la volée), suffisant pour une recette.
- Le JWT et les mots de passe viennent de `.env` : ne jamais committer ce fichier.
- La documentation de l'API (Swagger, `https://api.<DOMAIN>/docs`) est publique.
