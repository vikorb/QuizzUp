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
npx quizzup-artnet-bridge --target 192.168.1.50 --universe 0 --port 7654 --origin https://salle.quizzup.fr
```

| Option                        | Rôle                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `--target <ip>`               | IP du nœud (unicast, recommandé) ou adresse de diffusion (ex. `192.168.1.255`)    |
| `--origin <url>`              | origine de l'écran de salle autorisée ; répétable ; ou `QUIZZUP_BRIDGE_ORIGINS`   |
| `--universe <u>`              | univers de sortie sans `--map` : `NET.SUB.UNI` (`0.0.1`) ou adresse 15 bits (`1`) |
| `--map <plage>`               | mappage `DEBUT-FIN:NET.SUB.UNI@DEPART`, répétable (voir plus bas)                 |
| `--config <fichier>`          | réglages dans un fichier JSON ; la ligne de commande reste prioritaire            |
| `--port <n>`                  | port WebSocket sur 127.0.0.1 (7654)                                               |
| `--bind <ip>`                 | IP locale d'émission (PC avec Wi-Fi + Ethernet : choisir la carte du nœud)        |
| `--timeout <ms>`              | silence du navigateur avant le noir de sécurité (1000)                            |
| `--blackout <ms>`             | durée des trames à zéro après une coupure (3000)                                  |
| `--artnet-port <n>`           | port UDP Art-Net (6454, à ne changer que pour un test)                            |
| `-h, --help`, `-v, --version` | aide en français, version                                                         |

Dans le backoffice, la salle utilise alors le pilote **`artnet-bridge`**
(`rooms.config.lighting.driver`) et, si le port n'est pas 7654,
`"bridgeUrl": "ws://127.0.0.1:<port>"` (seuls `127.0.0.1` et `localhost` sont acceptés).

### Mappage : un univers interne, plusieurs univers Art-Net

L'écran de salle envoie **un seul univers de 512 canaux** (l'univers « interne », celui des
adresses saisies dans le backoffice). Sans `--map`, il est recopié tel quel dans l'univers
`--universe`. Avec `--map`, chaque plage de canaux internes part vers l'univers Art-Net de son
choix, à partir du canal de son choix :

- `1-72:0.0.1@1` : canaux internes 1 à 72 → univers Art-Net `0.0.1` (net 0, sub-net 0,
  univers 1), canaux 1 à 72 ;
- `128-148:0.0.2@1` : canaux internes 128 à 148 → univers `0.0.2`, canaux 1 à 21 ;
- `40:0.0.3` : un seul canal ; sans `@DEPART`, il garde son numéro (canal 40).

Un **paquet ArtDMX par univers de sortie** est envoyé à chaque trame, chacun avec son propre
numéro de séquence ; les canaux non mappés valent 0. Deux plages qui écriraient sur les mêmes
canaux d'un même univers sont refusées au démarrage. Le pont affiche le plan au lancement.

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
`{ "from": 128, "to": 148, "output": "0.0.2", "start": 1 }`. Autres clés reconnues : `universe`,
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
  (protection contre le « DNS rebinding »).
- **Un seul écran de salle à la fois** : une deuxième connexion reçoit `409`.
- **Présentation obligatoire** : le navigateur envoie `hello` (version du protocole) et le pont
  répond `ack` ; sans cela, la connexion est fermée au bout de 2 s. Trames de taille, de version
  ou d'univers inattendus : connexion fermée.
- **Chien de garde fumée** : si le navigateur se tait plus de **1 s** (onglet planté, PC gelé)
  ou si la connexion se ferme, le pont envoie des trames **à zéro** sur **tous** les univers de
  sortie pendant 3 s (10 par seconde). C'est ce qui coupe la machine à fumée si l'onglet plante.
  Le noir est aussi envoyé à l'arrêt du pont (Ctrl+C, arrêt du service).
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

## Protocole navigateur → pont (version 1)

1. Message texte du navigateur : `{"type":"hello","protocol":1,"universe":0}`.
2. Réponse du pont : `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"0.1.0"}`
   ou `{"type":"error","code":"…","message":"…"}` suivi d'une fermeture (codes 4000 hello
   attendu, 4001 protocole, 4002 univers, 4003 trame invalide).
3. Trames binaires de **515 octets** : octet 0 = version (1), octets 1-2 = univers interne
   (gros-boutiste, 0 en v1), octets 3-514 = canaux 1 à 512.

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

Les tests couvrent l'encodage ArtDMX octet par octet, les mappages, la ligne de commande et le
fichier de configuration, le chien de garde (horloge manuelle), et un test d'intégration
WebSocket → UDP sur `127.0.0.1` (faux nœud Art-Net, origines refusées, client unique, noir à la
déconnexion et à l'arrêt).
