# QuizzUP — Cadrage de la V1 commerciale

> Document du 16 novembre 2026. Il prend la suite de `bilan-cadrage-version-finale.md`
> (3 novembre) et du plan « salle » (`plan-salle.md`, lots L1 à L17, tous mergés). État de départ :
> `docs/REPRISE.md`. Le banc matériel est décrit dans `docs/recette/banc-materiel.md`.

## 1. Objectif

Une **V1 vendable** à un centre de loisirs : la salle ouvre QuizzUP dans Chrome sur n'importe quel
PC correct, se connecte avec son compte de salle, configure ses buzzers et ses lumières en
quelques minutes, et le centre lance des sessions **sur place ou à distance**. Aucun logiciel lourd,
aucun serveur local, aucune IP fixe.

La V1 est prête quand les **critères de sortie** du §7 sont tous verts.

## 2. Le concurrent à remplacer (synthèse)

Analyse détaillée : `docs/compatibilite/compatibilite-salles-6-pupitres.md`. On n'en reprend que
les valeurs d'installation, jamais le code, les contenus, les noms de manches ni les visuels.

| Sujet | Concurrent | QuizzUP |
| --- | --- | --- |
| Poste de jeu | PC Windows dédié avec carte graphique, jeu Unreal Engine 4 installé | Chrome sur un PC de bureau ordinaire |
| Serveur | PC serveur local (XAMPP) à allumer en premier, IP fixes | backoffice en ligne |
| Supervision | application Windows sur tablette, même réseau local | backoffice web, n'importe où |
| Licence | clé par PC de jeu | compte de salle (abonnement à définir) |
| Buzzers | carte Leo Bodnar + utilitaire clavier | même carte lue directement (Gamepad), ou n'importe quelle manette / clavier |
| Lumières | boîtier Art-Net, réseau dédié 192.168.200.x | USB DMX (rien à installer) ou Art-Net via le pont |
| Fumée | Arduino sur minuterie, **sans lien avec le jeu** | relais DMX piloté par le jeu, plafonné, arrêt d'urgence |
| Inscription joueurs | personnel, ou 1 smartphone sur le **réseau local** | (à faire) QR code sur le téléphone des joueurs, n'importe quel réseau |
| Après-partie | PDF imprimable une seule fois, bons gagnants remplis à la main | (à faire) feuille régénérable, bons numériques suivis |
| Exploitation | délai obligatoire de 3 min entre deux sessions, « Fatal Error » si pupitres mal ordonnés, logs sur le PC | (à garantir) aucune de ces contraintes, journaux centralisés |
| Points forts à égaler | présentateur virtuel avec voix, show lumière, « décor de studio TV » | (à faire) habillage, voix, scénarisation lumière + fumée |

**Notre avantage** : zéro installation, distance, multi-centres, mises à jour instantanées,
compatibilité avec leurs salles pour ~80-170 € de matériel. **Notre retard** : le spectacle (voix,
rendu, scénographie) et l'exploitation au quotidien (inscription, résultats, fidélisation).

## 3. Ce qu'on garde

L'existant est sain ; la V1 se construit dessus, sans réécriture.

- **Moteur pur et déterministe** (`game/engine`), rejouable avec une graine.
- **Autorité de la partie dans le navigateur de la salle.** Le buzzer se juge en local, à la
  milliseconde, sans dépendre d'internet. Le serveur stocke, distribue et observe ; il n'arbitre pas.
- **100 % navigateur** (Chrome / Edge), compte de salle, config matériel dans `rooms.config`.
- **Matériel universel** : apprentissage des buzzers, profils DMX configurables, simulation.
- **Sécurité fumée** : relais + relais temporisé 10 s + arrêt d'urgence obligatoires.
- Backoffice multi-tenant, RBAC, RGPD, CI GitHub, ~220 fichiers de tests.

## 4. Décisions d'architecture

### D1. Autorité locale — à confirmer par écrit

Déjà le cas dans le code. `CLAUDE.md` §10 disait encore « serveur autoritatif » : corrigé dans la
même PR que ce document.

### D2. Canal temps réel serveur ↔ salle — à trancher

Aujourd'hui l'écran de salle interroge `GET /room/games/current` toutes les 3 s : suffisant pour
démarrer une partie, pas pour la piloter ni la suivre. Besoins V1 :

- **Présence** : le backoffice voit chaque salle en ligne / hors ligne / en partie.
- **Commandes à distance** : lancer, mettre en pause, reprendre, arrêter, passer une question.
- **Suivi en direct** : scores et étape en cours, sur le backoffice ou une tablette du personnel.

Recommandation : **SSE** (Server-Sent Events) du serveur vers la salle et vers les écrans de
suivi, et des **POST** de la salle vers le serveur (événements groupés toutes les ~2 s). Pourquoi
pas WebSocket : rien à gérer en plus côté Fastify / Caddy, reconnexion native du navigateur, et le
sens salle → serveur reste du REST déjà testé. Passage à WebSocket seulement si un besoin
bidirectionnel à faible latence apparaît (ex. buzzers sur téléphone, hors V1).

Règles : une commande à distance est **une proposition** que le moteur local applique ou refuse
(règle du jeu, partie déjà finie) ; l'écran de salle reste maître. Si le serveur est injoignable, la
partie continue (comportement actuel).

### D3. Rust — pas dans le navigateur en V1

- Le moteur fait très peu de calcul ; le rendu dépend du GPU, pas du langage ; l'audio est déjà
  natif (Web Audio). Rust compilé en WebAssembly n'apporterait **aucun gain visible** et coûterait
  une deuxième chaîne d'outils.
- Rust a du sens pour le **pont Art-Net** : exécutable de quelques Mo, sans runtime, facile à
  signer, au lieu du Node empaqueté non signé. **Déclencheur** : le test A3 du banc (SmartScreen,
  Smart App Control, antivirus). Si le pont signé en l'état passe, on ne réécrit pas.

### D4. Rendu « spectacle » — mesurer avant de choisir

Aujourd'hui : Vue + CSS, aucune bibliothèque graphique. Le test G6 du banc mesure les 60 i/s sur un
GPU intégré. Ensuite :

- si le DOM/CSS tient : on reste dessus pour les écrans, et on ajoute des **vidéos d'habillage
  pré-rendues** (intros de manche, podium) — le rendu le plus riche au coût le plus faible ;
- **WebGL (PixiJS) seulement pour les effets** (particules, transitions) si le DOM ne suit pas ;
- pas de moteur 3D.

### D5. Hors ligne — reste en V2

Le contenu de la partie est déjà préchargé et les scores sont renvoyés après une coupure. Le cache
complet de l'application (L14) reste en V2 ; il faudra le reconsidérer si un centre a une connexion
instable.

## 5. Lots de la V1

Taille : S (≈ 1 PR), M (2-3 PR), L (4 PR et plus). Modèle des sous-agents selon `CLAUDE.md` §4.1.

| Lot | Contenu | Taille | Dépend de |
| --- | --- | --- | --- |
| **0. Banc matériel** | achats, montage, protocole `banc-materiel.md`, corrections des anomalies | M | — |
| **1. Pilotage en direct** | D2 : présence des salles, commandes à distance, suivi des scores, fin du polling | L | — |
| **2. Accueil des joueurs** | QR code par partie → page publique d'inscription sur le téléphone (prénom, e-mail, consentement), 2 joueurs par pupitre, validation par le personnel avant lancement | M | 1 (affichage en direct) |
| **3. Formats de partie** | formats courts / standard choisis au lancement (aujourd'hui 10 × 10 par défaut, trop long pour une session d'une heure) ; durée réelle mesurée sur le banc | S | 0 |
| **4. Mini-jeux V1.1** | 3 à 4 mécaniques génériques manquantes (mise sur une roue, course à N bonnes réponses, don de points, duel), noms et visuels à nous | M | 3 |
| **5. Spectacle** | habillage des écrans (D4), voix de présentateur (pré-générée côté serveur, pas la synthèse du navigateur), show lumière scénarisé par événement, fumée sur les moments forts, scène de sortie réglable | L | 0 |
| **6. Après-partie et fidélisation** | feuille de résultats imprimable et régénérable (CSS d'impression, pas de PDF serveur), bons gagnants numériques (code + QR, validité, usage unique, suivi), logo du centre | M | 1 |
| **7. Exploitation** | pages Joueurs et Stats (vides aujourd'hui), historique des sessions, journaux d'erreurs des salles remontés au backend, diagnostic à distance | M | 1 |
| **8. Contenu** | banque de questions éditeur (volume cible à fixer), import CSV, option « enfants », ne pas reproposer une question déjà jouée par un joueur connu | M | — |
| **9. Production** | déploiement réel (`deploy/recette` → prod), secrets hors du dépôt (`JWT_SECRET`), sauvegardes Postgres + médias, supervision, mises à jour sans couper une partie en cours | M | — |
| **10. Commercial et juridique** | offre et prix par salle, CGU / CGV, RGPD (registre, mentions), droits musicaux (SACEM / SDRM) avant tout blind test « tubes », kit de migration d'une salle concurrente, guide d'installation | M | 0, 9 |

**Ordre proposé** : 0 et 9 en parallèle (matériel et prod ne se touchent pas) → 1 → 2, 3, 6, 7 →
4, 5 → 8, 10. Le lot 1 est le seul gros chantier technique ; le reste réutilise l'existant.

**Hors V1** : buzzers sur téléphone, cache hors ligne complet, paiement en ligne intégré,
classements entre centres, multi-écrans par salle.

## 6. Qualité

- Chaque lot : branche, lint + type-check + tests verts, PR, une relecture indépendante, merge sur
  CI verte (process habituel).
- Nouveaux tests e2e : commande à distance (lot 1), inscription par QR (lot 2), impression des
  résultats (lot 6).
- Le banc (lot 0) devient une **recette à refaire avant chaque version** : tests B, D, F et G en
  priorité, ~1 h.

## 7. Critères de sortie de la V1

1. Banc matériel : tous les tests **F** (fumée) verts ; B, D, G verts ou écarts documentés et
   acceptés ; A vert si on vend la migration Art-Net.
2. Une salle se configure de zéro (buzzers + lumières + fumée) en **moins de 15 minutes** par
   quelqu'un qui ne connaît pas le produit, avec le guide.
3. Une session se lance **à distance** depuis le backoffice et se suit en direct.
4. Les joueurs s'inscrivent sur leur téléphone sans être sur le réseau du centre.
5. Deux sessions s'enchaînent dans la même salle **sans délai imposé** ni manipulation.
6. Une coupure internet de 5 minutes pendant une partie ne la casse pas.
7. Production déployée, sauvegardée, supervisée ; secrets hors du dépôt.
8. Offre, CGU/CGV et position sur les droits musicaux validées.
9. Une salle pilote (idéalement un centre concurrent migré) a tourné **2 semaines** en conditions
   réelles.

## 8. Décisions à prendre (Enzo)

1. **D2** : SSE + REST pour le temps réel (recommandé) ou WebSocket ?
2. **Inscription par QR** : la décision du 4 novembre dit « seul le backoffice inscrit les joueurs ».
   La page du QR fait partie du backoffice (lien signé limité à une partie) : on confirme que ça
   respecte la décision ?
3. **Formats de partie** : quels formats proposer (ex. 4 manches × 5 questions ≈ 30 min,
   7 × 7 ≈ 60 min) ? À caler avec les durées mesurées sur le banc.
4. **Voix du présentateur** : voix de synthèse pré-générée (coût par contenu) ou enregistrements
   humains pour les annonces fixes seulement ?
5. **Contenu éditeur** : volume cible de questions au lancement, et qui les écrit.
6. **Salle pilote** : quel centre, et migration d'une salle concurrente ou salle neuve ?
7. **Budget du banc** : achat complet (~800-1 200 €) ou emprunt du boîtier Art-Net et d'une lyre ?
8. **Modèle commercial** : abonnement par salle, engagement, prix du kit matériel.

## 9. Risques

| Risque | Effet | Parade |
| --- | --- | --- |
| Matériel réel différent de la simulation | panne en salle, image ternie | lot 0 avant toute vente |
| Fumée qui reste allumée | sécurité | relais temporisé + arrêt d'urgence obligatoires, tests F bloquants |
| Contrat d'un centre avec le concurrent (exclusivité, préavis) | migration impossible ou litige | lecture du contrat avant chaque migration |
| Droits musicaux | litige | thèmes éditeur sans tubes, avis juridique avant blind test « tubes » |
| Chrome change ses règles (accès réseau local, Web Serial) | lumières bloquées | Chrome géré par politiques (`deploy/poste-salle`), veille sur les versions |
| Écart de « spectacle » avec un jeu Unreal | argument commercial faible | lot 5, démo vidéo comparative avant la prospection |
| Pont Art-Net bloqué par Windows | migration concurrent compliquée | signature ou Rust (D3), USB DMX comme solution par défaut |
