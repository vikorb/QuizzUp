# CONTRIBUTING.md

# Contribuer au projet QuizzUp Backoffice

Ce document définit les règles de contribution au projet.  
Il ne remplace pas le README : le README explique comment installer, lancer et comprendre le projet.

## Principes généraux

Avant de contribuer, il faut respecter quelques règles simples :

- garder le code cohérent avec l'existant
- éviter les changements inutiles
- documenter les modifications importantes
- ne pas casser les fonctionnalités déjà terminées
- privilégier des changements petits et faciles à relire

## Organisation des contributions

Chaque modification doit être faite dans une branche dédiée.

Exemples de noms de branches :

- feat/auth
- feat/companies
- feat/accounts
- fix/company-status
- docs/swagger
- docs/database-schema
- chore/env-example

Une branche doit idéalement correspondre à une seule fonctionnalité, correction ou mise à jour documentaire.

## Commits

Les commits doivent être clairs et compréhensibles.

Format conseillé :

- feat(scope): description
- fix(scope): description
- docs(scope): description
- refactor(scope): description
- chore(scope): description

Exemples :

- feat(auth): add admin login
- feat(companies): add company status update
- feat(accounts): add account management
- fix(cors): allow frontend local origin
- docs(swagger): add API availability status
- docs(db): add dbdiagram schema
- chore(env): add env examples

Éviter les commits trop vagues comme :

- update
- fix
- test
- wip
- correction

## Règles backend

Pour toute modification backend :

- vérifier les routes existantes avant d'en ajouter une nouvelle
- garder une séparation claire entre routes, logique métier et accès aux données
- utiliser les constantes partagées quand elles existent
- garder des réponses API cohérentes
- retourner des erreurs stables et exploitables côté frontend
- ajouter une migration si la structure de la base change
- éviter de modifier directement une ancienne migration déjà partagée

Quand une route API est ajoutée ou modifiée, Swagger doit être mis à jour.

## Règles frontend

Pour toute modification frontend :

- utiliser les types existants quand ils sont disponibles
- utiliser les constantes partagées au lieu de dupliquer les valeurs
- gérer les états de chargement
- gérer les erreurs API
- ajouter les clés i18n nécessaires
- garder les composants lisibles et cohérents avec le style existant

Si une nouvelle erreur backend est utilisée côté frontend, la clé de traduction associée doit être ajoutée.

## Règles base de données

Les migrations doivent rester cohérentes avec les conventions existantes.

Convention actuelle :

- company_id
- created_at
- updated_at
- deleted_at
- firstname
- lastname
- mdp_hash

Les statuts doivent rester harmonisés :

- 0 = inactif
- 1 = actif
- 2 = supprimé

Pour une suppression logique, le champ deleted_at doit être renseigné.

Si une table, une colonne ou une relation change, le fichier DBML doit être mis à jour.

## Documentation

La documentation doit être mise à jour uniquement quand c'est nécessaire.

À mettre à jour selon le cas :

- Swagger si une route API est ajoutée, modifiée ou supprimée
- DBML si la base de données change
- .env.example si une variable d'environnement est ajoutée
- README si le fonctionnement global du projet change
- CONTRIBUTING si les règles de contribution changent

Les routes futures peuvent être documentées dans Swagger, mais elles doivent être clairement indiquées comme non disponibles.

## Constantes partagées

Les valeurs utilisées à la fois par le backend et le frontend doivent être placées dans le package shared.

Exemples :

- statuts de compagnie
- statuts d'admin
- rôles
- types communs

Il faut éviter de définir la même valeur à plusieurs endroits.

## Variables d'environnement

Les fichiers .env réels ne doivent jamais être commités.

Les fichiers .env.example doivent être tenus à jour lorsqu'une variable est ajoutée, supprimée ou renommée.

## Checklist avant merge

Avant de proposer une merge request, vérifier que :

- le backend démarre correctement
- le frontend démarre correctement
- les migrations passent
- les seeds passent si nécessaire
- Swagger est à jour si une route a changé
- le DBML est à jour si la base a changé
- les constantes partagées sont utilisées si nécessaire
- les clés i18n sont ajoutées si nécessaire
- aucun secret n'est commit
- le code est cohérent avec l'existant

## À ne pas commiter

Ne jamais commiter :

- .env
- node_modules
- fichiers de build
- fichiers temporaires
- logs
- tokens
- mots de passe
- secrets

## Objectif

L'objectif est de garder un projet simple, propre et maintenable.

Chaque contribution doit être facile à comprendre, facile à relire et cohérente avec le reste du projet.
