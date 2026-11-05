> **Suivi (2026-11-05)** : lots faits : L1-L5, L8-L10, L12, L13 (PR #105 à #115).
> En attente de décision : L6, L7, L11, L14. Ce document est l'audit du 2026-11-04 ; les numéros
> de ligne cités sont ceux de `7227393` et ont pu bouger depuis.

# Conception — partie salle (comptes, config, spots, buzzers, lien navigateur ↔ matériel local)

> Base : `origin/main` @ `7227393` (4 nov. 2026). Chemins relatifs à la racine du dépôt.
> Abréviations : `hw` = `game/hardware/src`, `ra` = `game/room-app/src`, `be` = `backoffice/backend/src`.

## 1. État actuel

### 1.1 Comptes de salle
- Rôle `room` (`backoffice/shared/src/index.ts:272`), un compte = une salle (`room_id`). Création
  depuis le backoffice : `be/routes/companies/rooms/account.ts`, schéma `_schemas.ts:68-76`
  (identifiant + mot de passe, pas de code d'appairage).
- JWT valable 365 j (`be/routes/auth.ts:10,109`), session **sans expiration d'inactivité**
  (`be/plugins/auth.ts:71-76`). Coupure : compte supprimé ou désactivé, compagnie désactivée
  (`plugins/auth.ts:93-102`).
- Côté salle, le jeton est dans `localStorage` (`quizzup_room_token`, `ra/utils/auth.ts:8,51-56`).

### 1.2 Où vit la config de salle
| Lieu | Contenu | Réf. |
|---|---|---|
| **Backend** `rooms.config` (jsonb, défaut `{}`) | `RoomHardwareConfig` v1 : `desksCount`, `buzzers{keymap,source}`, `lighting{driver,bridgeUrl,refreshHz,fixtures,customProfiles,deskColors,bindings,smoke}` | `backoffice/docs/db/db.dbml:156-161`, `hw/config.ts:44-53` |
| **localStorage** du poste | copie de secours `quizzup_room_hardware` + méta `quizzup_room_hardware_sync` `{accountId, tokenTag, pending}` | `ra/hardware/roomHardware.ts:56-57,74-83,503-507` |
| **Fichier local** `salle.json` / CLI du pont | cible Art-Net, `--bind`, mappage univers interne → univers Art-Net, origines | `game/artnet-bridge/README.md:62-128` |
| **Code** | profils génériques et preset 6 pupitres | `hw/dmx/profiles.ts` (`GENERIC_PROFILES`), `hw/presets/sixDeskRoom.ts:58-91` |
| **Navigateur** | permission Web Serial, accès au réseau local (LNA) | profil Chrome, rien dans le code |

Autres clés locales de la salle : `quizzup_room_game` (sauvegarde de partie, `ra/game/session.ts:43`),
`quizzup_room_pending_finishes`, `quizzup_room_mini_games`, `quizzup_room_backoffice_game`.

### 1.3 Qui écrit la config, versionnage, validation
- **Écriture par le PC de salle** : écran Matériel ou assistant → `saveRoomHardwareConfig`
  (`roomHardware.ts:679-693`), qui applique, copie en local et envoie (file ordonnée,
  `pushHardwareConfig` `:633-671`) via `PUT /room/config` (`ra/utils/roomApi.ts:131`).
- **Côté serveur**, `PUT /room/config` (`be/routes/room.ts:127-163`) fusionne les clés de premier
  niveau (`:150`). Le client envoie toujours la config complète, donc chaque section est remplacée.
- **Écriture par le backoffice** : `POST` et `PATCH /companies/:id/rooms` acceptent `config` en
  **remplacement total** (`be/routes/companies/rooms/id.ts:102`). Aucune interface ne l'édite :
  la liste des salles affiche seulement « renseignée ou non » (`frontend/.../RoomsTable.vue:27-32`).
- **Lecture** : `GET /room/me` (`room.ts:105`). Au démarrage, `syncHardwareWithRoom`
  (`ra/hardware/hardwareSync.ts:45-102`) garde la copie locale si elle appartient au même compte
  et qu'elle est en attente d'envoi, ou si le compte est vierge (`:92-95`). Sinon, la config
  distante est appliquée. Une copie venant d'un autre compte n'est jamais envoyée (empreinte FNV
  du jeton, `:16-23`).
- **Versionnage** : `version: 1` est écrit (`hw/config.ts:15,248`) mais jamais lu pour une
  migration. Pas de révision ni de contrôle de concurrence : le dernier qui écrit gagne.
- **Validation** : serveur minimal (zod `record<string,unknown>` ≤ 20 000 caractères, `desksCount`
  1..6 : `_schemas.ts:13,38-43`). Client tolérant : `parseRoomHardwareConfig` (`hw/config.ts:190-264`)
  ramène tout à des valeurs par défaut et liste les problèmes, sans blocage. La sécurité fumée
  ne dépend pas de la config : les bornes dures sont dans `hw/lighting/smoke.ts:11-16`.

### 1.4 Comment le navigateur parle au matériel
| Lien | API | Réf. |
|---|---|---|
| Buzzers « clavier » (encodeur USB HID) | `keydown` sur `KeyboardEvent.code`, Keyboard Lock en plein écran | `hw/buzzers/keyboardBuzzerInput.ts:82-110`, `keyboardLock.ts` |
| Buzzers « carte manette » (BU0836, Zero Delay) | Gamepad API, lecture toutes les 4 ms, `Gamepad.timestamp` | `hw/buzzers/gamepadBuzzerInput.ts:84,239` ; filtre `match` bien transmis (`roomHardware.ts:149`) |
| DMX USB (Enttec Pro et clones, Open DMX) | **Web Serial**, trame USB Pro label 6 ; reprise du port autorisé sans clic ; surveillance du rebranchement | `hw/dmx/serialOutput.ts:29,68,381` ; `roomHardware.ts:306-355` |
| Art-Net | **WebSocket** `ws://127.0.0.1:7654` vers le pont Node, puis UDP ArtDMX ; trames binaires de 515 octets ; `hello` / `ack` | `hw/dmx/bridgeOutput.ts:30,101,122,167` ; `game/artnet-bridge/src/server.ts:144-165`, `protocol.ts` |
| Boucle DMX | `setInterval` à 30 Hz sur le thread principal ; chien de garde de 500 ms ; fumée coupée si l'onglet est masqué | `hw/lighting/lightingController.ts:20,26,591,602-619` |

Sécurité du pont : écoute sur 127.0.0.1 seulement, liste d'origines autorisées, contrôle de
`Host` (protection contre le DNS rebinding), un seul client (code 4004), noir après 2,5 s de silence.

### 1.5 Simulé ou réel
- **Réel, codé, jamais validé sur du matériel** : buzzers clavier et manette, USB Pro
  (Open DMX expérimental), pont Art-Net (testé seulement contre un faux nœud UDP), test de gel.
  REPRISE §4.3 : tests sur TERMIVAVOR2 à faire.
- **Simulé** : pilote `simulation` (salle à l'écran, `getFixtureViews`), `createSimulatedBuzzerInput`,
  clavier de simulation (`ra/hardware/buzzers.ts`), banc Playwright `game/e2e/harness/dmx.html`.
- **Absent** : plusieurs univers (`DMX_CHANNELS = 512`, un seul univers rendu,
  `hw/dmx/fixtures.ts:104-120` ; le pont v1 refuse tout autre univers que 0, `protocol.ts:25`),
  roue de couleurs et gobo pilotés (`fixtures.ts:94-96`, preset spot avec la roue figée sur
  `fixed 0`, `sixDeskRoom.ts:66`), découverte des nœuds Art-Net, service worker (le manifeste
  seul existe, `game/room-app/index.html:7`), verrou contre plusieurs onglets.

## 2. Faiblesses et risques en salle réelle

| # | Gravité | Risque | Constat / réf. |
|---|---|---|---|
| R1 | **Critique** | Machine à fumée **DMX** (profil `smoke-dmx`, sans relais) : une interface USB Pro répète la dernière trame si le PC plante, donc la fumée continue. | Les cases de `SMOKE_CHECKS` (`hw/setup/setupWizard.ts:110`) supposent un relais temporisé ; le profil `smoke-dmx` reste autorisé (`profiles.ts`). |
| R2 | **Élevée** | Avec le pont, le **test de gel est refusé** : le relais temporisé n'est jamais vérifié en salle Art-Net. | `hardware/README.md`, section « Diagnostic » ; le pont envoie du noir quand le navigateur se tait. |
| R3 | **Élevée** | **Après un redémarrage, le pont n'est pas repris sans clic** : `bridgeConnected` n'existe qu'en mémoire, donc au rechargement la salle reste en simulation jusqu'à un clic. | `roomHardware.ts:272,313-317` |
| R4 | **Élevée** | **Permissions perdues ou demandées en kiosque** : popups Web Serial et LNA sans souris. Clones CH340 sans numéro de série : permission à refaire au rebranchement (à vérifier). | `connectDmxInterface` exige un geste (`:460-478`) ; aucun kit de politiques Chrome. |
| R5 | **Élevée** | **Arrêt d'urgence non mémorisé** : si la page plante ou se recharge après un arrêt d'urgence, l'ambiance lumineuse revient (la fumée reste désarmée). | `pendingEmergency` en mémoire seulement (`roomHardware.ts:244,416-423`). |
| R6 | **Élevée** | **Poste Windows** : la mise en veille sélective USB coupe l'interface DMX ; veille, notifications et redémarrages Windows Update prennent le focus ou coupent la session. | Rien n'est prévu, ni doc ni script. |
| R7 | **Élevée** | **Rechargement en pleine partie sans Internet** : page blanche (pas de cache de l'application), alors que la sauvegarde de partie est en local. | `index.html:7`, aucun service worker. Hors partie, le lancement exige de toute façon le backoffice. |
| R8 | **Moyenne-élevée** | **Plusieurs onglets ou fenêtres** : deux moteurs ; la carte manette est lue par les deux ; Web Serial « busy » ; le pont répond 4004 ; la sauvegarde `quizzup_room_game` est partagée. | Aucun `navigator.locks` ni `BroadcastChannel` dans `ra/`. |
| R9 | **Moyenne** | **Équité des buzzers clavier** : l'appui est horodaté par `clock.now()` dans le handler, pas par `event.timeStamp`. Un ralentissement du thread principal (rendu, décodage audio) décale l'appui, et peut changer le palier 1 s / 5 s / 20 s attribué. L'encodeur USB ajoute environ 8 ms de gigue (sondage à 125 Hz). | `keyboardBuzzerInput.ts:83` |
| R10 | **Moyenne** | **Perte de focus** : avec la source clavier, plus aucun buzz n'arrive (une alerte s'affiche). La source manette n'est pas concernée. | README du paquet hardware ; `useWindowFocus.ts` |
| R11 | **Moyenne** | **Concurrence de config** : le dernier qui écrit gagne, en silence (deux PC sur le même compte, ou `PATCH` du backoffice qui remplace tout). | `room.ts:150`, `id.ts:102` |
| R12 | **Moyenne** | **Config Art-Net en deux endroits** : adresses dans `rooms.config`, cible et mappage dans `salle.json` sur le poste. Un changement d'IP ou de câblage oblige à aller sur le PC. | `artnet-bridge/README.md:96-128` |
| R13 | **Moyenne** | **Pont à installer** : Node 22, `npm ci`, raccourci de démarrage à la main ; pas d'exécutable ni de mise à jour. | `artnet-bridge/README.md:26-55,130-171` |
| R14 | **Moyenne** | **Un seul univers** : bloque les installations de plus de 512 canaux et une interface à 2 sorties. Les salles 6 pupitres tiennent dans un univers (lyres 1-72, LED 128-148). | `fixtures.ts:104-120`, `bridgeOutput.ts:71-72` |
| R15 | **Moyenne** | **Bibliothèque de fixtures pauvre** : 9 profils ; pas de rôle roue de couleurs, gobo, shutter, vitesse ; pas d'inversion pan/tilt. Les lyres spot restent en blanc. | `profiles.ts`, `sixDeskRoom.ts:58-74` |
| R16 | **Moyenne** | **Calibrage des lyres grossier** : curseurs 0-65535 au pas de 257 (8 bits effectifs), sans réglage fin au clavier ou aux buzzers, sans copie de position. | `ra/views/hardware/SetupAssistant.vue:225-251` |
| R17 | Faible | Onglet masqué : minuteurs bridés à environ 1 s, clignotement au noir côté pont, fumée coupée. Le mode kiosque l'évite. | `lightingController.ts:602-619` |
| R18 | Faible | `version` jamais migrée ; validation serveur minimale. Tolérable tant que les ajouts sont **additifs**. | `config.ts:15`, `_schemas.ts:38-43` |
| R19 | Faible | Taille plafonnée à 20 000 caractères : suffit aujourd'hui (une salle 6 pupitres fait environ 4 ko), limite si les profils sur mesure se multiplient. | `_schemas.ts:13` |

Points déjà solides, à garder : fumée (bornes dures, armement humain, chien de garde, test de
gel, relais de 10 s exigé), reprise du port USB autorisé, file d'envoi de la config, copie de
secours liée au compte, réserve de pupitres, égalités tournantes sur la carte manette.

## 3. Architecture cible : lien navigateur ↔ matériel local

### 3.1 Options comparées
| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **A. Navigateur direct** (Web Serial, Gamepad, clavier ; WebHID) | Rien à installer ; déjà codé et testé ; latence minimale | Pas d'UDP ; gestes et permissions ; sensible au focus et aux onglets masqués ; Chrome et Edge seulement | **Base, à durcir** |
| **B. Agent local** = pont Art-Net étendu (WebSocket sur 127.0.0.1) | Art-Net, sACN, plusieurs univers ; chien de garde indépendant de l'onglet ; zéro dépendance | Un programme à installer et à mettre à jour ; LNA à autoriser | **Option pour les salles Art-Net, unique point d'extension** |
| C. Application de bureau (Electron, Tauri) | Focus, UDP, série et mises à jour maîtrisés | **Exclue par Enzo** ; installeur, signature et mises à jour à maintenir | Non |
| D. Passerelle ESP32 / MQTT | Buzzers à LED, matériel durci, chien de garde matériel | Firmware C++, broker MQTT, fabrication et stock de boîtiers | Plus tard, seulement si des buzzers à LED sont demandés |

### 3.2 Recommandation : « navigateur d'abord, un seul agent facultatif sans état »
1. **Chemin par défaut inchangé** : USB DMX Pro par Web Serial et buzzers par la Gamepad API.
   Pour les nouvelles salles, recommander les encodeurs **en mode manette**, qui ne dépendent pas
   du focus. Le clavier reste pour les salles déjà câblées. WebHID n'est pas retenu : la Gamepad
   API couvre le besoin (YAGNI).
2. **Durcir le poste plutôt qu'écrire du code** : un kit de politiques Chrome et Edge
   - `SerialAllowUsbDevicesForUrls` (VID:PID des interfaces DMX) : plus de popup Web Serial ;
   - `LocalNetworkAccessAllowedForUrls` : plus de popup LNA ;
   - `AutoplayAllowlist`, notifications bloquées ;
   - raccourci `--kiosk`, veille sélective USB, veille et mises à jour Windows réglées.
   Le kit corrige R4, R6 et R10 sans code applicatif.
3. **Pont v2 = l'agent de salle, sans état** : il ne garde **que** `--origin`, et `--port` si besoin.
   Le navigateur lui envoie la config Art-Net (cible, `bind`, mappage, univers), tirée de `rooms.config`.
   - **Protocole** : WebSocket `ws://127.0.0.1:7654`, la même socket qu'aujourd'hui.
     Contrôle en JSON :
     - `hello{protocol:2, artnet:{target,bind?,maps}, universes:[…]}` et sa réponse `ack` ;
     - `status` toutes les secondes : nœuds vus, trames envoyées, erreurs ;
     - `poll` puis `nodes` : ArtPoll et réponses ;
     - `hold{ms}` : test de gel, le pont **gèle** au lieu de passer au noir.

     Données : trames binaires d'en-tête 3 octets, univers 0..N.
     La v1 reste acceptée.
   - **Sécurité** : on garde le bind sur la boucle locale, la liste d'origines, le contrôle de
     `Host` et le client unique. On ajoute : cible Art-Net limitée aux réseaux **privés ou link-local**
     (le pont ne doit pas servir de canon UDP), débit borné (déjà fait). Pas de jeton d'appairage :
     la frontière de confiance est le PC, et l'origine suffit contre une page tierce.
   - **Découverte** : port fixe 7654 (repli : `bridgeUrl`), puis ArtPoll côté pont pour proposer
     le nœud dans l'assistant.
   - **Appairage** : rien à saisir sur le poste. La liste d'origines par défaut contient l'origine
     de production. L'assistant détecte le pont, puis le nœud.
   - **Repli** : pont injoignable ou fermé → simulation + bandeau « Pont Art-Net absent » + fumée
     coupée, ce qui existe déjà. Reconnexion automatique sans clic (R3) ; l'interface USB reste
     possible en parallèle.
   - **Livraison** : un exécutable unique (Node SEA) avec démarrage automatique, produit en CI.
4. **Buzzers et USB DMX restent dans le navigateur** : les passer dans l'agent demanderait des
   modules natifs (`serialport`, `node-hid`), donc la fin du « zéro dépendance », pour un gain
   faible.
5. **Une seule instance par poste** : verrou Web Locks (`navigator.locks`, `ifAvailable`) qui
   englobe le moteur, les buzzers et les lumières.

### 3.3 Où stocker quoi
| Donnée | Lieu | Règle |
|---|---|---|
| Config de salle : pupitres, keymap, source, fixtures, positions, liaisons, paramètres fumée, **config Art-Net** (cible, mappage) | `rooms.config` (jsonb) **+ colonne `config_revision` int** | Source de vérité partagée. `PUT` avec `revision` : 409 si elle est périmée. Ajouts additifs = version 1 conservée. |
| Copie de secours, envoi en attente, arrêt d'urgence verrouillé, partie en cours, scores à envoyer, jeton | `localStorage` du poste | Propre au poste, jamais envoyé ailleurs (sauf la file existante) |
| Permissions Web Serial et LNA | Profil Chrome + **politiques** | Hors application |
| Fumée armée | **Mémoire seulement** | Toujours réarmée à la main (inchangé) |
| Profils de fixtures génériques | **Code** (`hw/dmx/profiles.ts`), versionné et testé | Enrichi par PR |
| Profils propres à une salle | `rooms.config.lighting.customProfiles` | Inchangé |
| Bibliothèque commune par compagnie | Table dédiée **plus tard** | Seulement quand deux clients partagent un même modèle (YAGNI) |
| Agent / pont | Rien d'autre que `--origin` | Sans état, remplaçable |

## 4. Plan de lots (ordonné, faisable en cloud)

Légende : **[E]** = décision d'Enzo requise ; **[M]** = validation finale sur du vrai matériel.

**L1 — Verrou mono-onglet** (S)
- Objectif : une seule instance par poste ; un second onglet affiche « QuizzUp est déjà ouvert sur ce PC ».
- Fichiers : `ra/hardware/singleInstance.ts` (nouveau, `navigator.locks.request(..., {ifAvailable:true})`),
  `ra/App.vue` ou `LaunchView.vue`, i18n fr/en.
- Tests : unitaire avec un faux `navigator.locks` ; e2e Playwright avec 2 pages du même
  contexte (la 2e est bloquée, pas de 2e moteur).
- Fin : la 2e page ne démarre ni les buzzers, ni les lumières, ni le moteur.

**L2 — Horodatage des buzzers clavier par `event.timeStamp`** (S)
- Fichiers : `hw/buzzers/keyboardBuzzerInput.ts:83`, le fichier de test associé.
- Tests :
  - `at` = `event.timeStamp` si l'événement est plus ancien que `now` ;
  - repli sur `clock.now()` si la valeur vaut 0, est absente ou se trouve dans le futur ;
  - ordre de deux appuis avec handler retardé.
- Fin : un ralentissement de 100 ms simulé ne change pas le palier attribué.

**L3 — Arrêt d'urgence verrouillé au rechargement** (S)
- Fichiers : `ra/hardware/roomHardware.ts` (clé `quizzup_room_emergency`, posée dans
  `triggerEmergencyStop`, effacée au réarmement humain, relue dans `createLighting`).
- Tests : unitaire (rechargement → contrôleur créé en arrêt d'urgence avant la 1re trame) ;
  composant HardwareView.
- Fin : arrêt d'urgence puis rechargement → noir, réarmement manuel obligatoire.

**L4 — Pont repris sans clic après redémarrage** (S)
- Fichiers : `roomHardware.ts:306-318`. Si `driver==='artnet-bridge'` et que la simulation n'a
  pas été choisie, tenter `useBridge` au démarrage ; en cas d'échec, bandeau « Connecter le pont ».
- Tests : faux WebSocket (pont présent, absent, `busy`) ; e2e avec le vrai pont lancé par Playwright.
- Fin : rechargement → lumières sur le pont sans clic, quand le pont tourne.

**L5 — Révision de config et conflit 409** (M)
- Fichiers :
  - migration `rooms.config_revision` ;
  - `be/routes/room.ts` (`PUT` avec `revision`, 409 avec la config courante ; `GET /room/me`
    renvoie la révision) ;
  - `id.ts` (`PATCH` incrémente) ;
  - `hardwareSync.ts` et `roomHardware.ts` (sur 409 : appliquer la config distante et prévenir) ;
  - `openapi.yaml`, `db.dbml`, CHANGELOG.
- Tests : backend (mockDb + test PG de la migration aller-retour) ; room-app (409 → config
  distante appliquée, pas de boucle de renvoi).
- Fin : deux postes du même compte ne s'écrasent plus en silence.

**L6 — Kit « poste de salle » Windows** (M) **[E] [M]**
- Objectif : `deploy/poste-salle/` avec `.reg` Chrome et Edge (Serial, LNA, autoplay,
  notifications), raccourci kiosque, PowerShell (veille sélective USB, veille, heures actives
  Windows Update, démarrage du pont), ajout au guide de recette.
- Tests : script de contrôle (`.reg` bien formé, VID:PID cohérents avec `DMX_USB_VENDOR_IDS`).
- Fin : poste rebooté → salle en plein écran, DMX connecté, aucun popup.
- [E] : Chrome ou Edge ? Windows Pro ou Home ? Certaines politiques peuvent exiger un poste géré.
  [M] : validation sur TERMIVAVOR2.

**L7 — Garde-fous fumée : relais obligatoire et test de gel avec le pont** (M) **[E] [M]**
- Objectif : fumée activable seulement avec un profil à relais (`binary`), sauf case explicite
  « la machine coupe sur perte de signal » ; message `hold{ms}` du pont pour geler sans passer
  au noir, ce qui rend le test de gel possible en Art-Net.
- Fichiers : `hw/setup/setupWizard.ts`, `hw/config.ts`, `lightingController.ts` (diagnostic),
  `artnet-bridge/src/bridge.ts`, `protocol.ts`, `SetupAssistant.vue`, `DiagnosticPanel.vue`.
- Tests :
  - assistant : `smoke-dmx` refusé ;
  - pont : `hold` sans noir, puis noir à la fin du gel ou à la déconnexion (horloge manuelle) ;
  - intégration avec un faux nœud.
- Fin : en Art-Net, le test de gel est faisable et vérifie le relais.

**L8 — Plusieurs univers** (M-L) **[M]**
- Fichiers : `FixtureConfig.universe` (défaut 0), rendu et chevauchements par univers
  (`fixtures.ts`), `DmxOutput.write(data, universe)`, USB limité à l'univers 0 (problème signalé
  sinon), pont acceptant les univers 0..15, choix de l'univers dans l'assistant.
- Tests : rendu, `parseRig`, encodage des trames, intégration du pont avec 2 univers vers un faux
  nœud, e2e banc DMX.
- Fin : des appareils sur 2 univers sortent sur 2 univers Art-Net. Config v1 toujours relue
  (ajout additif).

**L9 — Pont protocole v2 : config Art-Net depuis `rooms.config`** (M) **[M]**
- Fichiers : `lighting.artnet{target,bind?,maps}` (`hw/config.ts`), `bridgeOutput.ts`
  (`hello` v2), `artnet-bridge/src/protocol.ts`, `options.ts`, `bridge.ts`. Cible limitée aux
  plages privées ou link-local ; la CLI reste prioritaire ; la v1 reste acceptée.
- Tests : protocole v1 et v2, cible publique refusée, mappage reçu appliqué (faux nœud UDP).
- Fin : le pont tourne avec `--origin` seul ; changer l'IP du nœud se fait depuis l'écran Matériel.

**L10 — Découverte ArtPoll et état du nœud** (M) **[M]**
- Fichiers : `artnet-bridge/src/artnet.ts` (ArtPoll et décodage d'ArtPollReply),
  `bridge.ts` (`poll` / `nodes` / `status`), assistant (étape interface : liste des nœuds).
- Tests : encodage et décodage octet par octet ; faux nœud qui répond ; `status` périodique.
- Fin : l'assistant propose le nœud trouvé sans saisie d'IP.

**L11 — Exécutable unique du pont et démarrage automatique** (M) **[E] [M]**
- Fichiers : script `build:sea`, job CI `windows-latest` (construction + `--version` + test
  WebSocket), tâche planifiée générée par le kit L6.
- Tests : job CI.
- Fin : un `.exe` téléchargeable depuis la CI.
- [E] : signature de code (SmartScreen), coût d'un certificat.

**L12 — Bibliothèque de fixtures enrichie** (M) **[M]**
- Rôles ajoutés : `colorWheel` avec emplacements `{value, rgb}` (couleur la plus proche),
  `shutter` / `gobo` (valeur d'ouverture), `speed` ; `invertPan` / `invertTilt` et plage sur
  l'appareil. Profils génériques de lyres 9, 11 et 16 canaux ; le preset spot passe sur `colorWheel`.
- Fichiers : `hw/dmx/profiles.ts`, `fixtures.ts`, `presets/sixDeskRoom.ts`, éditeur de profil
  (`AdvancedConfig.vue`).
- Tests : rendu par rôle, couleur la plus proche, parse des profils sur mesure.
- Fin : les spots du preset 6 pupitres prennent la couleur du pupitre. [M] : valeurs de roue
  à relever sur la notice.

**L13 — Calibrage fin des lyres** (M) **[M]**
- Objectif : réglage au clavier ou aux buzzers (pas grossier ou fin, 16 bits), lyre en direct
  pendant le réglage, copie d'une position vers un autre pupitre, inversion.
- Fichiers : `hw/setup/setupWizard.ts`, `SetupAssistant.vue`.
- Tests : modèle de l'assistant (pas, bornes, inversion), composant.
- Fin : calibrage complet d'une lyre sans souris.

**L14 — Démarrage hors Internet : cache de l'application** (M) **[E]**
- Objectif : service worker minimal (build en cache) pour qu'un rechargement en pleine partie
  reprenne la sauvegarde locale et la file des scores. Ni contenu ni lancement hors ligne.
- Fichiers : `ra/main.ts`, `vite.config.ts`, `public/sw.js` (sans dépendance).
- Tests : e2e Playwright `context.setOffline(true)` puis rechargement → partie reprise.
- [E] : le mode hors ligne est classé V2 ; ce sous-ensemble évite R7.

**Différés (YAGNI, à rouvrir sur mesure ou demande)**
- Boucle DMX dans un Worker : seulement si le diagnostic mesure des trames bloquées sur le vrai PC.
- WebHID et ESP32/MQTT : seulement pour des buzzers à LED.
- Code d'appairage du compte de salle : seulement si la saisie du mot de passe en salle pose
  problème **[E]**.
- Table de bibliothèque de fixtures par compagnie.
- sACN.

**Ordre conseillé** : L1 → L2 → L3 → L4 (sûreté et fiabilité rapides, sans décision), puis L5,
puis L6 et L7 (après décision d'Enzo), puis L8 → L9 → L10 → L11 (chaîne Art-Net), puis L12 →
L13, et L14 selon la décision. L1 à L5 et L8 à L10 : simulation et faux nœud suffisent pour finir
en cloud. La validation finale sur TERMIVAVOR2 (REPRISE §4.3) regroupe tous les **[M]** en une
seule séance.
