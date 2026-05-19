# Architecture du projet QuizzUp Backoffice

## Schéma global

```mermaid
flowchart TD
    User["Utilisateur backoffice"] --> Frontend["Frontend Vue 3 / Vite"]

    Frontend -->|HTTP / JSON| Backend["Backend API Fastify"]

    Backend --> Auth["Auth JWT"]
    Backend --> Routes["Routes API"]
    Backend --> Shared["Package shared"]

    Routes --> Services["Services métier"]
    Services --> Repositories["Accès données / Knex"]
    Repositories --> Database["PostgreSQL"]

    Backend --> Swagger["Swagger / OpenAPI"]
    Swagger --> OpenApiFile["docs/db/openapi.yaml"]

    Database --> DbSchema["Schéma DBML"]
    DbSchema --> DbmlFile["docs/db/quizzup.dbml"]

    Shared --> SharedConstants["Constantes communes"]
    SharedConstants --> Frontend
    SharedConstants --> Backend
```

![Schéma global](mermaid-diagram-global.png)

## Architecture backend

```mermaid
flowchart TD
    Request["Requête HTTP"] --> Fastify["Fastify app"]

    Fastify --> Plugins["Plugins"]
    Plugins --> AuthPlugin["Plugin auth"]
    Plugins --> CorsPlugin["Plugin CORS"]
    Plugins --> SwaggerPlugin["Plugin Swagger"]

    Fastify --> ApiRoutes["Routes API"]

    ApiRoutes --> AuthRoutes["Routes auth"]
    ApiRoutes --> MeRoutes["Routes me"]
    ApiRoutes --> CompanyRoutes["Routes companies"]
    ApiRoutes --> AccountRoutes["Routes accounts"]

    AuthRoutes --> BusinessLogic["Logique métier"]
    MeRoutes --> BusinessLogic
    CompanyRoutes --> BusinessLogic
    AccountRoutes --> BusinessLogic

    BusinessLogic --> Knex["Knex"]
    Knex --> Postgres["PostgreSQL"]
```

![Schéma global](mermaid-diagram-backend.png)

## Architecture frontend

```mermaid
flowchart TD
    Browser["Navigateur"] --> VueApp["Application Vue 3"]

    VueApp --> Router["Vue Router"]
    VueApp --> I18n["Vue i18n"]
    VueApp --> Components["Composants UI"]

    Router --> Pages["Pages"]
    Pages --> AuthPage["Page login"]
    Pages --> CompaniesPage["Gestion compagnies"]
    Pages --> AccountsPage["Gestion comptes"]

    Pages --> ApiClient["Client API"]
    ApiClient --> Backend["Backend Fastify"]

    VueApp --> Shared["Package shared"]
    Shared --> Constants["Constantes communes"]
```

![Schéma global](mermaid-diagram-frontend.png)

## Flux d'authentification

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant Frontend as Frontend Vue
    participant Backend as Backend Fastify
    participant DB as PostgreSQL

    User->>Frontend: Saisie identifiants
    Frontend->>Backend: POST /login
    Backend->>DB: Recherche admin
    DB-->>Backend: Admin trouvé
    Backend->>Backend: Vérification mot de passe
    Backend->>Backend: Génération JWT
    Backend->>DB: Création session admin
    Backend-->>Frontend: Token JWT + admin
    Frontend->>Frontend: Stockage token
    Frontend-->>User: Accès au backoffice
```

![Schéma global](mermaid-diagram-flux_auth.png)

## Flux d'accès à une route protégée

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant Frontend as Frontend Vue
    participant Backend as Backend Fastify
    participant Auth as Plugin Auth
    participant DB as PostgreSQL

    User->>Frontend: Action sur le backoffice
    Frontend->>Backend: Requête avec Authorization Bearer
    Backend->>Auth: Vérification JWT
    Auth->>DB: Vérification admin/session
    DB-->>Auth: Session valide
    Auth-->>Backend: Utilisateur autorisé
    Backend->>DB: Traitement demandé
    DB-->>Backend: Résultat
    Backend-->>Frontend: Réponse JSON
    Frontend-->>User: Mise à jour interface
```

![Schéma global](mermaid-diagram-flux_route.png)

## Organisation documentaire

```mermaid
flowchart TD
    Docs["docs/"] --> DbDocs["db/"]
    Docs --> ArchitectureDocs["architecture/"]

    DbDocs --> OpenApi["openapi.yaml"]
    DbDocs --> Dbml["quizzup.dbml"]

    ArchitectureDocs --> ArchitectureMd["architecture.md"]

    OpenApi --> SwaggerUi["Swagger UI /docs"]
    Dbml --> DbDiagram["dbdiagram.io"]
    ArchitectureMd --> Mermaid["Diagrammes Mermaid"]
```

![Schéma global](mermaid-diagram-doc.png)
