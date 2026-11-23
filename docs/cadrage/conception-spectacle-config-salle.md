# Lot 5 « spectacle » et configuration de salle plus rapide : conception

## Recommandation

1. **Lumières.** On ne crée pas de module « show » à côté de l'existant : on étend `scenes.ts` et `scenePlayer.ts`, qui ont déjà des pas, des fondus, des priorités et une fumée qui passe par la sécurité. Trois ajouts suffisent : les scènes réglables par salle (`lighting.scenes`), l'enchaînement de scènes (`next`) et quelques clés d'événement de plus. On corrige aussi quatre défauts trouvés en lisant le code.
2. **Écrans et voix.** L'habillage se fait en CSS, avec un seul Canvas 2D pour le podium. La voix est un pack de 48 annonces fixes par langue, en fichiers statiques servis par la même origine que l'écran de salle. Le mécanisme se livre tout de suite et reste muet tant que les fichiers manquent.
3. **Configuration de salle.** La détection et les modèles de salle restent des propositions que l'opérateur confirme. L'export et l'import passent par un fichier JSON versionné. L'import n'active jamais la fumée. Le même garde-fou doit fermer un trou qui existe déjà dans l'éditeur JSON avancé. Côté serveur, un lot de sécurité à part refuse aussi l'activation de la fumée par l'API du personnel (arbitrage 10).

Je changerais d'avis dans trois cas :

- si le test G6 montre que le DOM ne tient pas 60 i/s : PixiJS pour les seuls effets (D4) ;
- si le banc montre des lyres trop lentes pour les flashs de buzz : il faudrait un délai de visée dans les scènes par défaut ;
- si des centres demandent des shows sur mesure : il faudrait un éditeur visuel (hors V1).

---

## A. Spectacle

### 1. État de l'existant

**Lumières.** `game/hardware/src/lighting/scenes.ts` (`DEFAULT_SCENES`, `DEFAULT_BINDINGS`) est joué par `scenePlayer.ts`. `lightingController.ts` (`handleGameEvent` → `resolveEvent`) le pilote. L'écran de salle le relie dans `game/room-app/src/hardware/roomHardware.ts` (`onGameEvents` → `controller.handleGameEvent`).

| Événement (clé)                                                | Scène                                          | Priorité |
| -------------------------------------------------------------- | ---------------------------------------------- | -------- |
| `game_started`                                                 | `game-start` (3 flashs violets, puis ambiance) | 20       |
| `round_started`                                                | `round-start` (pareil pour tous les mini-jeux) | 20       |
| `round_chooser_selected`                                       | `chooser` (spot sur le pupitre)                | 20       |
| `question_started`                                             | `question`                                     | 10       |
| `blind_test_stage_started` / `_resumed`                        | `clip-playing`                                 | 10       |
| `buzzer_pressed`                                               | `buzz`                                         | 30       |
| `answer_correct` / `answer_wrong`                              | `answer-correct` / `answer-wrong`              | 40       |
| `question_lost` (clé dérivée de `question_ended` sans gagnant) | `question-lost`                                | 40       |
| `round_ended`                                                  | `round-end`                                    | 20       |
| `game_ended`                                                   | `victory` (fumée 3 s si armée)                 | 50       |
| `game_aborted`                                                 | `idle`                                         | 0        |

- Pas disponibles : `color`, `flash`, `blackout`, `smoke`, `wait`.
- Une scène se termine en gardant son dernier état. Une scène de priorité plus basse n'interrompt pas la scène en cours.
- La fumée de scène passe par `fireSmoke` : armement, durée maximale, temps de repos, onglet masqué, et refus d'une fumée en retard (`LATE_SMOKE_TOLERANCE_MS`).
- Arrêt d'urgence : `playScene` refuse toute scène et le contrôleur envoie du noir à chaque trame.
- La reprise après rechargement ne réémet pas les événements (`GameSession.resume` rejoue sans les listeners) : aucune fumée ne repart au rechargement.

**Sons.** `game/room-app/src/audio/uiSoundBridge.ts` joue :

- `buzz`, `correct`, `wrong` ;
- `tierUp` à partir du 2e palier ;
- `lostForAll` sur une question perdue ;
- `reveal` en fin de manche.

Le son `tick` existe dans `UI_SOUND_NAMES` mais n'est branché nulle part. Il n'y a ni voix, ni musique de fond, ni son de début de partie ou de victoire.

**Écrans.** Les animations existantes :

- `RoundIntroScreen` (révélation) ;
- `Leaderboard` (lignes qui glissent) ;
- `BlindTestScreen` (égaliseur) ;
- `TimerBar` (transform linéaire).

Les phases changent par une chaîne `v-if` dans `GameView.vue`, sans `<Transition>`. Une règle globale `prefers-reduced-motion` existe dans `main.css`, mais elle ne couvre pas un Canvas.

**Défauts trouvés en lisant le code** (rien de prouvé en salle) :

1. **Stroboscopes allumés en continu.** Les appareils de type `strobe` reçoivent toutes les scènes ciblées `all`. Le canal strobe vaut toujours 0, donc un stroboscope devient une lampe blanche fixe à 30 % pendant toute la partie.
2. **Salle éteinte au buzz.** Quand aucun appareil n'est affecté au pupitre, la cible `desk` est vide et `others` vaut « tout » : le buzz et la victoire assombrissent toute la salle.
3. **Lumière du buzz suivant perdue.** `buzz` (30) est refusé pendant `answer-wrong` (40, environ 1,6 s). En blind test, quand un autre joueur buzze juste après une erreur, sa lumière ne part pas.
4. **Victoire en égalité vide.** Sur une égalité finale, `victory` reçoit `desk: null` : les flashs ne visent aucun appareil.
5. **Pause sans effet sur le matériel.** La pause (`pauseGame`, fusionnée dans `main` avec la PR #131) ne touche ni les lumières ni la fumée. Un jet en cours va jusqu'à sa durée maximale (point « pause pendant un jet » de `REPRISE.md` §2). Ce défaut est actif aujourd'hui : la coupure de la fumée à la pause part dans un lot de sécurité à part (arbitrage 12).
6. **Clés inconnues effacées.** `parseRoomHardwareConfig` reconstruit la config champ par champ. Une clé inconnue est donc effacée par un poste resté sur une version plus ancienne : risque dès qu'on ajoute `lighting.scenes`.
7. **Taille de config plafonnée.** `ROOM_CONFIG_MAX_LENGTH` vaut 20 000 caractères côté serveur. On ne peut pas recopier tout le show dans la config.
8. **Faille de sécurité : fumée activable sans contrôles.** `AdvancedConfig.vue` enregistre le JSON collé tel quel. `parseRoomHardwareConfig` ne rejoue que la règle du relais, pas les quatre vérifications humaines (`SMOKE_CHECKS`). On peut donc passer `smoke.enabled` à vrai sans arrêt d'urgence coché ni test de gel. Ce trou existe déjà et l'import l'élargirait. Il existe aussi côté serveur : `PATCH /companies/:companyId/rooms/:id` accepte un `config` libre, que la salle relit ensuite. Un lot de sécurité à part le ferme (`smoke_config_forbidden`, arbitrage 10). Tant qu'il n'est pas livré, la garde de l'écran de salle ne protège que l'écran de salle.

### 2. Show lumière scénarisé par événement

**Modèle (ajouts à l'existant).**

- `SceneDefinition.next?: string` : scène lancée à la fin. Une scène qui se désigne elle-même boucle. Une boucle est une chaîne `next` qui revient sur elle-même.
- `lighting.scenes?: SceneDefinition[]` dans `rooms.config` : surcharges par `id`. On n'y stocke que les scènes modifiées ou ajoutées, jamais une copie du show complet, à cause de la limite de 20 000 caractères. `lighting.bindings` reste la table événement → scène, déjà en place.
- Clés d'événement en plus dans `resolveEvent` :
  - `round_started.<miniGame>`, avec repli sur `round_started` ;
  - `game_ended_tie` quand il y a plusieurs gagnants ;
  - des signaux émis par l'écran de salle et jamais par le moteur : `game_paused`, `game_resumed`, `session_exit`.

  Ces signaux passent par `handleGameEvent`, dont le type `HardwareGameEvent` vaut `{ type: string }`. Ils n'entrent jamais dans le moteur ni dans `game_events`. La liste exportée s'appelle `SHOW_CUES`.

- Nouveau fichier `game/hardware/src/lighting/showConfig.ts`, fonction `parseScenes`. Il relit de façon tolérante, comme `parseRig`, et reporte les problèmes dans `problems`. Bornes :

| Élément                         | Borne                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Scènes                          | 24 au plus                                                                          |
| Pas par scène                   | 16 au plus                                                                          |
| Flash, `onMs` et `offMs`        | 60 ms au moins chacun                                                               |
| Flash, période                  | 334 ms au moins (3 éclairs/s au plus ; décision n° 3 ci-dessous)                    |
| Flash, durée d'un pas           | 5 s au plus                                                                         |
| Boucle                          | 200 ms au moins (sinon boucle infinie à durée nulle)                                |
| Priorité d'une scène de salle   | ramenée dans 0..60                                                                  |
| Priorité d'une scène qui boucle | 10 au plus                                                                          |
| Pas `smoke`                     | un seul par scène, interdit dans une boucle, durée ramenée dans `SMOKE_HARD_LIMITS` |
| `identify`                      | ne se surcharge pas                                                                 |

Le plafond de 3 éclairs par seconde vaut pour toutes les scènes : livrées, réglées par salle et boucles. Les scènes `buzz`, `answer-correct` et `victory` livrées le dépassent aujourd'hui (environ 7 éclairs par seconde au buzz). Elles sont ralenties dans un lot de sécurité à part, qui part tout de suite (arbitrage 11).

**Priorités (règle actuelle conservée : une priorité égale ou plus haute interrompt).**

| Niveau | Scènes                                                                          |
| ------ | ------------------------------------------------------------------------------- |
| 0      | `idle`                                                                          |
| 10     | `question`, `clip-playing`, boucles                                             |
| 15     | `exit`, `exit-off`                                                              |
| 20     | `game-start`, `round-start`, `chooser`, `round-end`                             |
| 40     | `buzz` (corrige le défaut 3), `answer-correct`, `answer-wrong`, `question-lost` |
| 50     | `victory`, `victory-tie`                                                        |
| 60     | `pause`                                                                         |
| 90     | `identify`                                                                      |

L'arrêt d'urgence n'est pas une scène : il reste un verrou au-dessus de tout, inchangé. La scène `pause` (fondu de 400 ms vers une ambiance basse) se termine vite. La scène `question`, liée à `game_resumed`, peut donc partir à la reprise.

**Pause.** Au signal `game_paused`, l'écran de salle appelle `lighting.smoke.stop()` (lot de sécurité à part, sans dépendance à H2, arbitrage 12) puis joue `pause` (RA5). Pendant la pause, le moteur n'émet rien.

**Show par défaut valable sur tout profil.**

- On garde les cibles sémantiques (`all`, `desk`, `others`). La couleur est déjà convertie par profil : RVB, RVBW, roue de couleurs, gradateur seul.
- Correction 1 : `strobe` est exclu des pas `color` et `flash`, sauf si la cible nomme l'appareil.
- Correction 2 : un pupitre sans appareil fait que `desk` vaut « tout » et `others` vaut « rien ».
- Correction 4 : scène `victory-tie` en `all`.
- La fumée par défaut reste sur `victory` seulement (décision n° 4 ci-dessous).

**Cadence et charge.** On garde la boucle à `refreshHz` (30 Hz par défaut, bornée de 10 à 40). Le calcul se fait d'après le temps écoulé, donc il rattrape un gel. Le coût est de l'ordre de appareils × 1 pas par trame : négligeable. On mesure avec l'outil existant : `createMeteredOutput` (`measuredHz`, échecs) dans l'onglet Diagnostic.

**Correction 6.** `parseRoomHardwareConfig` doit recopier telles quelles les clés inconnues, à la racine et dans `lighting`, au lieu de les effacer.

### 3. Scène de sortie réglable

**Ce que c'est.** En fin de session, la salle passe en lumière blanche chaude et forte, lyres en position de repos, sans stroboscope ni fumée, pour que les joueurs voient la sortie.

**Où ça se règle.** Dans `lighting.exit` (facultatif) :

- `enabled` (vrai par défaut, décision n° 5) ;
- `delayMs` : 10 000 après la fin de la victoire ;
- `holdMs` : 300 000 ;
- `intensity` : 1 ;
- `color` : blanc chaud.

La fonction `exitScene(settings)` génère la scène `exit` (priorité 15). Ses pas : attente `delayMs`, fondu de 3 s, attente `holdMs`, fondu vers `idle`.

**Quand ça part.**

- Par `victory.next = 'exit'` (et `victory-tie`).
- Directement sur `game_ended_incomplete` (fin de partie faute de contenu).
- Au clic sur un bouton secondaire « Lumière de sortie » du podium (`FinishedScreen.vue`, qui appelle `playScene('exit')`).

`game_aborted` reste sur `idle` : le personnel est là et décide.

**Quand ça s'arrête.**

- À la fin de `holdMs`.
- Sur `game_started` (20 > 15).
- Au bouton « Éteindre la sortie », qui joue `exit-off` (15, fondu vers l'ambiance).
- À l'arrêt d'urgence ou à l'arrêt des lumières.

Si `enabled` vaut faux, aucune scène ne s'enchaîne après la victoire.

### 4. Habillage des écrans (D4, sans moteur 3D)

Classé du plus rentable au moins rentable :

1. **Révélation de la réponse** (`RevealScreen.vue`, `AnswerGrid.vue`) : les mauvaises réponses s'estompent (opacity), la bonne grossit légèrement (transform) dans la couleur du pupitre gagnant, en 250 ms. C'est le seul néon autorisé à ce moment. Environ 100 occurrences par partie.
2. **Score qui monte** (`ScoreBoard.vue`) : compteur de 400 ms par `requestAnimationFrame`, annulé au démontage, et « +100 » qui monte et s'efface. Composable `useTweenedNumber` dans `game/room-app/src/composables/`.
3. **Compte à rebours** (`TimerBar.vue`) : nouvelle prop `remainingMs`. Sous 3 s, la barre passe en `warn` et pulse, et le son `tick` part à 3, 2 et 1 s (`playUiSound('tick')`). Les écrans `BuzzQuestionScreen`, `AnswerAllScreen`, `BetScreen` et `BlindTestScreen` passent la valeur.
4. **Transitions de phase** (`GameView.vue`) : `<Transition mode="out-in">` sur la clé de phase, fondu et glissé de 160 à 250 ms.
5. **Classement animé et podium** :
   - `Leaderboard.vue` : `<TransitionGroup>` pour le reclassement (FLIP natif de Vue), révélation du 3e au 1er ;
   - `FinishedScreen.vue` : `components/game/Confetti.vue`, en Canvas 2D, 150 particules au plus aux couleurs des pupitres, 4 s, puis la boucle s'arrête et le canvas est retiré.
6. **Intro de manche** (`RoundIntroScreen.vue`) : icône `@mdi/js` du mini-jeu. Les vidéos pré-rendues (D4) attendent le résultat de G6.

**Budget mesurable.**

- Seules `transform` et `opacity` sont animées : pas de `box-shadow`, `filter` ni `backdrop-filter`.
- Un seul Canvas, actif au podium seulement.
- Aucune boucle `requestAnimationFrame` hors d'une animation en cours.
- Avec `prefers-reduced-motion` : le Canvas ne démarre pas et le compteur saute directement à la valeur finale (vérifié par `matchMedia`, car la règle CSS ne couvre pas le Canvas).
- Ce qui se prouve en simulation : un test e2e d'endurance dans `game/e2e` enchaîne 3 parties courtes et relève par CDP (Playwright Chromium, `Performance.getMetrics` après `HeapProfiler.collectGarbage`) les métriques `JSEventListeners`, `Nodes` et `JSHeapUsedSize`. Critères : écouteurs et nœuds revenus à ±5 % du départ, tas en hausse de moins de 10 Mo.
- Ce qui exige le banc : 60 i/s et aucun long frame de plus de 50 ms sur le GPU intégré (G6 étendu).

### 5. Voix de présentateur

**Liste (48 clips par langue, `id` → texte fr / en).**

| `id`                        | fr                                                                                                                                                                                | en                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game.start`                | C'est parti, la partie commence.                                                                                                                                                  | Here we go, the game is starting.                                                                                                                   |
| `round.1` à `round.10`      | Manche un … Manche dix.                                                                                                                                                           | Round one … Round ten.                                                                                                                              |
| `round.last`                | Dernière manche.                                                                                                                                                                  | Final round.                                                                                                                                        |
| `minigame.<code>` (×10)     | Nom affiché du mini-jeu (Blind test éclair, Rapidité, Premier buzz, Vrai ou faux éclair, Quitte ou double, Mort subite, Vol de points, Série, Estimation, Révélation progressive) | Flash blind test, Quick answer, First buzz, Flash true or false, Double or nothing, Sudden death, Point steal, Streak, Estimate, Progressive reveal |
| `chooser.desk.1` à `.6`     | Pupitre un, à toi de choisir le thème.                                                                                                                                            | Desk one, pick the theme.                                                                                                                           |
| `answer.correct.1` à `.3`   | Bonne réponse. / Exactement. / Bien vu.                                                                                                                                           | Correct. / Exactly. / Well spotted.                                                                                                                 |
| `answer.wrong.1` à `.2`     | Raté. / Eh non.                                                                                                                                                                   | Wrong. / Not quite.                                                                                                                                 |
| `question.lost`             | Personne n'a trouvé.                                                                                                                                                              | Nobody got it.                                                                                                                                      |
| `round.end`                 | Fin de la manche, voyons les scores.                                                                                                                                              | End of the round, let's see the scores.                                                                                                             |
| `points.stolen`             | Points volés.                                                                                                                                                                     | Points stolen.                                                                                                                                      |
| `player.eliminated`         | Éliminé.                                                                                                                                                                          | Eliminated.                                                                                                                                         |
| `bets.closed`               | Les mises sont faites.                                                                                                                                                            | Bets are closed.                                                                                                                                    |
| `game.paused`               | Petite pause, on reprend dans un instant.                                                                                                                                         | Short break, back in a moment.                                                                                                                      |
| `game.resumed`              | On reprend.                                                                                                                                                                       | And we're back.                                                                                                                                     |
| `game.winner.desk.1` à `.6` | Victoire du pupitre un.                                                                                                                                                           | Desk one wins.                                                                                                                                      |
| `game.tie`                  | Égalité en tête, bravo à vous.                                                                                                                                                    | It's a tie at the top, well played.                                                                                                                 |
| `session.exit`              | Merci d'avoir joué. La sortie est par ici.                                                                                                                                        | Thanks for playing. The exit is this way.                                                                                                           |

Aucun prénom n'est prononcé : on dit le numéro de pupitre, donc l'audio ne contient aucune donnée personnelle (décision n° 8).

**Fichiers.**

- Emplacement : `/announcer/manifest.json` et `/announcer/<lang>/<id>.mp3`, sur `salle.<domaine>`, même origine que l'écran de salle et sans jeton : le contenu est fixe et non personnel.
- Format : MP3 mono, normalisé autour de −16 LUFS. Format retenu parce que tout outil de synthèse ou studio l'exporte.
- Manifeste : `{ version, lang: { id: durationMs } }`, généré avec les fichiers. Il sert aussi à contourner le cache (`?v=`).
- Les fichiers sont hors de git (décision n° 2). En développement, ils vont dans `game/room-app/public/announcer/`, ignoré par git. En recette, un volume est monté dans `/srv/salle/announcer` sous Caddy, sans changer le `Caddyfile`.

**Lecture.**

- Nouveau fichier `game/audio/src/announcerPlayer.ts`, classe `AnnouncerPlayer`. Elle partage l'`AudioContext` comme `UiSoundPlayer.sharing`.
- `preload(manifestUrl, lang)` décode tout au lancement de la partie : environ 48 × 2 s en mono, quelques Mo de PCM.
- `say(ids[])` gère une file de 2 clips au plus. Une annonce plus importante coupe la précédente, et un doublon est ignoré.
- Atténuation : nouvelle méthode `WebAudioExtractPlayer.duck(factor, rampMs)` sur le gain maître (environ 0,3 en 80 ms, remontée en 300 ms), pilotée par `onSpeaking`.
- Repli silencieux : manifeste absent, fichier absent ou décodage raté donnent un `say` sans effet. Les sons synthétisés restent joués.

**Ce qui déclenche une annonce.**

- Nouveau fichier `game/room-app/src/audio/announcerBridge.ts`, fonction pure `announcementForEvent`, sur le modèle de `uiSoundForEvent`.
- Règles :
  - jamais pendant un palier de blind test, pour ne rien masquer de l'extrait ;
  - `round.N` (ou `round.last`) puis `minigame.<code>`, en tenant dans `timings.roundIntroMs` ;
  - les variantes tournent dans l'écran de salle, jamais dans le moteur.
- Langue : la locale de l'écran de salle. Réglage par salle : `audio.announcer` (booléen, vrai par défaut).
- Test de contrat : chaque code de `MINI_GAMES` a son `minigame.<code>`, et le texte est égal au nom i18n de `game.json`.

**Livrable sans les fichiers :** lecteur, atténuation, catalogue et textes fr / en (`game/room-app/src/audio/announcements.ts`, qui sert aussi de script d'enregistrement), correspondance événement → annonce, format du manifeste, montage du volume, repli silencieux.

**Ce qui attend la décision §8 point 4 :** la production des 96 fichiers et l'éventuel script de génération.

**Option par défaut recommandée :** voix de synthèse pré-générée hors ligne, une seule fois, pour les seules annonces fixes. Elle se régénère et reste la même en fr et en en. Un enregistrement humain pourra remplacer les fichiers plus tard, avec les mêmes `id` et sans toucher au code. La lecture des questions à voix haute reste hors V1.

---

## B. Configuration de salle plus rapide

Règle commune : la détection propose, l'opérateur confirme. Le résultat d'une détection est toujours affiché, puis confirmé par un « Est-ce que ça s'allume ? » ou un appui sur un buzzer.

**1. Détection des nœuds Art-Net**

- **Existant.** `{"type":"poll"}` envoie un ArtPoll en diffusion. Les réponses (IP, `shortName`, `longName`, `universes`) sont listées dans `/setup/lights`, et un clic enregistre `lighting.artnet.target`.
- **Ajout.** Afficher le nom et les univers annoncés. Nouvelle fonction pure `proposeUniverses(node, fixtures)` dans `game/hardware`. Si les sorties du nœud sont en `0.0.x` avec x ≤ 15, elle propose de placer les appareils du modèle sur les univers internes correspondants : la recopie par défaut du pont envoie l'univers interne n vers `--universe` + n. Cela règle le piège de `banc-materiel.md` §3.4. Le choix « Appliquer » passe par une confirmation. Si rien n'est trouvé avec deux cartes réseau, le message cite `--poll-broadcast`.
- **Écran.** `SetupLightsView.vue`, étapes `scan` et `equip`.
- **Tests (simulation).** `proposeUniverses` avec des nœuds `0.0.1` / `0.0.2`, une sortie hors 0..15 (aucune proposition), un nœud sans `universes`. Composant `SetupLights.test.ts` : la proposition n'est appliquée qu'après confirmation.

**2. Ordre des ports et des cartes mémorisé par identifiant**

- **Existant.**
  - USB DMX : `getGrantedDmxPort(match)` compare l'objet port ou le modèle USB, mais `match` ne vit qu'en mémoire. Après un rechargement, on prend « une puce DMX connue sinon la première ».
  - Manettes : `buzzers.source.match` (morceau du nom). Avec deux cartes identiques, on lit la première de `getGamepads()`, donc dans l'ordre de branchement.
- **Limite de la plateforme.** Web Serial n'expose que `usbVendorId` et `usbProductId`, pas de numéro de série, et l'API Gamepad n'expose qu'un `id`. Deux interfaces identiques ne se distinguent pas depuis le navigateur. La V1 n'a qu'une interface USB (univers 0) et qu'une carte de buzzers (32 entrées ≥ 6 × 4) : le multi-cartes n'est pas fait (YAGNI).
- **Ajout.**
  - `lighting.usb: { usbVendorId, usbProductId }` est enregistré à la connexion et sert de `match` après rechargement : on ne prend jamais un autre modèle.
  - `buzzers.source.id` garde l'`id` complet de la carte apprise.
  - Si deux ports ou deux cartes correspondent, rien n'est choisi : l'écran demande à l'opérateur de débrancher l'un ou de l'identifier (flash `identify` pour la lumière).
- **Écrans.** Bandeaux dans l'écran Matériel et dans `/setup`. Le câblage passe par `roomHardware.ts`.
- **Tests.** Faux ports et fausses manettes dans un ordre différent à chaque essai donnent le même choix. Deux candidats identiques ne donnent aucun choix et un problème signalé.

**3. Modèles de salle**

- **Existant.** Un seul modèle, `createSixDeskRoomRig` (6 pupitres, 8 lyres 9 canaux, décodeur LED), proposé dans `/setup/lights`. La fumée existante est conservée et le test se fait appareil par appareil.
- **Ajout.** Nouveau fichier `game/hardware/src/presets/roomTemplates.ts`, avec `ROOM_TEMPLATES` en données et `createRigFromTemplate(template, { startAddress })`. Modèles :
  - « 6 pupitres, 8 lyres », qui reprend le préréglage actuel ;
  - « 4 pupitres, 4 PAR RVBW » ;
  - « 4 pupitres, 4 PAR + 2 lyres » ;
  - « 6 pupitres, 6 PAR RVB + 2 lyres ».

  Règles : adresses consécutives sans chevauchement, profils génériques, points du plan de salle posés par défaut. Un modèle n'ajoute ni n'active jamais la fumée. L'opérateur confirme ensuite appareil par appareil (boucle existante). Un « Non » propose de changer l'adresse avec `identify`.

- **Écran.** `SetupLightsView.vue`, étape `equip`.
- **Tests.** Chaque modèle passe `parseRig` sans problème, garde le nombre d'appareils attendu, n'a aucun appareil de fumée et tient sous 20 000 caractères une fois enregistré.

**4. Export et import**

- **Format.** Fichier `quizzup-salle-<nom>-<date>.json` contenant `{ format: "quizzup-room-config", schema: 1, exportedAt, config }`. `schema` vaut `ROOM_HARDWARE_CONFIG_VERSION`.
- **Validation à l'import.**
  - Fichier de 64 Ko au plus, JSON valide, `format` exact.
  - `schema` plus récent que celui de l'écran : refus avec le message « fichier d'une version plus récente ».
  - Passage par `parseRoomHardwareConfig`, affichage des problèmes et d'un résumé (pupitres, appareils, pilote, univers).
  - Confirmation « Remplacer la configuration de cette salle ? » (`useConfirm`), puis `saveRoomHardwareConfig`, protégé par la révision.
- **Jamais importé.**
  - `lighting.smoke.enabled` et `cutsOnSignalLoss` sont forcés à faux : la fumée se réarme dans l'assistant, avec ses vérifications, dans la nouvelle salle.
  - `setupDone` est forcé à faux, ce qui relance `/setup` et le test des lumières.
  - Les états locaux (arrêt d'urgence, révision, partie, file des scores) ne sont ni exportés ni importés.
- **Importé comme point de départ à confirmer.** `lighting.artnet.target`, `lighting.usb`, `buzzers.keymap`, `deskPositions` (décision n° 6).
- **Fonctions pures dans `config.ts`.**
  - `exportRoomConfig` et `parseRoomConfigImport`.
  - `withoutSmokeEscalation(previous, next)` : la fumée ne passe jamais de désactivée à active hors de l'assistant. On l'applique aussi à `AdvancedConfig.vue`, ce qui ferme le défaut 8 côté écran de salle. Le côté serveur est fermé par le lot de sécurité `smoke_config_forbidden` (arbitrage 10).
- **Écran.** Matériel, onglet Configuration avancée : boutons « Exporter » et « Importer » (`<input type="file">` et `Blob`, aucune bibliothèque).
- **Tests.**
  - Aller-retour export → import identique, sauf les champs forcés.
  - Refus : `schema` plus récent, `format` faux, fichier trop gros, JSON invalide.
  - La fumée active dans le fichier reste désactivée.
  - L'éditeur JSON de l'écran de salle ne peut plus activer la fumée.

La copie de configuration d'une salle à l'autre depuis le backoffice est reportée : le fichier suffit pour équiper la salle suivante.

---

## C. Pour l'ensemble

### 7. Découpage en PR

**Peuvent partir tout de suite (fichiers disjoints des deux chantiers en cours) :**

| PR                                                                                                      | Taille | Objectif                                                                                                                                 | Fichiers                                                                                                                       | Exclu                              | Tests                                                                                                                                                                                     | Doc                                                      |
| ------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **H1** Scènes : défauts 1 à 4 (**sécurité : stroboscope**, première ligne de la PR)                     | S      | `strobe` exclu, repli de `desk`, `buzz` à 40, `game_ended_tie` et `victory-tie`, `round_started.<miniGame>`                              | `game/hardware/src/lighting/scenes.ts`, `scenePlayer.ts`, `lightingController.ts`                                              | config, écran de salle             | `tests/lighting/` : stroboscope éteint dans chaque scène par défaut, buzz après erreur joué, égalité, pupitre sans appareil                                                               | README hardware (tableau événements → scènes, priorités) |
| **H0** Plafond des éclairs (**sécurité : flashs**, lot à part, arbitrage 11)                            | S      | scènes `buzz`, `answer-correct` et `victory` ralenties à 3 éclairs par seconde au plus                                                   | `game/hardware/src/lighting/scenes.ts`                                                                                         | config, écran de salle             | aucune scène livrée au-dessus de 3 éclairs par seconde                                                                                                                                    | README hardware                                          |
| **RA5a** Fumée coupée à la pause (**sécurité : fumée**, lot à part, arbitrage 12, sans dépendance à H2) | S      | `smoke.stop()` aux signaux `game_paused` et `game_resumed`, la pause étant déjà dans `main`                                              | `roomHardware.ts` (qui suit `paused`), ou `useRoomGame.ts` selon l'API fusionnée                                               | scènes `pause` et `question` (RA5) | `roomGamePause.test.ts` étendu, avec un jet coupé à la pause                                                                                                                              | —                                                        |
| **H2** Show réglable (**sécurité : fumée de scène**)                                                    | M      | `next`, `lighting.scenes`, `parseScenes`, `SHOW_CUES`, clés inconnues conservées (défaut 6)                                              | `lighting/showConfig.ts` (nouveau), `scenes.ts`, `scenePlayer.ts`, `config.ts`, `index.ts`                                     | interface d'édition                | bornes une à une, fumée refusée dans une boucle, boucle de durée nulle refusée, surcharge par `id`, `identify` protégé, clé inconnue conservée, rattrapage après gel sans fumée en retard | README hardware, exemple `rooms.config`                  |
| **H3** Scène de sortie                                                                                  | S      | `lighting.exit`, `exitScene`, `victory.next`, `exit-off`, `game_ended_incomplete` → `exit`                                               | `scenes.ts`, `config.ts`, `lightingController.ts`                                                                              | bouton à l'écran                   | délai, maintien, interruption par `game_started`, arrêt d'urgence, `enabled: false`                                                                                                       | README hardware                                          |
| **AU1** Lecteur d'annonces                                                                              | S      | `AnnouncerPlayer`, `WebAudioExtractPlayer.duck`                                                                                          | `game/audio/src/announcerPlayer.ts`, `webAudioExtractPlayer.ts`, `index.ts`                                                    | écran de salle                     | faux `AudioContext` : file, coupure, atténuation et remontée, manifeste absent ou fichier en échec = silence                                                                              | README audio                                             |
| **RA1** Catalogue des annonces                                                                          | S      | `announcements.ts` (48 `id`, textes fr / en), `announcementForEvent`                                                                     | `game/room-app/src/audio/announcements.ts`, `announcerBridge.ts` (nouveaux)                                                    | branchement                        | correspondance par événement, rien pendant un palier, contrat `MINI_GAMES` et noms i18n                                                                                                   | README room-app (liste à enregistrer)                    |
| **RA2** Révélation et score                                                                             | S      | habillages 1 et 2                                                                                                                        | `RevealScreen.vue`, `AnswerGrid.vue`, `ScoreBoard.vue`, `composables/useTweenedNumber.ts`                                      | `GameView.vue`                     | rAF annulé au démontage, saut direct sous `prefers-reduced-motion`, texte final juste                                                                                                     | —                                                        |
| **RA3** Compte à rebours                                                                                | S      | habillage 3, `tick` branché                                                                                                              | `TimerBar.vue` et les 4 écrans qui l'utilisent                                                                                 | `GameView.vue`                     | `tick` joué une fois par seconde sous 3 s, aucun pendant une pause (horloge gelée)                                                                                                        | —                                                        |
| **RA4** Podium                                                                                          | M      | habillage 5 et bouton « Lumière de sortie »                                                                                              | `Leaderboard.vue`, `FinishedScreen.vue`, `components/game/Confetti.vue`                                                        | `GameView.vue`                     | Canvas absent avec mouvement réduit, boucle arrêtée après 4 s, bouton qui appelle `playScene('exit')`                                                                                     | —                                                        |
| **E1** Endurance e2e                                                                                    | S      | 3 parties courtes, métriques CDP                                                                                                         | `game/e2e/tests/room-app/endurance.spec.ts`                                                                                    | —                                  | seuils du §4                                                                                                                                                                              | README e2e                                               |
| **HB1** Identité des périphériques                                                                      | S      | `lighting.usb`, `buzzers.source.id`, détection d'ambiguïté                                                                               | `game/hardware/src/dmx/serialOutput.ts`, `buzzers/gamepadBuzzerInput.ts`, `config.ts`, `room-app/src/hardware/roomHardware.ts` | vues                               | ordre de branchement aléatoire = même choix, deux candidats = aucun choix                                                                                                                 | README hardware                                          |
| **HB2** Modèles et univers proposés                                                                     | S      | `ROOM_TEMPLATES`, `createRigFromTemplate`, `proposeUniverses`                                                                            | `game/hardware/src/presets/roomTemplates.ts` (nouveau), `index.ts`                                                             | vues                               | voir B3 et B1                                                                                                                                                                             | README hardware                                          |
| **HB3** Export et import, garde-fou fumée (**sécurité**)                                                | S      | `exportRoomConfig`, `parseRoomConfigImport`, `withoutSmokeEscalation`, branchement dans `AdvancedConfig.vue` (bloc `<script>` seulement) | `config.ts`, `AdvancedConfig.vue`                                                                                              | boutons d'import et d'export       | voir B4                                                                                                                                                                                   | README hardware                                          |

HB3 touche au même fichier que la refonte de l'écran Matériel, mais seulement dans le bloc script. À faire partir vite, en prévenant le développeur de la disposition.

**Dépendent de « pause et `GameView.vue` », fusionnés dans `main` (PR #131) :**

- **RA5** (S) : signaux `game_paused` et `game_resumed` → scènes `pause` / `question`, plus la scène de phase rejouée après une reprise de partie. La coupure de la fumée est sortie dans RA5a. Fichiers : `roomHardware.ts` (qui suit `paused`), ou `useRoomGame.ts` selon l'API fusionnée. Tests : `roomGamePause.test.ts` étendu. Dépend de H2.
- **RA6** (S) : branchement de la voix. Fichiers : `main.ts`, `useRoomGame.ts` (préchargement à côté de celui des extraits), `audio.announcer`, volume `deploy/recette/docker-compose.yml`. Dépend de AU1 et RA1.
- **RA7** (S) : transitions de phase dans `GameView.vue`.

**Doivent attendre la fusion « disposition de `LaunchView`, `/setup`, `/setup/lights`, Matériel » :**

- **RA8** (M) : modèles et proposition d'univers dans `SetupLightsView.vue`. Dépend de HB2.
- **RA9** (S) : boutons Exporter et Importer dans l'écran Matériel. Dépend de HB3.
- **RA10** (S) : panneau « Spectacle » dans l'écran Matériel : un interrupteur par moment (`bindings` à `null`), réglages de sortie, fumée par moment, voix activée ou non. Dépend de H2, H3 et RA6.

Ordre imposé dans `game/hardware`, car les fichiers se recoupent : H0 → H1 → H2 → H3, puis HB3 (après H2, à cause de `config.ts`). AU1, RA1 à RA4, E1, HB1 et HB2 vont en parallèle.

Toutes ces PR demandent les clés i18n fr / en dans la même PR et une ligne `US:` au CHANGELOG.

### 8. Risques et protocole de validation sur le banc

Rien de ce qui suit n'est prouvé par la simulation. Il faut l'ajouter à `docs/recette/banc-materiel.md` dans une section **S (spectacle)** et une section **C (configuration)**.

| Test                                   | Comment                                                                                                                         | Critère                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| S1 Cadence                             | partie complète, show par défaut et boucles, 10 min (extension de D7)                                                           | `measuredHz` à 30 ± 1, 0 échec                                                                                     |
| S2 Flash lisible                       | flash du buzz (ralenti à 3 éclairs par seconde au plus) sur PAR LED, ruban et lyre, filmé à 240 i/s                             | 3 éclairs distincts sur chaque appareil ; sinon réglage dans la config, pas dans le code                           |
| S3 Lyres                               | délai entre le buzz et le spot sur le pupitre ; changement de couleur sur la roue                                               | spot arrivé en 700 ms au plus ; pas d'arc-en-ciel visible, sinon flash au gradateur seul pour les appareils à roue |
| S4 Stroboscope                         | appareil de type `strobe` branché pendant toute une partie                                                                      | éteint hors scène qui le nomme                                                                                     |
| S5 Fumée de victoire                   | armée, puis non armée, puis deuxième partie pendant le temps de repos                                                           | durée maximale ± 0,5 s ; aucun jet sans armement ; refus pendant le repos (avertissement)                          |
| S6 Pause pendant un jet                | pause au milieu du jet de victoire forcé par une scène de test                                                                  | voyant du relais éteint en moins de 100 ms                                                                         |
| S7 Arrêt d'urgence pendant la séquence | bouton logiciel puis coup-de-poing pendant `victory`                                                                            | noir immédiat ; au réarmement `idle`, ni reprise de la séquence ni fumée                                           |
| S8 Rechargement pendant la victoire    | F5 pendant le jet                                                                                                               | relais temporisé ; aucun nouveau jet après rechargement                                                            |
| S9 Sortie                              | partie jusqu'au podium                                                                                                          | lumière de sortie après le délai, lisible depuis la porte, interrompue par la partie suivante                      |
| S10 Voix                               | annonce pendant un extrait (atténuation), à 3-4 m ; pack retiré                                                                 | intelligible, sans saturation, moins de 150 ms après l'événement ; sans pack, partie normale et silencieuse        |
| S11 Habillage                          | G6 sur révélation, podium et confettis ; G2 sur 3 h                                                                             | 60 i/s, aucun long frame de plus de 50 ms ; mémoire stable                                                         |
| S12 Latence                            | B5 rejoué avec l'habillage                                                                                                      | médiane ≤ 80 ms, max ≤ 150 ms                                                                                      |
| C1 Art-Net                             | A4 puis proposition d'univers acceptée                                                                                          | univers justes, puis A5 vert                                                                                       |
| C2 USB                                 | interface DMX et un autre périphérique série, branchés dans un ordre différent sur 3 redémarrages ; puis deux clones identiques | même interface choisie ; deux clones = l'écran demande                                                             |
| C3 Manettes                            | deux cartes branchées                                                                                                           | alerte d'ambiguïté ; B7 vert                                                                                       |
| C4 Modèle de salle                     | « 6 pupitres, 8 lyres » sur le banc (2 lyres réelles)                                                                           | confirmation appareil par appareil, temps noté                                                                     |
| C5 Export et import                    | export du banc, import sur un autre PC et un autre compte de salle                                                              | fumée désactivée, assistant exigé ; salle prête en moins de 15 min (critère de sortie n° 2)                        |

Risques principaux :

- **Lyres plus lentes que les scènes.** Parade : délai de visée en données (pas `wait`), réglé par salle.
- **Show surchargé par une salle au point de dépasser 20 000 caractères.** Parade : surcharges seulement, et un test sur le modèle le plus gros.
- **Flashs et épilepsie photosensible.** Décision n° 3.
- **Licence de la voix.** Décision n° 7.

---

## Options écartées

- **Nouveau moteur de show à côté de `scenePlayer`** : il doublerait les fondus, les priorités et le passage de la fumée par la sécurité. On étend l'existant.
- **Éditeur visuel de chronologie en V1** : trop cher pour un besoin non mesuré. Les interrupteurs et le JSON avancé suffisent.
- **Bibliothèque de shows par compagnie en base** : `plan-salle.md` §3.3 la reporte déjà (YAGNI). Aucune table, aucune route.
- **PixiJS, Lottie ou une bibliothèque d'animation** : pas avant un échec à G6 (D4). Un seul Canvas 2D suffit pour les confettis.
- **Synthèse vocale du navigateur** : exclue par le cadrage, car la qualité dépend du PC.
- **Voix servie par `mediaStorage` avec jeton** : contenu fixe et identique pour tous, donc un fichier statique est plus simple et se met en cache.
- **Vidéos d'intro pré-rendues tout de suite** : à décider après G6, et elles demandent une production de contenu.
- **Copie de configuration entre salles par une route du backoffice** : reportée, le fichier suffit.
- **Univers ou adresses appliqués automatiquement après détection** : contraire à la règle « la détection propose ».

## Impacts

- **Paquets touchés** : `game/hardware`, `game/audio`, `game/room-app`, `game/e2e`, `deploy/recette` (un volume).
- **Backend** : aucun changement dans ce lot. Pas de table, de migration ni de route. DBML et OpenAPI restent inchangés. Seul le lot de sécurité à part `smoke_config_forbidden` (arbitrage 10) touche la route du personnel `PATCH /companies/:companyId/rooms/:id`.
- **Config de salle** : nouveaux champs facultatifs `lighting.scenes`, `lighting.exit`, `lighting.usb`, `buzzers.source.id` et `audio.announcer`. `version` reste à 1, car tout est additif. Le fichier d'export porte `schema`.
- **Sécurité** :
  - fumée de scène bornée et interdite dans les boucles ;
  - stroboscope exclu par défaut ;
  - flashs bornés à 3 éclairs par seconde ;
  - import et éditeur JSON de l'écran de salle qui ne peuvent plus activer la fumée (défaut 8). L'API du personnel reste ouverte tant que le lot `smoke_config_forbidden` n'est pas livré (arbitrage 10) ;
  - fichiers voix publics sans jeton, sans aucune donnée personnelle.

  Les PR H0, H1, H2, H3, HB3 et RA5a l'annoncent en première ligne et demandent une relecture explicite.

- **RGPD** : rien de neuf. L'export ne contient aucun e-mail et la voix ne dit aucun prénom. La voix reste soumise à la décision n° 7.

## Décisions pour Enzo ou Victoria

1. **Enzo** : voix de synthèse pré-générée une fois pour les 48 annonces fixes, et lecture des questions à voix haute hors V1 : d'accord ?
2. **Enzo** : fichiers voix hors du dépôt public, déployés à part : d'accord ?
3. **Enzo et Victoria** : relever le plafond des flashs au-dessus de 3 éclairs par seconde (seuil usuel contre l'épilepsie photosensible) : oui ou non ? **Réponse par défaut : non.** Le plafond de 3 par seconde est appliqué à toutes les scènes tant que personne n'a répondu. Les scènes livrées `buzz` (environ 7 par seconde), `answer-correct` et `victory` le dépassent aujourd'hui : elles sont ralenties par un lot de sécurité à part (arbitrage 11).
4. **Enzo** : fumée du show par défaut à la victoire seulement, sans le début de partie : d'accord ?
5. **Enzo** : scène de sortie active par défaut, 10 s après la victoire, pendant 5 min : d'accord ?
6. **Enzo** : à l'import, buzzers appris et calage des lyres repris comme point de départ à confirmer, plutôt que jamais importés : d'accord ?
7. **Victoria** : la licence de la voix sera-t-elle validée avant la salle pilote ?
8. **Enzo** : vainqueur annoncé par son numéro de pupitre, sans prénom : d'accord ?

Fichiers de référence :

- `game/hardware/src/lighting/scenes.ts`
- `game/hardware/src/lighting/scenePlayer.ts`
- `game/hardware/src/lighting/lightingController.ts`
- `game/hardware/src/config.ts`
- `game/room-app/src/hardware/roomHardware.ts`
- `game/room-app/src/audio/uiSoundBridge.ts`
- `game/room-app/src/views/hardware/AdvancedConfig.vue`
- `game/room-app/src/views/SetupLightsView.vue`
- `game/audio/src/webAudioExtractPlayer.ts`
- `backoffice/backend/src/routes/companies/rooms/_schemas.ts` (limite de 20 000 caractères)
