# Recette en ligne (VPS + HTTPS)

Met QuizzUP en ligne sur un petit serveur pour le tester **depuis le PC d'une vraie salle** :
backoffice, écran de salle et API en **HTTPS** (obligatoire pour piloter une interface USB DMX
depuis Chrome / Edge hors de `localhost`).

```
https://bo.<DOMAIN>     backoffice (gérant, staff, superadmin)
https://salle.<DOMAIN>  écran de salle (compte de salle)
https://api.<DOMAIN>    API (Swagger : /docs)
```

Caddy obtient et renouvelle seul les certificats Let's Encrypt. Pas besoin d'acheter un nom de
domaine : `sslip.io` transforme l'IP du serveur en domaine (`51-15-12-34.sslip.io`).

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

Les données (base, extraits audio, certificats) sont dans des volumes Docker : une mise à jour
ne les efface pas. Tous les seeds tournent au premier démarrage (base vide) ; ensuite seul le seed de démo
est rejoué, et il ne recrée jamais ce qui a été modifié ou supprimé au backoffice.

## Suivre / dépanner

```bash
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env ps
docker compose -f deploy/recette/docker-compose.yml --env-file deploy/recette/.env logs -f backend web
```

- **Certificat refusé** : vérifier que les ports 80/443 sont ouverts et que `DOMAIN` pointe bien
  sur l'IP du serveur (`ping bo.<DOMAIN>`).
- **Écran de salle « API injoignable »** : l'URL de l'API est figée à la construction de l'image
  `web` ; après un changement de `DOMAIN`, relancer avec `--build`.
- **Tout remettre à zéro** (efface base et extraits) : `… down -v` puis `… up -d --build`.

## Limites de cette recette

- Pas de sauvegarde automatique de la base : c'est un environnement de test.
- Le backend tourne avec `tsx` (TypeScript à la volée), suffisant pour une recette.
- Le JWT et les mots de passe viennent de `.env` : ne jamais committer ce fichier.
- La documentation de l'API (Swagger, `https://api.<DOMAIN>/docs`) est publique.
