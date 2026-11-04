# QuizzUP — guide de test pas à pas (version testable)

> Pour qui : Enzo, ou toute personne qui teste QuizzUP sans être développeur.
> Durée : 10 minutes pour la démo, 30 minutes avec le matériel.
> Mis à jour le 4 novembre 2026.

## 1. Ce que contient cette version

| Brique          | Ce qu'on peut tester                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Backoffice      | Comptes, compagnies, salles et comptes de salle, thèmes, questions, extraits audio, parties    |
| Écran de salle  | Connexion de la salle, partie reçue du backoffice, blind test éclair, podium, reprise après F5 |
| Moteur de jeu   | Blind test éclair : paliers 1 s / 5 s / 20 s, 100 / 50 / 20 points, premier buzz juste gagne   |
| Audio           | Extraits joués au palier près (Web Audio), sons d'interface                                    |
| Matériel        | Buzzers (clavier, carte manette), lumières USB DMX, fumée sécurisée, arrêt d'urgence           |
| Données de démo | Une compagnie, une salle, un compte de salle, deux thèmes blind test de 10 extraits chacun     |

Les extraits de démo sont **fabriqués par calcul** (`scripts/demo/generate-demo-audio.py`) :
des mélodies du domaine public jouées note par note, et des sons du quotidien synthétisés.
Aucun enregistrement tiers : ils sont libres de droits, on peut les jouer en public.

## 2. Installer (une seule fois)

1. Installer **Docker Desktop** : <https://www.docker.com/products/docker-desktop/>, le lancer
   et attendre qu'il indique « Engine running ».
2. Installer **Git** (<https://git-scm.com/download/win>) et **Node.js 22**
   (<https://nodejs.org>, version LTS).
3. Ouvrir un terminal (PowerShell) et récupérer le projet :

   ```powershell
   git clone https://github.com/vikorb/QuizzUp.git
   cd QuizzUp
   ```

Navigateur : **Chrome ou Edge** (les seuls qui pilotent l'USB DMX et les manettes).

## 3. Lancer QuizzUP (une commande)

```powershell
npm run demo
```

Le premier lancement prend **3 à 6 minutes** (téléchargements, installation, base de données,
données de démo). Les suivants prennent quelques secondes. Ensuite :

| Adresse                      | Quoi                             |
| ---------------------------- | -------------------------------- |
| <http://localhost:4173>      | Backoffice                       |
| <http://localhost:4174>      | Écran de salle                   |
| <http://localhost:3001/docs> | Documentation de l'API (Swagger) |

Autres commandes utiles :

| Commande             | Effet                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| `npm run demo:logs`  | Voir ce qui se passe (Ctrl+C pour quitter, QuizzUP continue de tourner) |
| `npm run demo:stop`  | Arrêter QuizzUP (les données sont gardées)                              |
| `npm run demo:reset` | **Tout effacer** (base et extraits) ; le prochain `demo` repart à neuf  |

Pour récupérer une nouvelle version : `git pull` puis **`npm run demo`** à nouveau (il
reconstruit ce qui a changé ; les données sont gardées).

Si une page ne s'ouvre pas tout de suite, attendre une minute puis recharger : le premier
démarrage installe encore des dépendances (`npm run demo:logs` pour suivre).

## 4. Comptes de démo

| Rôle                           | Identifiant   | Mot de passe   | Où se connecter |
| ------------------------------ | ------------- | -------------- | --------------- |
| Gérant du centre (admin)       | `demo-admin`  | `Demo1234!`    | Backoffice      |
| Compte de la salle « Salle 1 » | `salle1-demo` | `Demo1234!`    | Écran de salle  |
| Superadmin (éditeur)           | `admin`       | `ChangeMe123!` | Backoffice      |

Compagnie de démo : **QuizzUP Démo**. Thèmes blind test : **Mélodies du domaine public**
(Frère Jacques, Ode à la joie, Lettre à Élise…) et **Sons synthétiques** (sirène de pompiers,
SOS en morse, carillon…).

## 5. Parcours A — essai express, sans compte (2 minutes)

1. Ouvrir <http://localhost:4174>, cliquer **« Essayer en mode démo (sans compte) »**.
2. Cliquer **« Lancer la salle »** (plein écran ; `Échap` pour en sortir).
3. Lobby : saisir un pseudo sur les pupitres 1 et 2. Le format **« Partie courte · 3 manches
   × 3 questions »** est déjà choisi. Cliquer **« Démarrer la partie »**.
4. Jouer au clavier (tableau ci-dessous). Le joueur désigné choisit le thème avec A-D ;
   pendant un palier, le premier qui buzze répond seul avec A-D.

| Pupitre | A   | B   | C   | D   |
| ------- | --- | --- | --- | --- |
| 1       | `1` | `2` | `3` | `4` |
| 2       | `A` | `Z` | `E` | `R` |
| 3       | `Q` | `S` | `D` | `F` |
| 4       | `W` | `X` | `C` | `V` |

Ce sont les touches d'un clavier **AZERTY** ; Chrome et Edge affichent à l'écran les lettres
de votre clavier.

En mode démo, les extraits sont des petites mélodies synthétisées à la volée (pas les thèmes
du backoffice) ; l'inscription des joueurs se fait directement sur l'écran.

À vérifier : annonce du mini-jeu → choix du thème → paliers 1 s / 5 s / 20 s → révélation →
bilan de manche → podium final.

## 6. Parcours B — une vraie partie, du backoffice à la salle (10 minutes)

C'est le parcours d'un centre : le staff inscrit les joueurs et lance la partie au
backoffice, la salle la reçoit et la joue. Ouvrir le backoffice et l'écran de salle dans deux
fenêtres (ou sur deux PC).

1. **Backoffice** <http://localhost:4173> : se connecter avec `demo-admin` / `Demo1234!`.
2. Menu **Ma compagnie** : section **Salles** ; « Salle 1 » et son compte de salle existent
   déjà (on peut créer d'autres salles et leur compte ici).
3. Menu **Thèmes** : « Mélodies du domaine public » et « Sons synthétiques ». Dans **Questions /
   Réponses**, modifier une question audio : les boutons d'écoute jouent l'extrait. (Pour tester
   l'envoi : ajouter une question audio, envoyer un MP3 ou OGG de moins de 10 Mo et cocher
   l'attestation de droits.)
4. Menu **Parties → « Lancer une partie »** : salle « Salle 1 », par exemple 2 manches × 2
   questions ; participant 1 sur le pupitre 1, **« Ajouter un participant »** pour le pupitre 2
   (nom ; email facultatif avec la case de consentement ; **« Ajouter un 2e joueur »** pour un
   duo sur le même pupitre). Cliquer **« Lancer la partie »** : elle apparaît **En attente**.
5. **Écran de salle** <http://localhost:4174> : se connecter avec `salle1-demo` /
   `Demo1234!`, cliquer **« Lancer la salle »**. L'écran **« Partie du jour »** affiche
   « Partie prête : 2 manches × 2 questions » et les joueurs par pupitre (chaque appui buzzer
   fait briller son pupitre). Sans partie, il affiche « En attente d'une partie » et la
   détecte tout seul dès qu'elle est lancée au backoffice.
6. Cliquer **« Démarrer la partie »** (« Préparation des extraits… » le temps du
   préchargement), puis jouer comme au parcours A. Cette fois **on entend les extraits du
   backoffice**, et le joueur désigné choisit entre les deux thèmes de démo.
7. Au backoffice, **Parties** : la partie passe **En cours** dès le démarrage dans la salle.
   Elle **reste « En cours » après le podium** : l'envoi des résultats au backoffice n'est pas
   encore fait. Utiliser **Arrêter** pour libérer la salle avant la partie suivante.

À vérifier en plus :

- **Reprise** : recharger la page (F5) en pleine partie → « Reprendre la partie » repart au
  bon endroit, l'extrait reprend.
- **Focus** : cliquer hors de la fenêtre → une alerte plein écran prévient que les buzzers
  ne sont plus reçus.
- **Son** : au premier palier on doit entendre 1 seconde exactement, puis 5, puis 20.
- **Backoffice coupé** (`npm run demo:stop` puis relance) : le lobby affiche « Backoffice
  injoignable » avec un bouton « Réessayer ».

> Si un extrait n'a pas pu être préchargé (réseau coupé au chargement), il reste muet pendant
> la partie : c'est voulu, la partie ne doit jamais attendre un téléchargement.

## 7. Parcours C — le vrai matériel (30 minutes)

C'est la partie la plus délicate : on la teste par étapes, du plus simple au plus risqué.
Tout se règle dans l'écran de salle, bouton **« Matériel de la salle »** (écran de
lancement), puis les onglets **Buzzers**, **Lumières et fumée**, **Configuration avancée**.
Connectée avec un compte de salle, la configuration est enregistrée **sur le compte de la
salle** (en base), avec une copie de secours sur le PC ; en mode démo, sur le PC seulement.

> Pas encore d'interface DMX ? Tout le parcours C2 se teste en **Simulation** : la « salle
> simulée » montre ce que feraient les projecteurs et la fumée.

### C1. Buzzers

Les buzzers du commerce se présentent au PC comme un **clavier** ou comme une **manette**
(cartes type Leo Bodnar, utilisées dans les salles déjà équipées).

1. Brancher le boîtier des buzzers en USB.
2. Onglet **Buzzers → « Associer les buzzers »** : l'écran demande chaque buzzer, pupitre par
   pupitre (« Appuie sur le buzzer A du pupitre 1 »). Appuyer sur le bon buzzer, et ainsi de
   suite. « Passer ce buzzer » s'il en manque un.
3. **« Enregistrer l'association »**, puis zone **Test des buzzers** : chaque appui allume le
   bon bouton du bon pupitre.
4. Refaire une partie courte (parcours A ou B) avec les vrais buzzers.

À vérifier : deux appuis quasi simultanés → c'est bien le premier qui a la main ; une touche
déjà utilisée ou réservée au système est refusée avec un message clair.

### C2. Lumières (sans risque)

1. Onglet **Lumières et fumée** avec la sortie **Simulation** : la « salle simulée » montre
   les appareils déclarés. Tester les scènes (Début de partie, Buzz, Bonne réponse, Victoire…)
   et choisir le pupitre pour les scènes « spot sur le pupitre ».
2. Brancher une **interface DMX USB Pro** (Enttec ou compatible : c'est le modèle recommandé ;
   les « Open DMX » sans microcontrôleur sont expérimentales) reliée à un projecteur PAR.
3. **Configuration avancée** : déclarer l'interface et les appareils (exemple ci-dessous,
   adresses DMX à adapter à celles réglées sur les appareils), **Enregistrer**. Les erreurs
   (adresses qui se chevauchent, profil inconnu…) s'affichent dans « Points à corriger ».
4. Onglet **Lumières et fumée → « Connecter l'interface DMX »** : Chrome affiche la liste des
   ports série, choisir l'interface. Le statut passe à « connectée ».
5. **« Identifier »** sur un appareil : il doit clignoter. Puis tester les scènes, puis une
   partie complète : le spot suit le pupitre qui buzze, vert sur bonne réponse, rouge sur
   mauvaise, célébration au podium.

```json
{
  "version": 1,
  "lighting": {
    "driver": "usbpro",
    "fixtures": [
      {
        "id": "par1",
        "name": "PAR pupitre 1",
        "profileId": "par-rgbw",
        "address": 1,
        "desk": 1
      },
      {
        "id": "par2",
        "name": "PAR pupitre 2",
        "profileId": "par-rgbw",
        "address": 5,
        "desk": 2
      },
      {
        "id": "fumee",
        "name": "Fumée",
        "profileId": "smoke-relay",
        "address": 40
      }
    ],
    "smoke": {
      "enabled": true,
      "maxDurationMs": 3000,
      "cooldownMs": 30000,
      "requireConfirmation": true
    }
  }
}
```

### C3. Fumée et arrêt d'urgence (avec précaution)

> ⚠️ **Avant tout test de fumée** : un **arrêt d'urgence physique** qui coupe l'alimentation
> de la machine à fumée et des lumières doit être en place et à portée de main. Le bouton à
> l'écran ne le remplace pas : si le PC plante, plus rien n'est envoyé. Salle aérée, détecteurs
> incendie prévenus ou neutralisés selon les règles du lieu.

1. Déclarer la machine (`smoke-relay` pour un relais tout ou rien, `smoke` pour une machine
   DMX) avec `"enabled": true` (voir l'exemple ci-dessus).
2. Onglet **Lumières et fumée → Fumée** : cocher **« Fumée autorisée pour cette session »**,
   puis **« Tester 2 s »**. La fumée doit s'arrêter seule au bout de 2 s.
3. Relancer tout de suite : refus « Pause de sécurité » (pause minimale entre deux émissions).
4. **Arrêt d'urgence** (bouton à l'écran) : tout s'éteint, la fumée est coupée et désarmée.
   « Rallumer les lumières » rallume l'ambiance, mais la fumée doit être **réarmée à la main**.
5. Sécurités automatiques à vérifier : pendant une émission, passer sur un autre onglet → la
   fumée est coupée ; débrancher l'USB → statut « en erreur » et fumée coupée.

À noter : beaucoup d'appareils gardent la dernière valeur reçue quand le signal DMX disparaît.
Préférer une interface ou un relais qui **coupe la fumée en cas de perte de signal**, ou une
machine avec temporisation matérielle.

## 8. Recette en ligne (sur un serveur)

Pour tester depuis le PC d'une vraie salle, QuizzUP peut tourner sur un petit serveur (VPS,
environ 5 € par mois) en **HTTPS**, nécessaire pour l'USB DMX hors du PC local. Tout est
prêt dans `deploy/recette/` (procédure complète dans son `README.md`). Il faut :

1. **Créer le serveur** chez un hébergeur (Hetzner CX22 ou OVH VPS, Ubuntu 24.04, 4 Go de RAM
   conseillés), ports 80 et 443 ouverts.
2. Donner à Claude **l'adresse IP** et un **accès SSH** (ou suivre soi-même le README : 5
   commandes à copier-coller).
3. Pas besoin de nom de domaine : avec l'IP `51.15.12.34`, les sites seront
   `https://bo.51-15-12-34.sslip.io`, `https://salle.51-15-12-34.sslip.io` et
   `https://api.51-15-12-34.sslip.io`.

Les mots de passe des comptes de démo sont alors ceux choisis dans `deploy/recette/.env`.

## 9. Vérifications automatiques (développeurs)

Depuis la racine, après les installations décrites dans `CLAUDE.md` :

```bash
(cd backoffice && npm run lint && npm run type-check && npm test)   # backoffice
(cd game/engine && npm ci && npm test)                              # moteur
(cd game/hardware && npm ci && npm test)                            # matériel
(cd game/audio && npm ci && npm test)                               # audio
(cd game/room-app && npm ci && npm test && npm run build)           # écran de salle
(cd game/e2e && npm ci && npx playwright install chromium && npm test)  # bout en bout
```

Au 4 novembre 2026 sur `main` : 1 363 tests unitaires verts (backoffice 772, moteur 234,
matériel 134, audio 81, écran de salle 142), build de l'écran de salle OK ; les tests de bout
en bout tournent dans la CI GitHub.

## 10. Limites connues de cette version

- **Un seul mini-jeu à l'écran** : le blind test éclair. Le moteur en connaît déjà 13 autres
  (réponse rapide, vrai/faux, quitte ou double…), leurs écrans sont en cours.
- **Pupitres** : 4 par défaut, 6 au maximum. Le nombre se règle par salle dans l'écran Matériel (onglet Buzzers) ; le backoffice ne propose que les pupitres de la salle choisie.
- **Résultats** : la partie reste « En cours » au backoffice après le podium (scores et fin de
  partie pas encore renvoyés par la salle).
- **Ports en local seulement** : `npm run demo` n'est joignable que depuis le PC qui le lance
  (mots de passe de démo publics). Pour tester depuis un autre appareil : la recette en ligne.
- **Lumières réseau (Art-Net)** : impossibles depuis un navigateur ; il faudra un petit pont
  local. En attendant : interface **USB DMX Pro**.
- **Conservation des emails 3 ans** : texte RGPD à valider.
- Données de démo : un `npm run demo:reset` efface aussi les parties jouées.

## 11. Signaler un problème

Noter : le parcours (A, B ou C) et l'étape, ce qui était attendu, ce qui s'est passé, le
navigateur, et si possible une capture d'écran. Pour les erreurs techniques, joindre la fin de
`npm run demo:logs` et la console du navigateur (F12 → Console).
