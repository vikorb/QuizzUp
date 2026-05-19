# QuizzUp Backoffice

Backoffice d'administration du projet QuizzUp.

Ce projet permet de gérer les fonctionnalités d'administration principales de l'application, notamment l'authentification, les compagnies et les comptes administrateurs associés.

## Fonctionnalités disponibles

### Authentification

- Connexion administrateur
- Génération de token JWT
- Récupération de l'utilisateur connecté
- Déconnexion
- Gestion des sessions administrateur

US liées :

- us-auth-01
- us-auth-02
- us-auth-03

### Gestion des compagnies

- Liste des compagnies
- Création d'une compagnie
- Consultation d'une compagnie
- Modification d'une compagnie
- Activation / désactivation
- Suppression logique

US liées :

- us-company-01
- us-company-02
- us-company-03
- us-company-04

### Gestion des comptes

- Liste des comptes d'une compagnie
- Création d'un compte
- Consultation d'un compte
- Modification d'un compte
- Activation / désactivation
- Suppression logique

US liées :

- us-account-01
- us-account-02
- us-account-03

### Documentation

- Documentation Swagger / OpenAPI
- Schéma de base de données DBML
- Schémas d'architecture Mermaid
- Fichiers `.env.example`
- Guide de contribution
- Changelog
- Préparation de l'espace de tests

US liées :

- us-doc-01
- us-db-01
- us-arch-01
- us-config-01
- us-test-01

## Stack technique

### Backend

- Node.js
- Fastify
- TypeScript
- Knex
- PostgreSQL
- JWT
- Swagger / OpenAPI

### Frontend

- Vue 3
- Vite
- TypeScript
- Vue Router
- Vue i18n

### Shared

Un package `shared` permet de partager certaines constantes et certains types entre le backend et le frontend.

Exemples :

- statuts des compagnies
- statuts des admins
- types communs

### Tests

Les tests sont préparés à la racine du projet avec Vitest.

- tests backend : `tests/backend`
- tests frontend : `tests/frontend`

## Structure du projet

```txt
backoffice/
├─ backend/
├─ frontend/
├─ shared/
├─ docs/
│  ├─ api/
│  │  └─ openapi.yaml
│  ├─ db/
│  │  └─ quizzup.dbml
│  └─ architecture/
│     └─ architecture.md
├─ tests/
│  ├─ backend/
│  └─ frontend/
├─ docker-compose.yml
├─ package.json
├─ CONTRIBUTING.md
├─ CHANGELOG.md
└─ README.md
```

## Prérequis

- Docker
- Docker Compose
- Node.js
- npm

## Configuration

Des fichiers d'exemple sont disponibles pour les variables d'environnement :

```txt
backend/.env.example
frontend/.env.example
```

Créer les fichiers `.env` à partir des exemples :

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### Backend

Exemple de variables backend :

```env
DATABASE_URL=postgresql://quizzup:quizzup@localhost:5434/quizzup_backoffice
QUIZZUP_COMPANY_EMAIL=billing@quizzup.local
ADMIN_SEED_EMAIL=admin@quizzup.local
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=ChangeMe123!
API_PORT=3001
CORS_ORIGIN=http://localhost:4173
JWT_SECRET=change_me_super_secret
JWT_EXPIRES_IN=2h
```

### Frontend

Exemple de variable frontend :

```env
VITE_API_URL=http://localhost:3001
```

## Quick start avec Docker

Depuis la racine du projet `backoffice/` :

```bash
docker compose up --build
```

Le backend sera disponible ici :

```txt
http://localhost:3001
```

Le frontend sera disponible ici :

```txt
http://localhost:4173
```

La documentation Swagger sera disponible ici :

```txt
http://localhost:3001/docs
```

## Commandes utiles

### Lancer le projet

```bash
docker compose up --build
```

### Arrêter le projet

```bash
docker compose down
```

### Voir les logs backend

```bash
docker compose logs -f backend
```

### Voir les logs frontend

```bash
docker compose logs -f frontend
```

### Relancer uniquement le backend

```bash
docker compose restart backend
```

### Relancer uniquement le frontend

```bash
docker compose restart frontend
```

## Base de données

La base de données utilisée est PostgreSQL.

Les migrations et seeds sont lancés au démarrage du backend via Docker Compose.

Les statuts sont harmonisés dans le projet :

```txt
0 = inactif
1 = actif
2 = supprimé
```

Les suppressions sont des suppressions logiques : l'entité passe au statut `2` et le champ `deleted_at` est renseigné.

Le schéma documentaire de la base est disponible ici :

```txt
docs/db/quizzup.dbml
```

Il peut être importé dans dbdiagram.io.

## Documentation API

La documentation OpenAPI est disponible ici :

```txt
docs/api/openapi.yaml
```

Elle est servie par Swagger UI à cette adresse :

```txt
http://localhost:3001/docs
```

Chaque route possède un statut de disponibilité :

```yaml
x-availability: disponible
```

ou :

```yaml
x-availability: non_disponible
```

Cela permet de distinguer les routes déjà implémentées des routes prévues.

## Architecture

La documentation d'architecture est disponible ici :

```txt
docs/architecture/architecture.md
```

Elle contient notamment :

- le schéma global du projet
- l'architecture backend
- l'architecture frontend
- le flux d'authentification
- le flux d'accès à une route protégée
- l'organisation documentaire

## Tests

Les tests sont centralisés à la racine du projet.

Structure prévue :

```txt
tests/
├─ backend/
└─ frontend/
```

Lancement de tous les tests :

```bash
npm run test
```

Lancement des tests backend :

```bash
npm run test:backend
```

Lancement des tests frontend :

```bash
npm run test:frontend
```

Lancement avec couverture :

```bash
npm run test:coverage
```

Avec Docker :

```bash
docker compose run --rm tests
```

## Contribution

Les règles de contribution sont disponibles dans :

```txt
CONTRIBUTING.md
```

Ce fichier décrit notamment :

- les conventions de branches
- les conventions de commits
- les règles backend
- les règles frontend
- les règles de documentation
- la checklist avant merge

## Changelog

L'historique des modifications est disponible dans :

```txt
CHANGELOG.md
```

## Routes principales disponibles

### Health

```txt
GET /health
```

### Auth

```txt
POST /login
POST /logout
GET /me
```

### Companies

```txt
GET /companies
POST /companies
GET /companies/{id}
PATCH /companies/{id}
PATCH /companies/{id}/status
DELETE /companies/{id}/permanent
```

### Accounts

```txt
GET /companies/{id}/admins
POST /companies/{companyId}/admins
GET /companies/{companyId}/admins/{adminId}
PATCH /companies/{companyId}/admins/{adminId}
PATCH /companies/{companyId}/admins/{adminId}/status
DELETE /companies/{companyId}/admins/{adminId}
```

Le détail complet des routes est disponible dans Swagger.

## Notes importantes

- Les fichiers `.env` ne doivent pas être commités.
- Les fichiers `.env.example` doivent être maintenus à jour.
- Les constantes communes doivent être placées dans `shared`.
- Toute nouvelle route API doit être ajoutée dans Swagger.
- Toute modification de la base doit être reportée dans le DBML.
- Toute modification importante doit être indiquée dans le changelog.

## Liens internes utiles

- [Guide de contribution](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Documentation d'architecture](docs/architecture/architecture.md)
- [Documentation Swagger](docs/api/openapi.yaml)
- [Schéma DBML](docs/db/quizzup.dbml)
