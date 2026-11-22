# QuizzUP — Complément de cadrage V1 : interfaces, sessions programmées, API de réservation

> Document du 23 novembre 2026. **Proposition** à valider par Enzo et Victoria. Il complète
> `cadrage-v1.md` (lots 0 à 10) sans le remplacer : il ajoute ce que ce cadrage ne couvrait pas —
> le site vitrine, la console éditeur isolée, les sessions programmées, l'API de réservation — et
> précise l'hébergement. Les lots ajoutés ici sont numérotés à partir de 11.

## 1. Les quatre surfaces

| Surface | Pour qui | État | Où |
| --- | --- | --- | --- |
| **Site vitrine** | prospects, public | à créer | `www.<domaine>` |
| **Console éditeur** | nous (superadmin) | existe dans le backoffice, à isoler | nom d'hôte séparé, non public |
| **Espace centre** | admin du centre, collaborateurs | existe (backoffice) | `app.<domaine>` |
| **Écran de salle** | compte de salle, joueurs | existe (`game/room-app`) | `salle.<domaine>` |

Une seule API (`backoffice/backend`) sert les quatre. Le site vitrine n'en dépend pas pour
s'afficher.

## 2. Site vitrine (lot 11)

- **Nouveau paquet `vitrine/`**, pages statiques pré-rendues à la construction. Vue 3 comme le
  reste (même charte, mêmes tokens), sans exécution côté serveur : un dossier de fichiers servi par
  Caddy. C'est ce qui donne les meilleures notes Lighthouse et un référencement correct.
- **Bouton « Connexion » en haut à droite** : un simple lien vers `app.<domaine>`. Aucun
  formulaire de connexion sur la vitrine, donc aucune surface d'attaque.
- **Contenu** : ce que voit une salle (captures réelles de l'écran de salle, plan de salle, pupitre),
  comment ça s'installe (un navigateur), la compatibilité avec une salle existante, une demande de
  démonstration (formulaire → e-mail, avec limite de débit et champ piège anti-robot), mentions
  légales et politique de confidentialité.
- **Pas de prix affiché** tant que le modèle n'est pas tranché ; pas de témoignage ni de chiffre
  inventé.
- **Qualité** : Lighthouse ≥ 95 sur les quatre notes, mesuré dans la CI de la PR (voir §8). Images
  dimensionnées, police auto-hébergée, pas de script tiers.
- Le nom du produit n'est pas figé : nom, domaine et logo sont lus depuis un seul fichier de
  configuration de la vitrine.

## 3. Console éditeur isolée (lot 12)

Besoin : la console superadmin ne doit pas être joignable depuis internet.

- **Nom d'hôte séparé** pour la console éditeur. Le même frontend, construit avec les écrans
  superadmin ; l'espace centre ne les embarque plus.
- **Accès par VPN privé** (WireGuard ou équivalent) plutôt que par liste d'adresses IP : une
  adresse de box change, on se connecte aussi en déplacement, et le VPN chiffre et authentifie
  chaque poste. La liste d'adresses reste possible en complément.
- **Défense en profondeur, côté API** : toute route réservée au superadmin refuse une requête qui
  n'arrive pas par le réseau privé (contrôle sur l'adresse source vue par le proxy, configuration
  par variable d'environnement, refus par défaut en production). Le filtrage du proxy seul ne
  suffit pas : une erreur de configuration ne doit pas ouvrir la console.
- **Double authentification** (TOTP) obligatoire pour le rôle superadmin.
- Tests : une route superadmin appelée hors réseau privé répond 403 même avec un jeton valide.

Décision à prendre : VPN (recommandé) ou liste d'adresses IP seule.

## 4. Comptes d'un centre

Existant : `admin` (gère sa compagnie et ses comptes), `user` (collaborateur), comptes de salle.
À compléter pour la V1 :

- un **compte de salle par salle**, connecté en permanence, qui attend la session suivante (déjà
  le cas) et affiche la prochaine session programmée ;
- un collaborateur peut **lancer** une session et en **programmer** une (lot 13) ;
- l'admin du centre règle les salles (créneaux, nombre de pupitres) et les clés d'API (lot 14).

## 5. Sessions programmées (lot 13)

Aujourd'hui une partie se crée et se lance tout de suite. À ajouter :

- **Modèle** : une partie porte une date de début prévue (`scheduled_at`) et un état « programmée »
  avant « en attente ». Nouvelle migration ; les statuts existants ne changent pas de sens.
- **Réglages par salle** (dans la configuration de la salle, modifiables par l'admin du centre) :
  heures d'ouverture par jour, heure de la première session, durée d'un créneau en minutes, pause
  entre deux sessions, nombre de pupitres ouverts à la réservation, fuseau horaire du centre.
- **Agenda** par salle dans l'espace centre : créneaux du jour, sessions programmées, création à la
  main (joueurs, équipes, format, thèmes), modification, annulation.
- **Le jour venu** : la session apparaît sur l'écran de salle et dans l'espace centre ; le
  collaborateur vérifie les joueurs présents et appuie sur « Lancer ». Rien ne démarre tout seul :
  une salle ne lance jamais une partie sans une personne (fumée, joueurs pas encore installés).
- **Règles** : pas de chevauchement dans une salle (contrainte en base, pas seulement dans
  l'écran) ; heures stockées en UTC, affichées dans le fuseau du centre.

## 6. API publique de réservation (lot 14)

But : le site d'un centre (ou son outil de réservation) crée la session à l'avance, avec les
joueurs ; le collaborateur n'a plus qu'à la lancer.

- **Clés d'API par compagnie**, créées et révoquées par l'admin du centre. Seule l'empreinte de la
  clé est stockée ; la clé n'est affichée qu'une fois. Une clé ne donne accès qu'aux routes
  publiques de sa compagnie.
- **Routes versionnées** sous `/public/v1` :
  - `GET /public/v1/rooms` — salles ouvertes à la réservation ;
  - `GET /public/v1/availability?room=…&date=…` — créneaux libres, calculés depuis les réglages de
    la salle et les sessions existantes ;
  - `POST /public/v1/bookings` — crée une session programmée : salle, créneau, nombre de joueurs,
    et si le centre les a déjà : prénoms, e-mails, équipes, langue, référence de réservation ;
  - `PATCH` et `DELETE /public/v1/bookings/:id` — modifier, annuler.
- **Robustesse** : clé d'idempotence obligatoire sur la création (un double clic ou une nouvelle
  tentative ne crée pas deux sessions), limite de débit par clé, validation Zod, erreurs à code
  stable, journal des appels consultable par le centre.
- **Données personnelles** : le centre est responsable du traitement, l'éditeur est sous-traitant.
  Les e-mails reçus par l'API suivent la règle existante (masquage, purge à 3 ans) ; le consentement
  à recevoir des messages reste recueilli auprès du joueur, pas présumé par l'API. Un accord de
  sous-traitance est à prévoir avec chaque centre (lot 10 du cadrage).
- **Documentation** : OpenAPI publique séparée de celle du backoffice, avec un exemple d'appel et
  un bac à sable (compagnie de démonstration).
- **Ensuite seulement** : connecteurs pour les outils de réservation du marché, alimentés par leurs
  webhooks. On les écrit quand un premier centre en utilise un, pas avant.

## 7. Autres ajouts au cadrage existant

- **Extraits musicaux transformés** (durée très courte, lecture à l'envers, plus grave, plus lent) :
  faits **à la lecture** dans `game/audio` (Web Audio : tampon inversé, vitesse, hauteur). Aucun
  traitement ni fichier supplémentaire côté serveur ; un seul extrait source par question. Le cadre
  juridique de la musique reste à trancher avant tout usage commercial (lot 10).
- **Configuration de salle plus rapide** (prolonge le lot 0 et l'écran Matériel existant) :
  1. détection des nœuds Art-Net du réseau (déjà dans le pont) proposée comme point de départ ;
  2. ordre des ports et des cartes mémorisé par identifiant de périphérique, pas par ordre de
     branchement ;
  3. modèles de salle (« 6 pupitres, 8 lyres ») qui pré-remplissent adresses et profils, puis
     parcours guidé de confirmation, appareil par appareil ;
  4. export et import de la configuration d'une salle pour équiper la suivante à l'identique.
  La détection propose, l'opérateur confirme : on ne suppose jamais l'ordre réel du matériel.
- **Test de contrat mini-jeux** : un test qui échoue si un mini-jeu de `@quizzup/shared` n'a pas de
  définition dans le moteur ni de vue dans l'écran de salle (aujourd'hui seule la compilation le
  garantit pour le moteur).

## 8. Qualité : remonter Sonar et Lighthouse avant le merge

Aujourd'hui Sonar et Lighthouse tournent sur GitLab, sur `main`, donc après le merge ; leur
configuration n'est pas dans ce dépôt. Proposition :

1. documenter dans le dépôt les seuils exigés (porte de qualité Sonar, notes Lighthouse) ;
2. ajouter à la CI GitHub un contrôle Lighthouse sur les pages publiques (vitrine, connexion,
   inscription des joueurs), bloquant sous le seuil ;
3. garder le pipeline GitLab comme contrôle complet après merge, lu à chaque lot (`/lot` §7).

## 9. Hébergement (principes)

Le détail de l'installation n'est pas dans ce dépôt public. Principes retenus :

- **Docker Compose** sur une seule machine modeste pour démarrer : proxy Caddy (HTTPS), API,
  PostgreSQL, frontends statiques. C'est déjà la forme de `deploy/recette/`.
- **Rien d'irréversible** : les données sont dans PostgreSQL et dans le stockage des médias, tous
  deux derrière une interface (`mediaStorage.ts`). Migrer vers un hébergeur = restaurer une
  sauvegarde et changer le DNS.
- **Sauvegardes chiffrées hors site**, quotidiennes, avec un essai de restauration écrit et rejoué.
- **L'adresse du serveur n'est jamais exposée** : un relais (tunnel ou petit serveur frontal) reçoit
  le trafic public.
- **Une panne du serveur ne coupe pas une partie en cours** (autorité locale), mais empêche d'en
  lancer une nouvelle : le cache hors ligne (L14, aujourd'hui en V2) remonte en priorité si
  l'hébergement de départ n'est pas redondant.

## 10. Lots ajoutés et ordre proposé

| Lot | Contenu | Taille | Dépend de |
| --- | --- | --- | --- |
| **11. Vitrine** | paquet `vitrine/`, pages, demande de démonstration, Lighthouse en CI | M | charte existante |
| **12. Console éditeur isolée** | nom d'hôte séparé, contrôle réseau côté API, TOTP superadmin | M | hébergement choisi |
| **13. Sessions programmées** | `scheduled_at`, réglages de créneaux par salle, agenda, écran de salle | M | — |
| **14. API de réservation** | clés d'API, routes `/public/v1`, idempotence, doc publique | M | 13 |

Ordre conseillé avec les lots de `cadrage-v1.md` : 0 (banc) et 1 (pilotage en direct) d'abord,
puis 13 → 2 (accueil des joueurs) → 14, la vitrine (11) en parallèle car indépendante, la console
isolée (12) au moment de la mise en production (lot 9).

## 11. Décisions attendues

1. Console éditeur : VPN ou liste d'adresses IP (§3).
2. Sessions programmées : une session non lancée à l'heure est-elle annulée après un délai, ou
   reste-t-elle jusqu'à action du personnel ?
3. API : le centre peut-il réserver sans donner les e-mails (inscription par QR code sur place) ?
   Recommandé : oui, les joueurs sont facultatifs à la réservation.
4. Qualité : accord pour un contrôle Lighthouse bloquant dans la CI GitHub (§8).
5. Vitrine : nom et domaine provisoires pour la première mise en ligne.
