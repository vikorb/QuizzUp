# @quizzup/artnet-bridge — pont Art-Net local (facultatif)

L'écran de salle QuizzUp tourne dans Chrome ou Edge **sans rien installer** et pilote le DMX par
**Web Serial** (interface USB-DMX). Un navigateur ne sait pas envoyer d'UDP : il ne peut donc pas
parler directement à un **nœud Art-Net** (boîtier DMX sur le réseau Ethernet).

Ce pont est le **seul composant qu'un centre aurait éventuellement à installer**. Il tourne sur le
PC de la salle, reçoit les trames de l'écran de salle par WebSocket sur `127.0.0.1` et les renvoie
en paquets **ArtDMX** (UDP, port 6454) vers le nœud.

```
Chrome / Edge (écran de salle)  ──ws://127.0.0.1:7654──▶  pont  ──UDP 6454 (ArtDMX)──▶  nœud Art-Net ──▶ DMX
     pilote « artnet-bridge »                        quizzup-artnet-bridge
```

## Quand c'est inutile

- **Interface USB-DMX** (Enttec DMX USB Pro ou clone compatible) : c'est la solution
  **recommandée**. Rien à installer, pilote `usbpro` de `@quizzup/hardware`. Un câble USB de plus
  coûte moins cher qu'un service à maintenir sur le PC.
- Salle sans lumière pilotée : le mode **simulation** suffit.

Le pont ne sert que si la salle possède déjà un nœud Art-Net (ex. Showtec NET-2/3 Pocket, Enttec
ODE, DMXking eDMX) et qu'on ne veut pas le remplacer par une interface USB.

## Installation

Prérequis : **Node.js 22 LTS** (ou plus récent). Le pont n'a **aucune dépendance d'exécution**.

### Windows

1. Installer Node.js 22 LTS depuis nodejs.org (installeur `.msi`, options par défaut).
2. Copier le dossier `game/artnet-bridge` sur le PC (par exemple dans `C:\QuizzUp\artnet-bridge`).
3. Dans un terminal PowerShell ouvert dans ce dossier :
   ```powershell
   npm ci
   npm run build
   npx quizzup-artnet-bridge --help
   ```
4. Au premier lancement, Windows demande d'autoriser Node.js sur le réseau : cocher **Réseaux
   privés** (le pont envoie de l'UDP vers le nœud ; il n'écoute rien sur le réseau).

### macOS

1. Installer Node.js 22 LTS (`.pkg` de nodejs.org, ou `brew install node@22`).
2. Copier le dossier `game/artnet-bridge` (par exemple dans `~/QuizzUp/artnet-bridge`), puis :
   ```bash
   npm ci
   npm run build
   npx quizzup-artnet-bridge --help
   ```
3. macOS peut demander l'accès au **réseau local** pour Node.js (Réglages Système →
   Confidentialité et sécurité → Réseau local) : l'autoriser, sinon les paquets n'atteignent pas
   le nœud.

## Lancement

```bash
npx quizzup-artnet-bridge --origin https://salle.quizzup.fr
```

`--origin` suffit : l'IP du nœud se règle dans l'écran de salle (vue Matériel, champ « IP du nœud
Art-Net »), enregistrée dans `rooms.config.lighting.artnet` et transmise au pont à chaque
connexion. `--target` reste possible pour imposer une cible depuis la ligne de commande :

```bash
npx quizzup-artnet-bridge --target 192.168.1.50 --universe 0 --port 7654 --origin https://salle.quizzup.fr
```

| Option                        | Rôle                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `--target <ip>`               | facultatif : impose l'IP du nœud (prioritaire sur l'écran de salle), unicast ou diffusion |
| `--origin <url>`              | origine de l'écran de salle autorisée ; répétable ; ou `QUIZZUP_BRIDGE_ORIGINS`           |
| `--universe <u>`              | univers de sortie sans `--map` : `NET.SUB.UNI` (`0.0.1`) ou adresse 15 bits (`1`)         |
| `--map <plage>`               | mappage `DEBUT-FIN:NET.SUB.UNI@DEPART`, répétable (voir plus bas)                         |
| `--config <fichier>`          | réglages dans un fichier JSON ; la ligne de commande reste prioritaire                    |
| `--port <n>`                  | port WebSocket sur 127.0.0.1 (7654)                                                       |
| `--bind <ip>`                 | IP locale d'émission (PC avec Wi-Fi + Ethernet : choisir la carte du nœud)                |
| `--timeout <ms>`              | silence du navigateur avant le noir de sécurité (2500)                                    |
| `--blackout <ms>`             | durée des trames à zéro après une coupure (3000)                                          |
| `--artnet-port <n>`           | port UDP Art-Net (6454, à ne changer que pour un test)                                    |
| `--poll-broadcast <ip>`       | adresse où part la recherche de nœuds (255.255.255.255 ; ex. 192.168.1.255), réseau local |
| `-h, --help`, `-v, --version` | aide en français, version                                                                 |

**Priorité de la cible** : `--target` (ligne de commande ou fichier `--config`) > IP réglée dans
l'écran de salle > aucune. Sans cible, le pont n'envoie rien et le dit dans son journal. La cible
reçue de l'écran de salle doit être une IPv4 d'un réseau local : `10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, lien local `169.254.0.0/16` ou boucle locale `127.0.0.0/8`. Toute autre adresse
(`8.8.8.8`, …) est refusée et rien n'est envoyé. **La salle ne choisit que l'IP, dans les plages
locales, jamais le port** : l'UDP part toujours vers le port `--artnet-port` (6454), et un `port`
éventuellement présent dans le `hello` est ignoré. Sinon une page compromise pourrait faire émettre
le pont vers un autre service du réseau local (DNS 53, SNMP 161…). La plage n'est pas contrôlée
pour `--target`, choisi par l'opérateur du PC.

Quand la cible change entre deux connexions (autre IP, ou plus de cible), le pont envoie d'abord
**3 trames à zéro à l'ancienne cible** : l'UDP n'est pas garanti et un nœud garde sa dernière
valeur, fumée comprise. Un `hello` v1 (écran de salle ancien) sans `--target` remet la cible à
« aucune » : le pont n'émet jamais vers l'IP d'une salle précédente. Un second `hello` en cours de
connexion, ou une connexion refusée (écran déjà connecté), ne change rien.

**Recherche des nœuds** : l'assistant de l'écran de salle propose un bouton « Chercher les nœuds ».
Le pont diffuse un **ArtPoll** (OpCode 0x2000, ProtVer 14) vers `--poll-broadcast` (port
`--artnet-port`), collecte les **ArtPollReply** (0x2100) pendant 3 s puis renvoie la liste. Seuls les
nœuds plausibles sont gardés : IP d'un réseau local (mêmes plages que la cible), égale à l'adresse
d'où vient la réponse, ni en 127.x, ni terminée par .0 ou .255. Plafonds par poll : 64 nœuds, 16
univers par nœud, 1024 paquets traités (le reste est ignoré) ; les noms sont débarrassés de leurs
caractères de contrôle. Un nœud à plusieurs ports n'apparaît qu'une fois, avec ses univers de sortie
réunis. Un seul poll tourne à la fois (une connexion n'a qu'une réponse en attente : un poll
redemandé pendant la collecte est ignoré) et un poll lancé moins d'1 s après la fin du précédent
reçoit son résultat sans nouvel ArtPoll.

Un nœud Art-Net conforme répond à l'ArtPoll **sur le port Art-Net** (6454 ou `--artnet-port`), en
unicast vers le PC (Art-Net 4) ou en diffusion (Art-Net 3), pas au port source du pont. Pendant la
collecte, le pont ouvre donc un socket d'écoute temporaire sur ce port (`0.0.0.0`, `reuseAddr`,
refermé à la fin) et lit aussi les réponses arrivant au port source de l'ArtPoll. Si l'écoute ne
peut pas s'ouvrir (port pris par une application qui ne le partage pas), le pont le journalise et
garde le seul port source : saisir alors l'IP du nœud à la main si rien n'apparaît. Si l'ArtPoll ne
peut pas partir (réseau injoignable), le pont répond `{"type":"error","code":"poll",…}` sans
fermer la connexion.

Dans le backoffice, la salle utilise alors le pilote **`artnet-bridge`**
(`rooms.config.lighting.driver`) et, si le port n'est pas 7654,
`"bridgeUrl": "ws://127.0.0.1:<port>"` (seuls `127.0.0.1` et `localhost` sont acceptés).

### Mappage : des univers internes vers des univers Art-Net

L'écran de salle envoie jusqu'à **16 univers de 512 canaux** (les univers « internes » 0 à 15 :
celui d'un appareil se règle dans l'assistant d'installation, 0 par défaut). Sans `--map`,
l'univers interne 0 est recopié tel quel dans l'univers `--universe`, et les univers internes 1 à
15 dans les univers Art-Net suivants (`--universe` + 1, + 2…), s'ils sont reçus. Avec `--map`,
chaque plage de canaux d'un univers interne part vers l'univers Art-Net de son choix, à partir
du canal de son choix. Syntaxe : `[UNIVERS/]DEBUT-FIN:NET.SUB.UNI[@DEPART]` ; sans `UNIVERS/`,
c'est l'univers interne 0.

- `1-72:0.0.1@1` : canaux internes 1 à 72 → univers Art-Net `0.0.1` (net 0, sub-net 0,
  univers 1), canaux 1 à 72 ;
- `128-148:0.0.2@1` : canaux internes 128 à 148 → univers `0.0.2`, canaux 1 à 21 ;
- `40:0.0.3` : un seul canal ; sans `@DEPART`, il garde son numéro (canal 40) ;
- `1/1-512:0.0.5` : **univers interne 1**, canaux 1 à 512 → univers Art-Net `0.0.5`.

Un **paquet ArtDMX par univers de sortie** est envoyé à chaque trame, chacun avec son propre
numéro de séquence ; les canaux non mappés valent 0. Deux plages qui écriraient sur les mêmes
canaux d'un même univers, ou un univers Art-Net alimenté par deux univers internes, sont refusés
au démarrage. Le pont n'émet que les univers internes réellement reçus (plus le 0) : un univers
Art-Net que l'écran de salle ne pilote pas ne reçoit jamais de zéros. Un univers interne qui se
tait pendant que les autres continuent est remis à zéro ; si plus rien n'arrive, c'est le noir
de sécurité sur tous les univers. Le pont affiche le plan au lancement.

### Exemple prêt à copier : salle avec Showtec NET-2/3 Pocket

PC de la salle en `192.168.200.1`, boîtier en `192.168.200.187`, Net 0. La sortie réglée sur
Primary 1 porte les lyres (canaux internes 1 à 72), celle réglée sur Primary 2 le décodeur LED
(canaux internes 128 à 148).

```powershell
npx quizzup-artnet-bridge --target 192.168.200.187 --bind 192.168.200.1 --map 1-72:0.0.1@1 --map 128-148:0.0.2@1 --origin https://salle.quizzup.fr
```

ou, avec un fichier `salle.json` à côté du pont :

```json
{
  "target": "192.168.200.187",
  "bind": "192.168.200.1",
  "origins": ["https://salle.quizzup.fr"],
  "maps": ["1-72:0.0.1@1", "128-148:0.0.2@1"]
}
```

```powershell
npx quizzup-artnet-bridge --config salle.json
```

À vérifier sur l'écran du boîtier : la valeur **Primary** de chaque sortie est le numéro
d'univers Art-Net (base 0). Si une sortie affiche `Primary 0`, utiliser `0.0.0` pour elle. Le
réseau du PC doit être dans la même plage que le boîtier (ici `192.168.200.x`, masque
`255.255.255.0`).

Les mappages s'écrivent aussi en objets dans le fichier :
`{ "from": 128, "to": 148, "output": "0.0.2", "start": 1 }` (clé `universe` : univers interne
source, 0 par défaut). Autres clés reconnues : `universe` (sortie, sans `--map`),
`port`, `artnetPort`, `timeoutMs`, `blackoutMs`.

## Lancement au démarrage

Le pont doit tourner **avant** l'ouverture de l'écran de salle.

**Windows** : créer `C:\QuizzUp\artnet-bridge\demarrer-pont.cmd` :

```bat
@echo off
cd /d C:\QuizzUp\artnet-bridge
node dist\main.js --config salle.json
```

puis l'ajouter au démarrage : `Win + R` → `shell:startup` → y placer un raccourci vers ce fichier
(la fenêtre du terminal affiche le journal ; la réduire, ne pas la fermer). Pour un démarrage sans
session ouverte, utiliser le Planificateur de tâches (« Au démarrage », « Exécuter même si
l'utilisateur n'est pas connecté »).

**macOS** : créer `~/Library/LaunchAgents/fr.quizzup.artnet-bridge.plist` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>fr.quizzup.artnet-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/salle/QuizzUp/artnet-bridge/dist/main.js</string>
    <string>--config</string>
    <string>/Users/salle/QuizzUp/artnet-bridge/salle.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/quizzup-artnet-bridge.log</string>
  <key>StandardErrorPath</key><string>/tmp/quizzup-artnet-bridge.log</string>
</dict>
</plist>
```

puis `launchctl load ~/Library/LaunchAgents/fr.quizzup.artnet-bridge.plist` (chemin de `node` :
`which node`, `/opt/homebrew/bin/node` sur Mac Apple Silicon avec Homebrew).

## Sécurité

- **Écoute uniquement sur `127.0.0.1`** : rien n'est joignable depuis le réseau.
- **Origine vérifiée** : seules les pages des origines `--origin` peuvent se connecter (en-tête
  `Origin`, envoyé par le navigateur et non falsifiable par une page). Une connexion sans
  `Origin` est refusée. L'en-tête `Host` doit être `127.0.0.1:<port>` ou `localhost:<port>`
  (protection contre le « DNS rebinding ») ; sur le port 80, le navigateur omet le port et
  `127.0.0.1` / `localhost` seuls sont aussi acceptés.
- **Un seul écran de salle à la fois** : une deuxième connexion reçoit le message d'erreur
  `busy` puis est fermée (code 4004) ; l'écran affiche « un autre onglet est déjà connecté au
  pont ». (Un refus HTTP `409` serait vu par le navigateur comme un pont injoignable.)
- **Cible Art-Net limitée au réseau local** : l'IP reçue de l'écran de salle (protocole v2) est
  refusée hors `10/8`, `172.16/12`, `192.168/16`, `169.254/16` et `127/8` (erreur `target`,
  fermeture 4005, aucune trame envoyée), et le port UDP n'est jamais choisi par la salle. Une page
  de salle compromise ne peut donc faire émettre le pont ni vers Internet ni vers un autre port.
- **Présentation obligatoire** : le navigateur envoie `hello` (version du protocole) et le pont
  répond `ack` ; sans cela, la connexion est fermée au bout de 2 s. Trames de taille, de version
  ou d'univers inattendus : connexion fermée.
- **Chien de garde fumée** : si le navigateur se tait plus de **2,5 s** (onglet planté, PC gelé)
  ou si la connexion se ferme, le pont envoie des trames **à zéro** sur **tous** les univers de
  sortie pendant 3 s (10 par seconde). C'est ce qui coupe la machine à fumée si l'onglet plante.
  Le noir est aussi envoyé à l'arrêt du pont (Ctrl+C, arrêt du service). Le délai n'est pas plus
  court car Chrome bride les minuteurs d'un onglet masqué à environ 1 par seconde : à 1 s, la
  lumière clignoterait au noir dès que l'opérateur change d'onglet.
- **Gel pour le test de perte de signal** (`hold`) : le navigateur peut demander
  `{"type":"hold","ms":N}` (entier de **1 000 à 15 000 ms** ; sinon `{"type":"error","code":"hold",…}`
  sans fermer). Pendant le gel, le pont **garde la dernière trame** (renvoyée à plus de 1 Hz,
  comme le ferait une interface USB Pro) **sans passer au noir**, et **ignore les trames reçues**.
  À la fin du gel, ou à la déconnexion, il envoie du noir comme le chien de garde. Cela permet de
  vérifier en salle Art-Net que la machine à fumée coupe seule (relais temporisé, ou machine qui
  coupe sur perte de signal). `{"type":"release"}` met fin au gel tout de suite (noir), utilisé
  par l'arrêt d'urgence de l'écran de salle. Refusé (`error` `hold`) s'il n'y a pas de trame en
  cours ou si un gel est déjà actif.
- **Maintien des nœuds** : la dernière trame est renvoyée au moins toutes les 800 ms ; débit
  limité à ~44 trames/s par univers.
- Après le noir de sécurité, le pont **n'envoie plus rien** tant que l'écran de salle ne parle
  pas : il ne gêne pas une console lumière branchée sur le même nœud hors partie.

> ⚠️ Le chien de garde du pont **ne remplace pas** l'arrêt d'urgence physique exigé en salle
> (voir `game/hardware/README.md`) : si le PC entier s'éteint, plus aucune trame ne part et
> beaucoup de nœuds gardent la dernière valeur reçue. Régler le nœud sur « blackout en cas de
> perte de signal » quand il le permet.

### Pourquoi pas la bibliothèque `ws` ?

Le handshake WebSocket et le décodage des trames sont écrits à la main (`src/websocket.ts`,
~300 lignes, `node:http` + `node:crypto`). Le besoin est minuscule (un client local, messages de
515 octets, pas de compression) et le pont tourne sur des PC de salle sans maintenance : **zéro
dépendance d'exécution** = rien à auditer ni à mettre à jour, `npm ci` sans réseau d'exécution,
et une future version en exécutable unique (Node SEA) triviale. Le code suit la RFC 6455
(masquage obligatoire, trames de contrôle, fragmentation, codes de fermeture, limite de taille)
et il est testé avec un client brut et avec le client WebSocket intégré à Node (undici).

## Protocole navigateur → pont (`protocol` 1, `version` 1 ou 2)

1. Message texte du navigateur, v1 : `{"type":"hello","protocol":1,"universe":0}`.
   v2 (cible de la salle) :
   `{"type":"hello","protocol":1,"version":2,"universe":0,"artnet":{"target":"192.168.1.50"}}`.
   `artnet` n'est présent que si la salle a réglé une IP ; un `port` éventuel est ignoré. Un `hello`
   sans `version` est lu comme v1 : il n'apporte aucune cible (sans `--target`, la cible redevient
   « aucune »).
2. Réponse du pont : `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"0.1.0","universes":16}`
   (`universes` : nombre d'univers internes acceptés ; un ancien pont ne l'annonce pas).
   L'ack porte aussi `"features":["poll","hold"]` (capacités facultatives ; absent d'un ancien pont,
   dont l'écran de salle ne propose alors ni la recherche ni le test de gel).
   L'ack ajoute toujours la cible effective et sa provenance (aussi pour un `hello` v1) :
   `"artnet":{"target":"192.168.1.50","port":6454,"source":"room"}`. `source` vaut `cli`
   (`--target` impose), `room` (réglage de la salle) ou `none` (aucune cible, `target` est alors
   `null`) ; `port` est celui de `--artnet-port`. Un ack sans `artnet` signale un pont ancien.
   Sinon : `{"type":"error","code":"…","message":"…"}` suivi d'une fermeture (codes 4000 hello
   attendu, 4001 protocole, 4002 univers, 4003 trame invalide, 4004 écran déjà connecté, 4005
   cible Art-Net refusée, code d'erreur `target`).
3. **Recherche des nœuds** (après le `hello`, connexion active seulement ; avant, c'est un `hello`
   manquant, code 4000) : le navigateur envoie `{"type":"poll"}`, le pont répond au bout de 3 s
   `{"type":"nodes","nodes":[{"ip":"192.168.1.50","shortName":"NET-3","longName":"Showtec NET-3",
"universes":["0.0.0","0.0.1"]}]}` (`universes` : sorties DMX `net.sub.uni`, absent si aucune).
   Si l'ArtPoll ne peut pas partir : `{"type":"error","code":"poll","message":"…"}`, **sans fermer**
   la connexion (les trames DMX continuent). Pas de `status` périodique : le pont ne pousse rien
   sans demande.
   **Gel** (capacité `hold`) : `{"type":"hold","ms":15000}` → `{"type":"held","ms":15000}` (voir
   « Chien de garde fumée »), ou `{"type":"error","code":"hold","message":"…"}` sans fermer ;
   `{"type":"release"}` interrompt le gel, sans réponse.
4. Trames binaires de **515 octets** : octet 0 = version (1), octets 1-2 = univers interne
   (gros-boutiste, 0 à 15), octets 3-514 = canaux 1 à 512. Le `hello` annonce toujours
   `universe: 0` ; un univers interne supérieur à 15 ferme la connexion (4002).

Côté navigateur : `createBridgeOutput({ url })` de `@quizzup/hardware`
(`game/hardware/src/dmx/bridgeOutput.ts`).

## Dépannage

| Symptôme                                                                       | Piste                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Pont Art-Net injoignable » dans l'écran de salle                             | Le pont n'est pas lancé, ou sur un autre port (`bridgeUrl`).                                                                                                          |
| « connexion refusée » / journal « origine … non autorisée »                    | Ajouter l'adresse exacte de l'écran de salle dans `--origin` (schéma + hôte + port, ex. `http://localhost:4174` en développement).                                    |
| Chrome demande « accéder aux autres applications et services de cet appareil » | Permission **Accès au réseau local** de Chrome : cliquer **Autoriser** (une fois par site). Si elle a été bloquée : icône à gauche de l'adresse → Paramètres du site. |
| Journal « un écran de salle est déjà connecté »                                | Un autre onglet ou navigateur est ouvert sur l'écran de salle : le fermer.                                                                                            |
| « le port 7654 est déjà utilisé »                                              | Un pont tourne déjà (démarrage automatique + lancement manuel) : n'en garder qu'un.                                                                                   |
| « cible Art-Net … refusée » dans l'écran de salle                              | L'IP saisie n'est pas d'un réseau local (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x). Saisir l'IP du nœud sur le réseau de la salle.                              |
| Journal « Aucune cible Art-Net : rien n’est envoyé »                           | Ni `--target` ni IP réglée dans l'écran de salle (vue Matériel) : la saisir.                                                                                          |
| Le pont reçoit (journal « Trames reçues ») mais rien ne s'allume               | IP du nœud, plage réseau du PC, `--bind` sur la bonne carte, pare-feu (autoriser Node.js), univers du nœud (`Primary`, base 0), adresse DMX des appareils.            |
| « Envoi Art-Net impossible … EHOSTUNREACH / ENETUNREACH »                      | Câble débranché ou PC hors de la plage du nœud.                                                                                                                       |
| Lumières qui clignotent au noir toutes les secondes                            | L'écran de salle est passé en arrière-plan (onglet masqué : Chrome ralentit la page). Le garder au premier plan, en plein écran.                                      |

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (bug npm 10 sur les peers de vitest 4)
npm run build        # dist/ (exécuté par npx quizzup-artnet-bridge)
npm run lint
npm run format:check
npm run type-check   # sources + tests, puis sources en NodeNext (comme le build)
npm test             # npm run test:coverage : seuils 90 % lignes / 85 % branches
```

Les tests couvrent l'encodage ArtDMX et ArtPoll octet par octet, le décodage d'un ArtPollReply de
référence (paquets malformés ignorés), la recherche de nœuds contre un faux nœud UDP (IP non locale
filtrée, plafonds, réponses au port Art-Net ou au port source, débit limité, poll avant le `hello`
refusé, client parti, ArtDmx pendant la collecte, échec d'envoi), les mappages, les mappages, la ligne de commande et le
fichier de configuration, le chien de garde (horloge manuelle), et un test d'intégration
WebSocket → UDP sur `127.0.0.1` (faux nœud Art-Net, origines refusées, client unique, noir à la
déconnexion et à l'arrêt), et le gel (`hold` : dernière trame gardée sans noir, trames ignorées,
noir à la fin du gel et à la déconnexion, durées hors bornes refusées, horloge manuelle puis faux nœud).
