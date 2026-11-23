# Production QuizzUP

Déploiement de production sur **une seule machine** (Docker Compose), dérivé de `deploy/recette/`
(lot 9 du cadrage). Rejouable de zéro : tout ce qui est propre à l'installation (noms d'hôte,
secrets, stockage des sauvegardes) vient du fichier `.env`, jamais du dépôt.

```
            internet
               |  80, 443 (seuls ports publiés)
          +----v-----+      réseau « internal » (sans accès à internet)
          |  Caddy   |----> api :3001 ----> postgres :5432
          +----+-----+          |
               |                +--> volume médias (/data/media)
     fichiers statiques (volume « static ») : espace centre, écran de salle
     dossier « vitrine/ » (site vitrine, optionnel)
```

| Surface           | Nom d'hôte (variable) | Contenu                                                 |
| ----------------- | --------------------- | ------------------------------------------------------ |
| Site vitrine      | `HOST_WWW`            | `vitrine/` si `VITRINE_ENABLED=true`, sinon renvoi vers l'espace centre |
| Espace centre     | `HOST_APP`            | backoffice (admin du centre, collaborateurs)            |
| Écran de salle    | `HOST_SALLE`          | `game/room-app`                                         |
| API               | `HOST_API`            | API ; Swagger (`/docs`) réservé à la console éditeur    |
| Console éditeur   | `HOST_CONSOLE`        | même application que l'espace centre ; le filtrage par plages réseau **masque son adresse, il ne la protège pas** (voir « Limites connues ») |

| Fichier                                | Rôle                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `docker-compose.yml`, `Caddyfile`      | la pile                                                         |
| `Dockerfile.api` / `.web` / `.caddy`   | images (API compilée, fichiers statiques, Caddy non root)       |
| `.env.example`                         | toutes les variables, commentées                                |
| `backup.sh`, `restore.sh`              | sauvegarde chiffrée et restauration                             |
| `update.sh`                            | mise à jour vers un tag, avec retour arrière automatique        |
| `check.sh`                             | supervision (tâche planifiée) et alertes                        |
| `lib.sh`                               | fonctions communes aux scripts (ne se lance pas)                |

## Prérequis

- Linux (Debian 12 / Ubuntu 24.04 ou plus récent), **8 Go de RAM**, 40 Go de disque minimum
  (images, base, médias, anciens fichiers à empreinte).
- Docker Engine avec le plugin Compose **2.24 ou plus** (`docker compose version`), `git`, `curl`,
  `openssl`, `flock` (paquet `util-linux`, présent par défaut sur Debian et Ubuntu : verrou entre
  mise à jour, sauvegarde et restauration). Facultatif : la commande `mail` pour les alertes par
  e-mail, `tmux` pour lancer les mises à jour (voir « Mise à jour »).
- Ports **80 et 443 (TCP et UDP)** joignables depuis internet. L'accès SSH, lui, restreint.
- Un stockage distant pour les sauvegardes (S3 compatible, ou serveur REST restic, voir
  `.env.example`), **hors de cette machine**.
- Un nom de domaine dont on contrôle la zone DNS.
- Un utilisateur qui lance `docker` (groupe `docker`) ; les scripts n'ont pas besoin de `root`.

## DNS attendu

Un enregistrement `A` (et `AAAA` si la machine a une adresse IPv6 publique) par nom d'hôte, vers
l'adresse publique du serveur, **avant** le premier démarrage (Caddy demande les certificats au
démarrage) :

```
www, app, salle, api, console  ->  adresse du serveur
```

Les noms sont libres : ce sont les cinq variables `HOST_*`. Si un relais (tunnel, proxy frontal)
reçoit le trafic à la place du serveur, le DNS pointe sur le relais, et ses adresses vont dans
`TRUSTED_PROXIES` (sinon la console éditeur ne voit que l'adresse du relais) **et** dans `TRUST_PROXY`,
à la suite du sous-réseau de Caddy, pour que l'API lise la même adresse que Caddy. Caddy lit alors `X-Forwarded-For` de droite à
gauche et ne croit que les relais déclarés (`trusted_proxies_strict`) : un relais qui ajoute
l'adresse à l'en-tête, au lieu de la remplacer, est géré. Le certificat de la console éditeur est
émis comme les autres : le nom d'hôte reste visible dans les journaux publics des certificats. La
protection de la console est dans l'API (`CONSOLE_ALLOWED_CIDRS`, voir « Limites connues »).

## Première installation

```bash
git clone <URL du dépôt> quizzup && cd quizzup
git checkout vX.Y.Z                      # le tag à déployer, jamais une branche
cd deploy/prod
cp .env.example .env && chmod 600 .env
chmod +x ./*.sh
```

1. **Remplir `.env`** : `QUIZZUP_VERSION` (le même tag), les cinq `HOST_*`, `ACME_EMAIL`,
   `POSTGRES_PASSWORD` et `JWT_SECRET` (`openssl rand -hex 32` pour chacun), le dépôt de sauvegarde
   (`RESTIC_*`, `AWS_*`), `CONSOLE_ALLOWED_CIDRS` (**à renseigner avant le premier démarrage** : vide = console fermée, le
   superadmin créé à l'étape 3 ne pourrait pas se connecter), `TRUST_PROXY`, les alertes.
   Compose refuse de démarrer tant qu'une variable obligatoire est vide, avec son nom dans le message.
2. **Démarrer** : `docker compose up -d --build`. Premier démarrage : 5 à 10 minutes (construction,
   puis migrations, puis API, puis certificats). Suivre avec `docker compose ps` et
   `docker compose logs -f migrate api caddy`. Aucun seed de démonstration ne tourne en production.
3. **Créer le premier superadmin** (une seule fois) : renseigner `ADMIN_SEED_EMAIL`,
   `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD` (14 caractères minimum) dans `.env`, puis
   `docker compose run --rm bootstrap-admin`. **Supprimer ensuite `ADMIN_SEED_PASSWORD` de `.env`** :
   relancer la commande réécrirait le mot de passe.
4. **Initialiser les sauvegardes** : `./backup.sh init`, puis `./backup.sh` (première sauvegarde).
5. **Planifier** (`crontab -e` de l'utilisateur Docker ; adapter le chemin) :

   ```cron
   15 3 * * *   cd /chemin/quizzup/deploy/prod && ./backup.sh 2>&1 | logger -t quizzup-backup
   */5 * * * *  cd /chemin/quizzup/deploy/prod && ./check.sh > /dev/null 2>&1
   ```

   `backup.sh` et `check.sh` alertent eux-mêmes (webhook ou e-mail) : la sortie ne sert qu'au
   diagnostic. `backup.sh`, `update.sh` et `restore.sh` se partagent un verrou : si l'un tourne,
   un autre lancé en même temps refuse tout de suite (« une autre opération est en cours »). Une
   sauvegarde planifiée qui tombe pendant une mise à jour est donc sautée, sans conséquence
   (`check.sh` ne s'alarme qu'après 26 h). Une sonde extérieure (n'importe quel service qui interroge une URL) sur
   `https://<HOST_API>/health` complète `check.sh`, qui ne voit pas une panne de la machine entière.
6. **Dérouler la liste de contrôle** en fin de document.

## Secrets et rotation

Tous les secrets sont dans `.env` (non versionné, `chmod 600`). L'API refuse de démarrer si
`JWT_SECRET` fait moins de 32 caractères ou vaut la valeur de développement.

| Secret                | Rotation                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `JWT_SECRET`          | modifier `.env`, `docker compose up -d api`. **Tout le monde est déconnecté**, écrans de salle compris : à faire hors session. Une partie en cours continue ; ses résultats partent à la reconnexion. |
| `POSTGRES_PASSWORD`   | le mot de passe est aussi dans la base : `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER USER quizzup PASSWORD '"'"'nouveau'"'"'"'`, puis modifier `.env`, puis `docker compose up -d`. |
| `RESTIC_PASSWORD`     | `docker compose run --rm restic key passwd`, puis modifier `.env`. Conserver l'ancien jusqu'à la fin ; le nouveau aussi **hors du serveur**. |
| Accès au stockage     | modifier `.env` (`AWS_*` ou l'URL `rest:`) ; pris en compte au prochain lancement.             |
| Mots de passe de comptes | depuis le backoffice.                                                                       |

Après une fuite supposée de `.env` : tout changer, dans cet ordre `JWT_SECRET`, base, stockage,
`RESTIC_PASSWORD`.

## Sauvegardes

**Outil : restic.** Libre, un seul binaire, chiffrement (AES-256) et déduplication intégrés avant
l'envoi, politique de rétention native, et il parle à tout stockage S3, à un serveur REST ou SFTP
sans dépendre d'un fournisseur. `borg` n'envoie pas vers un stockage objet ; une copie `rclone`
simple ne chiffre ni ne déduplique.

`backup.sh` (tous les jours) : dump `pg_dump -Fc` (relu par `pg_restore --list` avant envoi), puis
volume des médias, puis `restic forget --prune` (7 jours, 4 semaines, 12 mois, réglable par
`KEEP_*`) et `restic check`. Code de sortie non nul et alerte au moindre échec. `check.sh` alerte
aussi si la dernière réussite a plus de 26 h.

Ce que la sauvegarde ne couvre pas : `.env` (à conserver à part, dans un gestionnaire de mots de
passe) et `RESTIC_PASSWORD`. **Sans ce mot de passe, les sauvegardes sont illisibles.**
Les journaux d'accès de Caddy (adresses IP) restent dans les journaux Docker, bornés à 5 × 10 Mo par
service : ils ne sont pas sauvegardés.

### Essai de restauration (à rejouer)

Une sauvegarde jamais restaurée n'est pas une sauvegarde. À faire une fois avant l'ouverture, puis
tous les trimestres et après tout changement de stockage.

**A. Sur une autre machine (preuve complète, connexion comprise).**

1. Installer Docker, cloner, `git checkout` du même tag, copier `.env` (mêmes `RESTIC_*` ; les
   autres valeurs peuvent différer, `POSTGRES_PASSWORD` sera celui de la base neuve). Pas besoin
   de DNS : ne pas démarrer Caddy.
2. `docker compose build api static`
3. `./restore.sh --yes --no-start` : restaure la base et les médias dans la pile vide, affiche le nombre
   de lignes (`admins`, `companies`, `questions`, `games`) et de fichiers médias.
4. Démarrer API et base : `docker compose up -d api`, puis
   `docker compose exec api wget -qO- http://127.0.0.1:3001/health` doit répondre `{"status":"ok"}`.
5. Comparer les nombres de l'étape 3 avec la production (étape B.2). Écart attendu : ce qui a été
   écrit depuis la dernière sauvegarde.

**B. Sur le serveur de production, dans une pile isolée (essai trimestriel, sans toucher la prod).**

1. Noter les chiffres de la production :

   ```bash
   docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select (select count(*) from admins), (select count(*) from companies), (select count(*) from questions), (select count(*) from games)"'
   docker compose run --rm --entrypoint sh restic -c 'find /media -type f | wc -l'
   ```

2. Restaurer dans un projet Compose séparé (autres volumes, rien d'exposé) :

   ```bash
   export COMPOSE_PROJECT_NAME=quizzup-essai
   ./restore.sh --yes --no-start
   ```

3. Comparer avec les chiffres de l'étape 1 (le script les affiche dans le même ordre).
4. Nettoyer : `COMPOSE_PROJECT_NAME=quizzup-essai docker compose down -v` (n'efface que la pile d'essai).

Critère de réussite : le script se termine par « Restauration terminée », les nombres concordent
(à l'écart près des écritures récentes), aucune erreur de `pg_restore`.

## Mise à jour

```bash
cd deploy/prod
tmux new -s maj          # ou : nohup ./update.sh vX.Y.Z > update.log 2>&1 &
./update.sh vX.Y.Z
```

Lancer la mise à jour dans `tmux` (ou `nohup`) : la construction dure 5 à 10 minutes et une session
SSH qui tombe en plein milieu coupe le script. Si cela arrive quand même, le script reçoit le signal
de fin de session et fait le retour arrière décrit plus bas.

`update.sh` : refuse si des fichiers suivis sont modifiés ; refuse s'il y a une **partie en cours**
(`games.state = 'running'`) ; refuse si la base contient des migrations que le tag ne connaît pas
(cible plus ancienne que la base, voir « Retour arrière ») ; passe sur le tag ; **construit les
images sans rien arrêter** ; fait une **sauvegarde** ; applique (`migrate` une fois, puis API,
fichiers statiques, rechargement de Caddy) ; vérifie la santé de l'API et de Caddy puis le chemin
public `https://<HOST_API>/health`. Au moindre échec, il **annule les migrations ajoutées**,
revient au code et à l'ancienne version, et alerte. Lire les notes de version avant : une variable
obligatoire nouvelle apparaît dans `.env.example`, et il faut la renseigner **avant** de lancer
`update.sh`.

`--force` passe outre une partie en cours. Il ne coupe pas la partie (voir ci-dessous) mais, après
une partie « bloquée » (écran fermé en cours de route, jamais terminée), c'est le seul moyen de
mettre à jour sans attendre.

### Pourquoi une partie en cours survit au redémarrage de l'API

L'**autorité de la partie est dans le navigateur de la salle** (cadrage D1, `CLAUDE.md` §10). Tout
ce qu'il faut pour jouer est déjà sur le PC avant le début de la partie, et l'API n'est consultée
qu'avant et après :

- `game/room-app/src/views/lobby/StaffGameLobby.vue` (≈ l. 290-314) : le contenu de la partie
  (`fetchCurrentContent`) et les extraits audio (`preloadExtracts`) sont chargés, puis la partie est
  déclarée démarrée (`startRoomGame`). Les extraits sont décodés en mémoire
  (`game/room-app/src/game/useRoomGame.ts` ≈ l. 157-166, `game/audio`).
- Le moteur (`game/engine`, pur et déterministe) juge buzzers, scores et manches dans le navigateur ;
  `game/room-app/src/game/session.ts` sauvegarde la partie en continu (graine et commandes), elle
  se reprend même après rechargement de la page.
- À la fin, `game/room-app/src/game/pendingFinishes.ts` envoie les scores (`POST
  /room/games/:id/finish`) via une file gardée dans `localStorage` : en cas d'échec réseau ou
  serveur, elle réessaie à 2, 5, 15, 30 puis toutes les 60 s, et survit à un rechargement ou à la
  partie suivante.

Pendant le redémarrage de l'API (quelques secondes), Caddy retient les requêtes jusqu'à 15 s
(`lb_try_duration`) : un envoi de résultats ou une ouverture de session passe sans erreur visible.
Les sessions et le `JWT_SECRET` sont inchangés : personne n'est déconnecté.

### Ce qui ne survit pas

- **Lancer une nouvelle partie pendant la coupure** : contenu, extraits et démarrage viennent de
  l'API. Une coupure de plus de 15 s empêche ce lancement jusqu'au retour de l'API.
- **Les flux en direct** (SSE : `GET /companies/*/live`, `GET /room/stream`) : le registre des
  abonnés est en mémoire de l'API (`backoffice/backend/src/live/hub.ts`). Ils sont coupés au
  redémarrage et le client les rouvre : le tableau de bord se rafraîchit, rien n'est perdu côté
  partie.
- **Pages ouvertes pendant une mise à jour des fichiers statiques** : les anciens fichiers à
  empreinte restent dans le volume `static`, donc les écrans paresseux d'une page de salle déjà
  chargée (`game/room-app/src/router/index.ts` : chargement à la demande) se chargent encore.
  Seul `index.html` change : la nouvelle version n'apparaît qu'au rechargement suivant. Le volume
  grossit de quelques Mo par version : sans souci avant des années.
- **Une migration qui supprime des données** : le retour arrière exécute les `down` des migrations
  (testés en CI) ; un `down` ne ressuscite pas ce qu'un `up` a effacé. Lire les notes de version.

## Retour arrière

Pourquoi les migrations d'abord : knex refuse de démarrer si la base contient une migration que le
code ne connaît pas. Remettre l'ancien code sur une base déjà migrée ne démarre donc pas. Il faut
annuler les migrations de la nouvelle version, avec **son** image (c'est elle qui a leurs `down`),
puis remettre l'ancien code.

- **Automatique** : si la vérification échoue (ou si la session est coupée en cours de route),
  `update.sh` compare le dernier lot de `knex_migrations` à sa valeur d'avant la mise à jour.
  - Lot inchangé : aucune migration n'a été appliquée, rien n'est annulé (annuler quoi que ce soit
    défairait les migrations de la version précédente).
  - Lot augmenté (y compris une migration qui a échoué en cours de lot : les précédentes sont
    validées une à une) : `knex migrate:rollback` annule ce lot, puis le script remet le code, `.env`
    et les conteneurs de l'ancienne version (sans reconstruire : ses images sont conservées).
  - Annulation impossible (base illisible, `down` en erreur, verrou knex resté pris, état de lots
    inattendu) : **le script s'arrête sans rien toucher d'autre** et alerte. Le code, `.env` et les
    conteneurs restent sur la nouvelle version. Faire alors la procédure manuelle ci-dessous.
  - Si le retour échoue après l'annulation, le script le dit et alerte : voir « Si le serveur
    tombe ».
- **Volontaire** vers une version qui connaît toutes les migrations de la base :
  `./update.sh vAUTRE.VERSION` (même procédure, avec sauvegarde). Les images des versions
  précédentes sont conservées (`docker image ls quizzup/api`).
- **Volontaire vers une version plus ancienne que la base** (le tag ne connaît pas des migrations déjà
  appliquées) : `update.sh` refuse et liste les migrations en trop. Ce n'est pas automatique, car
  annuler des migrations peut perdre des données. À la main, dans l'ordre :
  1. `./backup.sh`.
  2. `docker compose stop api`.
  3. `docker compose run --rm --no-deps migrate node_modules/.bin/knex migrate:rollback` : annule un lot
     (avec l'image de la version **actuelle**). Relancer `./update.sh vANCIENNE.VERSION` ; s'il
     refuse encore, répéter 3.
  4. Sinon, restaurer une sauvegarde antérieure à ces migrations (procédure suivante).
- **Procédure manuelle quand l'annulation automatique a échoué** (la pile est toujours sur la nouvelle
  version, la base est partiellement ou entièrement migrée), au choix :
  - *Annuler à la main* : si le message parle d'un verrou, `docker compose run --rm --no-deps migrate
    node_modules/.bin/knex migrate:unlock` ; puis `docker compose stop api`, puis
    `docker compose run --rm --no-deps migrate node_modules/.bin/knex migrate:rollback` ; puis
    `git checkout <ancien tag>`, mettre `QUIZZUP_VERSION=<ancien tag>` dans `.env`, et
    `docker compose up -d --remove-orphans`.
  - *Restaurer la sauvegarde* faite par `update.sh` juste avant la migration (perd les écritures
    depuis). Revenir sur l'ancien tag et `QUIZZUP_VERSION` comme ci-dessus, puis
    `docker compose down`, `docker volume rm quizzup-prod_pgdata`, `./restore.sh --yes`. Seul le
    volume de la base est supprimé : `docker compose down -v` effacerait aussi les certificats de
    Caddy (`caddy_data`) et les fichiers statiques. Ne supprimer le volume qu'avec une sauvegarde
    vérifiée.

## Si le serveur tombe pendant une session

1. **Les parties en cours continuent** : ne rien faire dans la salle, ne pas recharger l'écran. Les
   résultats sont mis en file sur le PC de la salle et partent seuls au retour du serveur
   (messages « envoi en attente » sur l'écran de fin de partie).
2. **Pas de nouvelle partie** tant que l'API ne répond pas (contenu et démarrage viennent d'elle).
   Prévenir le gérant de la salle.
3. Sur le serveur : `docker compose ps`, puis `docker compose logs --tail 100 api caddy postgres`.
   - un service arrêté : `docker compose up -d` (tous ont `restart: unless-stopped`, ils redémarrent
     d'eux-mêmes après un redémarrage de la machine) ;
   - disque plein : `df -h`, `docker system df`, libérer (anciennes images : `docker image prune`) ;
   - API « unhealthy » : `docker compose logs api` ; un `JWT_SECRET` refusé ou une variable
     manquante s'y lit en clair.
4. Machine perdue : nouvelle machine. Reprendre la « Première installation » **jusqu'à l'étape 1
   (`.env`) seulement**, avec le tag qui tournait au moment de la panne et le `.env` conservé dans le
   gestionnaire de mots de passe. Ne pas faire `docker compose up` (il lancerait les migrations, et
   `restore.sh` refuse une base qui contient déjà des tables), ni le bootstrap du superadmin, ni
   `./backup.sh init` (le dépôt existe déjà). Ensuite, comme l'essai de restauration (A) :
   `docker compose build`, changer le DNS vers la nouvelle machine (Caddy demande ses certificats
   au démarrage), puis `./restore.sh --yes` (restaure puis démarre toute la pile). Reprendre
   ensuite l'étape 5 de l'installation (planification). L'essai de restauration (A) prouve que cela
   marche.
5. Après coup : vérifier que les résultats des parties jouées pendant la panne sont arrivés
   (`games.state = 'finished'`), sinon relancer l'écran de salle concerné (il vide sa file à
   l'ouverture).

## Supervision

`check.sh` (toutes les 5 minutes) contrôle : santé de `postgres`, `api` et `caddy` ; réponse de
`https://<HOST_API>/health` par Caddy ; expiration des cinq certificats (alerte sous
`CERT_WARN_DAYS`, 14 par défaut : Caddy renouvelle à 30 jours, un seuil franchi veut dire que le
renouvellement échoue) ; espace disque de `/var/lib/docker` (`DISK_WARN_PERCENT`, 85) ; âge de la
dernière sauvegarde réussie (`BACKUP_MAX_AGE_HOURS`, 26). Chaque problème donne une alerte
(`ALERT_WEBHOOK_URL`, JSON `{"text":…,"content":…}` : Slack, Mattermost, Discord ; ou
`ALERT_EMAIL_TO`), répétée au plus toutes les `ALERT_REPEAT_MINUTES` (60).

**Route de santé** : l'API a `GET /health` → `{"status":"ok"}`. Elle prouve que le processus répond,
pas que la base répond. Il manque une route de disponibilité réelle ; contrat proposé (non
écrit, hors périmètre de ce lot) : `GET /health/ready`, publique, sans donnée, exécute `SELECT 1`
avec un délai de 1 s ; `200 {"status":"ok","db":"ok"}`, sinon `503 {"status":"degraded","db":"down"}` ;
à ajouter à `openapi.yaml`. `check.sh` surveille déjà la santé de `postgres` en parallèle.

## Liste de contrôle avant ouverture

À cocher une fois sur la vraie machine, dans cet ordre.

- [ ] `JWT_SECRET` fort : `openssl rand -hex 32`, jamais la valeur de développement. L'API l'impose
      (`docker compose logs api` ne contient pas « JWT_SECRET refusé »).
- [ ] `.env` : `chmod 600`, hors dépôt (`git status` ne le montre pas), copie du contenu dans un
      gestionnaire de mots de passe ; `ADMIN_SEED_PASSWORD` supprimé après le bootstrap.
- [ ] **Aucun compte de démonstration** : `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d
      "$POSTGRES_DB" -Atc "select username from admins"'` ne liste que les comptes voulus (ni `demo-admin`,
      ni `salle1-demo`, ni compte `@seed.quizzup.local`).
- [ ] **Ports fermés** : depuis une autre machine, seuls 80 et 443 répondent
      (`nmap -p 1-10000 <serveur>` : ni 5432, ni 3001, ni 2019). Docker contourne `ufw` : se fier à
      cet essai extérieur, pas au pare-feu de la machine. `docker compose ps` ne montre un port
      publié que pour `caddy`.
- [ ] HTTPS valide sur les cinq noms d'hôte ; `http://` redirige vers `https://`.
- [ ] **Filtrage par adresse** : depuis une adresse hors de `CONSOLE_ALLOWED_CIDRS`,
      `https://<HOST_CONSOLE>/` et `https://<HOST_API>/docs/` répondent **403** ; depuis une adresse
      autorisée, la console s'ouvre. Vide `CONSOLE_ALLOWED_CIDRS` = 403 partout.
- [ ] **Garde du superadmin dans l'API** : depuis une adresse hors de `CONSOLE_ALLOWED_CIDRS`, la
      connexion du superadmin sur `https://<HOST_APP>/` échoue comme un mauvais mot de passe, et un
      jeton déjà émis reçoit **403** sur `GET https://<HOST_API>/companies`. Le journal de l'API
      (`docker compose logs api`) montre l'adresse refusée : c'est celle du poste, pas celle de
      Caddy ni du relais (sinon corriger `TRUST_PROXY`).
- [ ] **En-têtes** : `curl -sI https://<HOST_APP>/` montre HSTS, `X-Content-Type-Options`,
      `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, et `Cache-Control: no-cache` ; un fichier
      de `/assets/` a `immutable`.
- [ ] **CSP** : ouvrir chaque surface (espace centre, écran de salle avec une partie complète et un
      extrait audio, vitrine si activée) avec `CSP_HEADER=Content-Security-Policy-Report-Only`,
      la console du navigateur ne signale aucune violation inattendue ; passer alors à
      `Content-Security-Policy`, `docker compose up -d caddy`, recommencer.
- [ ] **Écran de salle sur le vrai PC** : connexion, partie, interface DMX USB (Web Serial),
      buzzers, plein écran, manette ; `chrome://policy` du PC cible l'origine `https://<HOST_SALLE>`
      (`deploy/poste-salle/`).
- [ ] **Flux en direct** : le tableau de bord d'un centre reçoit les événements d'une partie sans
      délai (pas de tampon ni de compression côté Caddy).
- [ ] **Envoi d'un extrait audio** de 10 Mo (limite) accepté, 11 Mo refusé avec un message de l'API.
- [ ] **Sauvegarde restaurée une fois** (essai A ci-dessus), `RESTIC_PASSWORD` conservé hors serveur.
- [ ] `./check.sh` affiche « Tout est en ordre » ; une alerte de test arrive (arrêter `api` une
      minute avec `docker compose stop api`, relancer `./check.sh`, vérifier le webhook ou l'e-mail,
      puis `docker compose up -d`).
- [ ] Redémarrage de la machine : toute la pile remonte seule (`docker compose ps`, tout `healthy`).
- [ ] `./update.sh` rejoué à blanc sur le même tag (il doit passer sans erreur) puis, en pré-production,
      avec deux échecs provoqués : un tag dont la construction échoue (lot de migrations inchangé,
      rien annulé), puis un tag qui ajoute une migration et dont l'API échoue (migration annulée,
      ancienne version qui redémarre) : retour arrière constaté dans les deux cas.
- [ ] Pas de nom de domaine, d'adresse IP ni de secret commités (`git grep` sur le dépôt).

## Limites connues

- **Console éditeur** : le filtrage par nom d'hôte et par plage réseau de Caddy **masque l'adresse
  de la console** ; la protection est la garde de l'API, qui lit `CONSOLE_ALLOWED_CIDRS` : un
  superadmin hors de ces adresses ne peut ni se connecter ni utiliser un jeton, sur aucun nom
  d'hôte. Tout repose sur l'adresse que voit l'API (`TRUST_PROXY`) : elle est fausse si un relais
  n'est pas déclaré à la fois dans `TRUSTED_PROXIES` et `TRUST_PROXY`. Le double facteur et la
  séparation des deux applications arrivent avec la suite du lot « console éditeur » (lot 12).
- **Un seul serveur** : une panne de la machine coupe l'API (les parties en cours continuent, mais
  aucune nouvelle ne démarre) ; le rétablissement est la restauration. Pas de haute disponibilité.
- **Polices** : le backoffice et l'écran de salle importent encore leurs polices depuis un service
  tiers (`backoffice/frontend/src/assets/styles/main.css`) ; la CSP l'autorise. À auto-héberger.
- **Images non épinglées par condensat** : `postgres:16-alpine`, `caddy:2-alpine`, `node:22-alpine`
  suivent leur étiquette ; `restic` est épinglé. Épingler par condensat si l'on veut des
  constructions strictement reproductibles.
- **Droits des conteneurs** : la base (utilisateur 70), Caddy (65532), l'API (`node`) et les
  copies statiques tournent sans root, avec un système de fichiers en lecture seule. Si un conteneur
  refuse de démarrer pour une question de droits, `docker compose logs <service>` le dit. Sur un
  volume Caddy créé avant ce déploiement : `docker compose run --rm --user 0 --entrypoint chown caddy
  -R 65532:65532 /data /config`.
