# @quizzup/e2e — tests de bout en bout

Tests **Playwright dans Chromium** qui jouent une vraie partie de **blind test éclair**, comme en
salle : clavier de simulation des buzzers, son réellement joué, lumières en simulation DMX.
Objectif : attraper les régressions que les tests unitaires de chaque paquet ne voient pas
(contrats entre moteur, écran de salle, audio et matériel).

## Ce qui est testé

| Fichier                                   | Cible                                                              | Ce qu'on vérifie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/room-app/room-login.spec.ts`       | écran de salle                                                     | Connexion avec le compte de salle (API du backoffice simulée), session gardée au rechargement, déconnexion ; refus des mauvais identifiants, d'un compte du staff (déconnecté aussitôt) et message « API injoignable ».                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/room-app/full-game.spec.ts`        | écran de salle (mode démo)                                         | Lobby RGPD (buzzer qui fait briller son pupitre, email refusé sans consentement, email jamais affiché), partie courte 3 × 3 jouée au clavier, points 100 / 50 / 20, « Personne n'a trouvé », bilans de manche, podium final, sauvegarde effacée à la fin. Arrêt de partie confirmé.                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/room-app/single-instance.spec.ts`  | écran de salle                                                     | Un seul onglet par poste : le second onglet du même navigateur affiche « QuizzUp est déjà ouvert sur ce PC » sans démarrer la salle, le premier reste utilisable, un onglet seul se recharge sans se croire bloqué, fermer le premier démarre le second tout seul.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/room-app/remote-commands.spec.ts`  | écran de salle + bouchon de l’API                                  | Commandes à distance du personnel reçues par le flux : pause puis reprise pendant une question, refus d’un `skip` périmé, accusés relevés par le bouchon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/room-app/blind-test-rules.spec.ts` | écran de salle + moteur                                            | Règles validées par Enzo : tout le monde joue en même temps, une erreur ne bloque **que pour le palier**, on passe au palier suivant **seulement si personne n'a trouvé** (tous faux, ou fenêtre de buzz écoulée).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/room-app/hardware-dmx.spec.ts`     | écran « Matériel » (`/hardware`)                                   | Config de salle en JSON (2 PAR), sortie simulée, scène « buzz » sur le pupitre 2 (PAR à sa couleur, l'autre baissé), arrêt d'urgence = tout éteint et scènes bloquées, réarmement confirmé.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/room-app/hardware-bridge.spec.ts`  | écran « Matériel » + **vrai pont Art-Net** + faux nœud UDP         | Pont repris **sans clic** au démarrage des lumières et après un rechargement ; pont absent : bandeau « Connecter le pont » puis reprise au clic ; arrêt d'urgence **maintenu après un rechargement** (seules des trames noires partent) jusqu'au réarmement.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/room-app/mini-games.spec.ts`       | écran de salle (mode démo)                                         | Chacun des 10 mini-jeux (réglage `quizzup_room_mini_games`) : une manche jouée au clavier, bonne réponse d'Alice à chaque question, mise, vol de points, élimination en mort subite, bilan de manche. Une capture par étape.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/room-app/demo-audio.spec.ts`       | écran de salle (mode démo, son réel)                               | Extraits démo synthétisés en Web Audio, mesurés en sortie : l'extrait joue pendant l'écoute du palier, silence pendant la fenêtre de buzz, coupé au buzz, repris après une erreur, arrêté sur une bonne réponse. Horloge réelle (le son suit l'horloge audio).                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tests/room-app/endurance.spec.ts`        | écran de salle (mode démo) + **vrai pont Art-Net** + faux nœud UDP | 3 parties courtes de suite sans recharger la page (graine fixe, horloge figée) : scores remis à zéro, aucune erreur de console ; trames DMX lues **à l'envoi par la page** (sonde sur `WebSocket.send`) : la dernière trame de chaque partie, de retour au lobby, égale la trame de repos relevée avant la première partie (non nulle), des trames différentes du repos pendant chaque partie, une trame par tick des lumières ; plus d'extrait en lecture ; mêmes extraits démarrés d'une partie à l'autre ; minuteries, intervalles et contextes audio sans dépasser le départ, écouteurs / nœuds (+5 % au plus) et tas (+10 Mo) mesurés par CDP après ramasse-miettes. |
| `tests/harness/blind-test-audio.spec.ts`  | banc audio (moteur + pont + Web Audio)                             | **Son réel** mesuré en sortie : démarre et s'arrête à 1 s, 5 s, 20 s (± 150 ms), respecte le point de départ de l'extrait, se coupe au buzz, reprend après une erreur, s'arrête sur une bonne réponse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/harness/dmx-simulation.spec.ts`    | banc lumières (moteur + buzzers + DMX)                             | Boucle DMX ~30 trames/s, scènes buzz / bonne / mauvaise réponse / victoire, PAR du pupitre qui a buzzé à sa couleur, arrêt d'urgence = noir complet, réarmement, fumée activée mais non armée : déclenchement refusé (`not_armed`), canal fumée toujours à 0 ; un second PAR sur l'univers 1 (même adresse que celui de l'univers 0) suit le pupitre sans toucher à l'univers 0, et l'arrêt d'urgence éteint les deux univers.                                                                                                                                                                                                                                            |

### Écran de salle

Playwright démarre `game/room-app` (`npm run dev`, port 4174) avec
`VITE_API_URL=http://api.quizzup.test` : les routes `/login`, `/me` et `/logout` du backoffice
sont simulées dans le test (`tests/support/fakeApi.ts`).

L'**horloge de la page est figée** (`page.clock`) : le temps de jeu n'avance que quand le test le
demande. Les paliers, fenêtres de buzz et délais d'affichage sont donc exacts, et une partie
complète se joue en une vingtaine de secondes. Les buzzers sont de vrais appuis clavier
(enfoncé + relâché) sur le clavier de simulation : pupitre 1 = `1 2 3 4`, 2 = `Q W E R`,
3 = `A S D F`, 4 = `Z X C V` (touches physiques). Pour savoir quelle réponse est juste, le test
relit le contenu de la partie que la salle sauvegarde dans `localStorage`.

### Frontend du backoffice (`tests/backoffice/`, `tests/room-app/join-qr.spec.ts`)

Playwright démarre aussi `backoffice/frontend` (`npm run dev`, port **4176**, même
`VITE_API_URL`). Il lit `@quizzup/shared` construit : `npm --prefix ../../backoffice/shared run build`
avant le premier lancement (et après un changement de `shared`, sinon la page reste blanche).
Aucune API ni base : les appels sont interceptés (`tests/support/fakeBackoffice.ts` pour le
frontend, `fakeApi.ts` pour la salle), avec les réponses du contrat `openapi.yaml`.

- `join-qr.spec.ts` (projet `room-app`) : le lobby du personnel affiche le QR et le lien
  d'inscription ; un contexte mobile (Pixel 7) ouvre ce lien, lit le jeton dans le fragment et
  envoie exactement `{ token, displayName }` ; le lobby relit la partie et affiche « 1 inscription
  en attente de validation », puis le joueur à son pupitre une fois validé (validation simulée par
  le bouchon). Le bouchon rend le flux d'un bloc et chaque `hello` fait relire la partie : la
  réception de `game_updated` n'est **pas** prouvée ici, elle l'est par les tests unitaires
  (`roomLive.test.ts`, `StaffGameLobby.test.ts`, `liveJoinRegistrations.test.ts`).
- `backoffice/join-refusals.spec.ts` : page téléphone, code inconnu (« Lien invalide »), adresse
  sans code (« Lien invalide », aucune requête envoyée), inscriptions closes, inscriptions complètes à l'envoi, avec le message traduit.
- `backoffice/results-print.spec.ts` : feuille de résultats d'une partie terminée. À l'écran, le
  bouton « Imprimer » appelle `window.print` ; en `emulateMedia({ media: 'print' })`, boutons
  masqués, classement et bon valable (QR, code) visibles, bon utilisé absent.

### Pont Art-Net réel (`tests/support/artnetBridge.ts`)

Le test lance le **vrai** pont (`game/artnet-bridge/src/server.ts`, importé tel quel : il n'a aucune
dépendance, rien à installer ni à compiler) dans le processus Playwright, avec un faux nœud
Art-Net (socket UDP sur 127.0.0.1) qui garde les paquets ArtDMX reçus. L'écran de salle s'y
connecte par WebSocket comme en salle (origine `http://localhost:4174` autorisée).

Le test d'endurance **ne tire aucune mesure de la sortie du pont** : celle-ci suit l'horloge réelle
de Node (regroupement à 22 ms, keepalive toutes les 800 ms, chien de garde après 2,5 s de silence),
alors que la page a son horloge figée. Le pont et le faux nœud n'y servent qu'à donner une sortie à
la salle. Limites : les animations du podium (confettis) ne sont pas couvertes, le projet impose
`reducedMotion: 'reduce'` ; écouteurs et nœuds sont comparés au lobby **après la première partie**
(au premier lancement, Vite charge les écrans de jeu et injecte leurs styles : +18 balises
`<style>`), donc une fuite née dans la première partie échappe à ces deux mesures (minuteries,
intervalles, contextes audio et tas sont comparés au départ).

### Banc d'essai (`harness/`)

Pour mesurer les paliers au milliseconde près avec un vrai fichier audio et lire les trames DMX,
de petites pages assemblent les **vrais paquets** dans Chromium (`npm run harness`, port 4175) :

- `audio.html` : moteur `@quizzup/game-engine` + pont audio de l'écran de salle
  (`room-app/src/audio/audioBridge.ts`) + `WebAudioExtractPlayer` de `@quizzup/audio`. Un
  moniteur double chaque connexion vers les haut-parleurs vers un analyseur : on mesure le son
  qui sort vraiment, pas les appels de fonctions.
- `dmx.html` : moteur + `createKeyboardBuzzerInput` + `createLightingController` de
  `@quizzup/hardware` sur la sortie simulée (un PAR RGB par pupitre, une machine à fumée DMX, un PAR du fond sur l'univers 1).

### Extrait libre de droits

L'extrait est **synthétisé par le test** (`tests/support/freeExtract.ts`) : un accord d'orgue en
La majeur, en WAV PCM. Aucune œuvre ni enregistrement, donc aucun droit à gérer, et rien de
binaire dans le dépôt. Il est muet pendant les 2 premières secondes et la question démarre à
2 s : si le point de départ était ignoré, le palier 1 serait muet et le test échouerait.

### Captures d'écran

Les scénarios des mini-jeux joignent une capture par étape au rapport Playwright. Avec
`E2E_CAPTURES_DIR=<dossier>`, elles sont aussi écrites dans `<dossier>/mini-jeux/<nn>-<mini-jeu>/`.

## Commandes

```bash
npm install                     # .npmrc : legacy-peer-deps (comme les autres paquets game/)
npm --prefix ../room-app install
npm --prefix ../../backoffice/shared install
npm --prefix ../../backoffice/shared run build
npm --prefix ../../backoffice/frontend install
npx playwright install chromium # navigateur de test (une fois)

npm test                        # lance les trois serveurs Vite puis tous les tests
npm run test:headed             # avec le navigateur visible
npm run test:ui                 # mode interactif Playwright
npm run report                  # dernier rapport HTML
npm run harness                 # banc d'essai seul : http://localhost:4175/audio.html
npm run lint
npm run format:check
npm run type-check
```

Les tests audio (`*-audio.spec.ts`, banc et écran de salle) forment un projet Playwright à part (`audio`), lancé seul après les autres pour
que les mesures au son réel ne partagent pas le CPU ; si un test des autres projets échoue, ils
sont ignorés (corriger d'abord l'échec, ou lancer `npx playwright test --project=audio`).

En CI (job `e2e` de `.github/workflows/ci.yml`), un échec publie le rapport Playwright, les
traces, captures et vidéos en artefact `playwright-report`.
