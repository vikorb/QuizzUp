# Lots 3 et 4 et extraits transformés : conception

**Recommandation.**
1. Les formats deviennent des constantes partagées : Découverte 3 × 3, Courte 6 × 7, Standard 10 × 10, plus Personnalisé. La durée estimée est calculée à partir des délais du moteur.
2. D'après mon calcul, 10 × 10 donne 28 à 43 min de jeu : la décision du 3 novembre tient dans un créneau d'une heure.
3. Lot 4 : un socle d'abord (constantes, migration, contrat moteur, emplacements), puis quatre PR en fichiers séparés. Le « don de points » ferait doublon avec le vol de points ; je le remplace par « Patate chaude ». Les extraits transformés sont réglés par question et appliqués à la lecture.

---

## 1. Formats de partie

### Ce qui existe aujourd'hui

**Backoffice.** `CreateGameForm.vue` a deux champs numériques libres, `roundsCount` et `questionsPerRound` (1 à 20, 10 par défaut).
- Contrôles : côté navigateur par `utils/game/form.ts`, côté serveur par `routes/games/_schemas.ts` (Zod, défauts `GAME_DEFAULT_ROUNDS` et `GAME_DEFAULT_QUESTIONS_PER_ROUND`).
- Stockage : `games.rounds_count` et `games.questions_per_round` (smallint, CHECK 1..20, défaut 10).
- Ces valeurs sont renvoyées par `GET /room/games/current`. `StaffGameLobby.vue` les affiche dans son titre puis les passe telles quelles à `startNewGame`. L'écran de salle connecté à un compte n'offre aucun choix.

**Le choix « complet / court »** n'existe que dans `LobbyView.vue`, branche démo (`isDemo`).
- Une constante locale `FORMATS` propose `full` = 10 × 10 et `short` = 3 × 3, valeurs écrites en dur.
- Le fieldset n'est rendu qu'en démo, donc la valeur par défaut est toujours `short`.
- Rien n'est stocké. Les libellés sont `room.lobby.formatFull` et `room.lobby.formatShort`.

**Moteur.**
- `resolveSetup` valide les deux nombres et applique 10 × 10 s'ils manquent. La partie s'arrête quand `rounds.length >= roundsCount`.
- `drawRoundQuestions` tire `questionsPerRound` questions éligibles du thème choisi. Si le thème en a moins, la manche est plus courte.
- Aucune notion de durée n'existe nulle part.

### Proposition

Dans `@quizzup/shared` :
- `GAME_FORMAT_DISCOVERY = 'discovery'`, `GAME_FORMAT_SHORT = 'short'`, `GAME_FORMAT_STANDARD = 'standard'`, `GAME_FORMAT_CUSTOM = 'custom'` ;
- `GAME_FORMATS` (liste) et `GAME_DEFAULT_FORMAT = GAME_FORMAT_STANDARD` ;
- `GAME_FORMAT_SETTINGS: Record<format hors custom, { roundsCount, questionsPerRound }>` : 3 × 3, 6 × 7, 10 × 10.

Un format ne fixe pas les mini-jeux. Le choix existant (`games.mini_games`) reste indépendant : un format qui imposerait ses mini-jeux contredirait la sélection de l'opérateur.

Je propose aussi que les mini-jeux soient **tirés sans remise** : pas de répétition tant que tous les mini-jeux cochés et jouables n'ont pas été joués, et toujours pas deux fois de suite. À 6 manches, on voit ainsi 6 mini-jeux différents. Aujourd'hui, seule la répétition immédiate est évitée. C'est un petit changement de `beginRound` dans `engine.ts`.

### Durée estimée : formule

On déplace `DEFAULT_GAME_TIMINGS` dans shared sous le nom `GAME_DEFAULT_TIMINGS_MS` ; le moteur le réexporte. On ajoute `MINI_GAME_QUESTION_ESTIMATES_MS: Record<MiniGame, { typicalMs, highMs }>`, révélation comprise. Le `Record` oblige à remplir une ligne par nouveau mini-jeu.

La fonction pure `estimateGameDurationMs({ roundsCount, questionsPerRound, miniGames })` renvoie `{ typicalMs, highMs }` :

> D = R × (intro + choix du thème + bilan) + R × Q × moyenne sur les mini-jeux cochés de q(m)

Délais réels du moteur : intro 4 s, choix du thème 15 s au plus, bilan 8 s, révélation 5 s (vrai/faux 2,5 s). Fixe par manche : 19 s en typique (choix du thème en 7 s), 27 s en haut.

Hypothèses du typique, à recaler sur le banc :
- jeux où tout le monde répond : fin à 60 % de la fenêtre ;
- jeux de buzz : premier buzz à 40 % de la fenêtre, plus 3 s de réponse ;
- blind test : trouvé au palier 2.

Le haut correspond à toutes les échéances atteintes, sans mauvaise réponse. Ce n'est pas un maximum absolu : chaque mauvaise réponse d'un jeu de buzz ajoute jusqu'à 5 s.

| Mini-jeu | typique / haut (s) |
| --- | --- |
| flash_blind_test | 18 / 40 |
| quick_answer, first_buzz, sudden_death, streak | 14 / 20 |
| true_false | 6,1 / 8,5 |
| double_or_nothing, point_steal | 18 / 28 |
| estimate | 17 / 25 |
| progressive_reveal | 16 / 25 |
| roue 18 / 24, course 14 / 20, patate 12 / 21, duel 17 / 21 | (lot 4) |

Moyenne sur les 10 mini-jeux actuels : 14,9 s / 23,5 s. Sur 14 mini-jeux : 15,0 s / 22,9 s.

| Format | Jeu typique | Jeu haut | Créneau visé |
| --- | --- | --- | --- |
| Découverte 3 × 3 | 3 min | 5 min | démo, essai |
| Courte 6 × 7 | 12 min | 19 min | 30 min |
| Standard 10 × 10 | 28 min | 43 min | 60 min |

**Lecture des chiffres.**
- J'ai lu « environ 30 / 60 minutes » comme la durée d'un **créneau** : accueil, consignes et podium (~10 min) plus le jeu, dimensionné sur la borne haute pour ne jamais déborder.
- **10 × 10 tient donc dans une heure.** La marge est faible une fois le lot 5 ajouté : 3 s de plus par question et 15 s de plus par manche font +6,5 min, soit 35 à 50 min de jeu.
- Les valeurs du cadrage §8.3 sont démenties par le moteur : 4 × 5 dure 6 à 10 min, pas 30 ; 7 × 7 dure 14 à 22 min, pas 60.
- Le vrai coût de 10 × 10 est le contenu : 100 questions par partie (lot 8).
- La formule surestime pour la mort subite, la course et la patate, qui finissent leurs manches plus tôt.

Le test de contrat moteur `tests/durationEstimates.test.ts` vérifie que `highMs` de chaque mini-jeu est au moins égal au calcul fait depuis ses propres constantes. C'est le même principe que `RANGE_PREFIX`.

### Où le format se choisit, ce qui est stocké

- **Création au backoffice.** Un choix Découverte / Courte / Standard / Personnalisé, Standard par défaut. Chaque option affiche « 10 × 10 · 28 à 43 min ». Personnalisé fait apparaître les deux champs actuels, avec la même estimation recalculée.
- **Lobby de salle (compte).** Affichage seulement (nom du format et estimation). Le format a été fixé à la création, le lancement à distance (lot 1) reprend la partie existante.
- **Lobby démo.** Les `FORMATS` locaux sont remplacés par `GAME_FORMATS`, Découverte par défaut.
- **Stockage.** Nouvelle colonne `games.format varchar(30) NULL`, avec un CHECK aligné sur `GAME_FORMATS`. `rounds_count` et `questions_per_round` restent la seule vérité pour le moteur.
- **API.**
  - Corps de création : `format` facultatif.
  - Format autre que `custom` : le serveur prend les nombres de la constante ; envoyer aussi des nombres donne une erreur 400 `invalid_body`.
  - Nombres envoyés sans format : `custom`.
  - Rien d'envoyé : `standard`, donc 10 × 10 comme aujourd'hui.
  - `format` est renvoyé par les routes de parties et par `/room/games/current`.
- **Compatibilité.** Les anciennes parties ont `format = NULL` et s'affichent « Personnalisé ». Le moteur et l'écran de salle ignorent `format` pour jouer.

## 2. Quatre mini-jeux

### Règles communes aux quatre

- **Pause.** Elle est gérée par l'hôte (`session.ts` gèle l'horloge et rend les buzzers sourds) : aucune règle de pause par mini-jeu. En revanche, toute animation (roue, mèche, intro du duel) doit se calculer depuis l'horloge de la partie et non en CSS libre, sinon elle continue pendant la pause.
- **Question passée.** 0 point. Les données de manche (voir socle) ne bougent pas, et la question est ignorée de l'historique.
- **Nombre de pupitres.** Le moteur s'arrête à 6 pupitres (`GAME_PODIUMS`). Les règles sont écrites pour tenir jusqu'à 16, donc jamais « bouton = pupitre » au-delà de 4 : on fait défiler les pupitres, comme dans le vol de points.
- **Questions.** `isMultipleChoiceQuestion`, ordre des réponses mélangé.
- **Hasard.**
  - Le moteur passe `QuestionContext.random`, le générateur à graine de la partie.
  - Un mini-jeu ne tire qu'**au `start`**, et stocke le résultat dans son état.
  - Les mini-jeux qui ne tirent rien ne consomment rien : les tirages des parties existantes ne changent pas.
- **Données de manche.** Nouveau `roundData` facultatif et sérialisable.
  - Renvoyé par le `QuestionStep` qui termine une question.
  - Gardé dans `RoundRecord.miniGameData`.
  - Relu dans `QuestionContext.roundData` et `RoundContext.roundData`.
  - Pas stocké côté serveur : `game_rounds` n'est écrit par aucune route aujourd'hui.
- **État.** Il doit avoir un champ `question` ou `answering`, sinon `getMiniGameQuestion` casse.
- **Base de données.** Aucune colonne nouvelle. Le CHECK de `game_rounds.mini_game` est étendu par une seule migration du socle.
- **Réglages au backoffice.** Aucun en V1 : les valeurs sont des constantes du moteur.
- **Lumières.** Liaisons ajoutées dans `DEFAULT_BINDINGS` vers des scènes existantes, **jamais `VICTORY`**, qui déclenche la fumée.
- **Sons.** Ceux de `UiSoundPlayer` seulement.

### Doublons vérifiés

- **Roue** contre quitte ou double : ici la mise est tirée au hasard et publique, on décide de répondre ou de s'abstenir après avoir vu la question, et une erreur coûte la moitié. Ce n'est pas un doublon.
- **Course** contre série et mort subite : progression vers un seuil avec recul en cas d'erreur. Ce n'est pas un doublon.
- **Duel** contre premier buzz : seulement deux pupitres buzzent, les autres font un pronostic. À 2 pupitres, ce serait exactement le premier buzz, d'où `minParticipants: 3`.
- **Don de points : doublon du vol de points.** Même déroulé : tout le monde répond, le plus rapide désigne un adversaire, des points changent de main ; seul le signe change. À 2 joueurs, il devient une simple punition pour qui répond juste. Je le remplace par **Patate chaude**, qui garde l'idée de « donner » mais donne un risque, de manche en manche.

### Roue des points (`points_wheel`) — fr « Roue des points », en « Points wheel »

**Règle.**
- **Tirage** (`spinning`, `POINTS_WHEEL_SPIN_MS = 4000`) : au `start`, un secteur est tiré au hasard parmi les 8 de `POINTS_WHEEL_SEGMENTS = [20, 40, 60, 80, 100, 100, 150, 200]`, tous de même taille.
- **Réponse** (`answering`, `POINTS_WHEEL_ANSWER_MS = 15_000`) : tout le monde répond en même temps avec A à D, une seule réponse comptée. La question se termine quand tous ont répondu ou à l'échéance.
- **Barème :**
  - juste : +V ;
  - faux : −V/2, jamais sous zéro (`cappedLoss`) ;
  - pas de réponse : 0. C'est la décision de mise du joueur.

**Cas particuliers.**
- Égalités : sans objet.
- 1 pupitre : jouable (`minParticipants` 1).
- Joueur absent : 0.

**Écran.**
- Pendant le tirage : la roue tourne et ralentit jusqu'au secteur tiré ; la question est cachée.
- Pendant la réponse : « En jeu : V » en grand, la question, A à D, les pupitres qui ont répondu, la consigne « Pas sûr ? Ne réponds pas ».

**Événements.** `wheel_stopped` (`questionId`, `sectorIndex`, `value`) à la fin du tirage, puis `answer_locked`, `points_awarded`, `question_ended`.
- Lumière : `wheel_stopped` → `QUESTION`.
- Son : `tick` pendant le tirage, `reveal` à l'arrêt.

### Course (`race`) — fr « Course », en « Race »

**Règle.**
- Tout le monde répond en même temps (`RACE_ANSWER_MS = 15_000`).
- Juste : +30 (`RACE_POINTS`) et un pas en avant.
- Faux : un pas en arrière, jamais sous 0.
- Pas de réponse : on reste sur place.
- Les pas sont recalculés depuis `roundAnswers`, comme la série. Une mauvaise réponse est une ligne avec `answerId` renseigné et `isCorrect` faux.

**Arrivée.**
- Le premier à atteindre `RACE_TARGET_STEPS = 4` gagne +150 (`RACE_FINISH_BONUS`) sur cette question, et la manche s'arrête (`isRoundOver`).
- Plusieurs arrivent sur la même question : le plus rapide gagne ; à la milliseconde près, tous les ex æquo gagnent.
- Personne arrivé à la dernière question : le ou les plus avancés (au moins 1 pas) touchent le bonus.
- Dernière question passée : le bonus est versé quand même aux plus avancés (`skipRecords`), comme pour la mort subite.

**Cas particuliers.**
- 1 pupitre : il court seul et touche le bonus en arrivant.
- 2 à 16 pupitres : sans changement.
- Joueur absent : reste sur place.

**Écran.** La question avec A à D, et une piste de 4 cases par pupitre, dans la couleur du pupitre. À la révélation, les pions avancent ou reculent.

**Événements.** `race_progressed` (pas par joueur, objectif) à chaque fin de question, `race_finished` (`participantId`).
- Lumière : `race_finished` → `CORRECT` sur le pupitre.
- Son : `tierUp`.

### Patate chaude (`hot_potato`) — fr « Patate chaude », en « Hot potato »

**Règle.**
- **Porteur initial** (première question de la manche) : le leader au score ; s'ils sont plusieurs ex æquo, tirage au hasard au `start`. Ensuite, le porteur est lu dans `roundData.holderId`.
- **Réponse** (`HOT_POTATO_ANSWER_MS = 10_000`) : le porteur répond seul avec A à D. Les appuis des autres sont ignorés.
  - Juste : +25 (`HOT_POTATO_POINTS`), puis il passe la patate.
  - Faux ou silence : il la garde.
- **Passe** (`passing`, `HOT_POTATO_PASS_MS = 6000`) : le porteur désigne n'importe quel adversaire, même à 0 point.
  - Jusqu'au pupitre 4 : bouton = pupitre.
  - Dès un pupitre 5 ou 6 : A et B font défiler, C ou D valide.
  - Sans choix : l'adversaire le plus riche, au plus petit pupitre en cas d'égalité.
  - La mécanique de désignation est extraite de `pointSteal.ts` vers un module `targeting.ts` partagé.
- **Explosion.**
  - Au `start` de chaque question, on tire `explodes` avec `HOT_POTATO_EXPLOSION_CHANCE = 0.25` ; c'est forcé à vrai sur la dernière question.
  - En fin de question (après l'éventuelle passe), celui qui tient la patate perd 150 (`HOT_POTATO_LOSS`), jamais sous zéro. La manche s'arrête (`roundData.exploded`).
  - Une ligne de perte avec `answerId` vide est créée si le perdant n'a pas répondu, comme pour la cible du vol de points.
  - L'écran ne révèle jamais le tirage.
- **Question passée :** la patate reste où elle est, pas d'explosion, même à la dernière question.

**Cas particuliers.**
- 2 pupitres : la passe se fait vers le seul adversaire (`minParticipants` 2).
- Porteur absent : la patate reste chez lui. Chaque question dure alors 10 s ; l'explosion termine la manche en moyenne vers la 4e question.

**Écran.**
- Le porteur en grand, la patate animée sans indice de temps, la question.
- Pendant la passe : « {nom} donne la patate », la liste des cibles.

**Événements.**
- `hot_potato_received` (porteur en début de question) → lumière `BUZZ` sur son pupitre.
- `hot_potato_target_requested`.
- `hot_potato_passed` (`from`, `to`, `automatic`) → lumière `BUZZ` sur le pupitre de la cible, son `buzz`.
- `hot_potato_exploded` (`participantId`, `points`) → lumière `WRONG`, son `lostForAll`.

### Duel (`duel`) — fr « Duel », en « Duel »

**Règle.** `minParticipants: 3`.
- **Tirage des duellistes** au `start` : les deux joueurs qui ont le moins combattu dans la manche (compteurs dans `roundData.duels`). Égalités départagées au hasard, en évitant si possible la même paire deux fois de suite.
- **Intro** (`DUEL_INTRO_MS = 4000`) : les deux noms face à face, la question est cachée. Les spectateurs font leur pronostic : A = duelliste au plus petit pupitre, B = l'autre. Un seul appui compté, gardé secret ; plus de pronostic après l'intro.
- **Buzz** (`DUEL_WINDOW_MS = 12_000`) : seuls les duellistes buzzent. Le premier répond seul en 5 s (`DUEL_ANSWER_TIMEOUT_MS`). On réutilise la brique `buzzToAnswer`, démarrée avec les seuls duellistes.
  - Juste : +100 (`DUEL_POINTS`).
  - Faux : −25, jamais sous zéro (règle maison) ; la main passe à l'autre duelliste.
  - Les deux se trompent, ou personne ne buzze : pas de vainqueur.
- **Pronostics :** +20 (`DUEL_PREDICTION_POINTS`) si le duelliste choisi gagne.
- **Lignes de réponse :** `stage = 1` pour un duelliste, `stage = 2` pour un pronostic. Un pronostic a `answerId` vide et `isCorrect` faux, pour que `winnerIds` et les lumières ne retiennent que le duelliste.
- **Question passée :** les compteurs ne bougent pas, la même paire rejoue.

**Cas particuliers.**
- Duelliste absent : l'autre peut buzzer seul.
- À 6 pupitres : 4 spectateurs par question ; chacun combat environ 3 fois en 10 questions.

**Écran.**
- Intro : les deux pupitres face à face, « A ou B ? », le nombre de pronostics.
- Ensuite : la question, une fenêtre de buzz réservée aux duellistes, « {nom} répond ».

**Événements.** `duel_started` (`duelistIds`) → lumière `CHOOSER`, son `tierUp`. `prediction_locked` (`participantId` seul). Puis `buzzer_pressed`, `answer_correct` et `answer_wrong`, déjà existants.

## 3. Extraits musicaux transformés

**Interface.** Dans `@quizzup/audio`, `play(url, startSec, durationMs, options?)` avec `PlayOptions = { effect?: ExtractEffect; elapsedMs?: number }`, où `ExtractEffect = 'none' | 'reverse' | 'slowed'`, et la constante `SLOWED_PLAYBACK_RATE = 0.75`.
- `pause()`, `resume()` et `stop()` ne changent pas. Les millisecondes renvoyées restent du temps réel écoulé, donc cohérentes avec le moteur.
- `elapsedMs` remplace le calcul `startSec + elapsed` dans `audioBridge.restore`. Ce calcul serait faux avec un effet.
- `demoSynthPlayer.ts` et `createRoutingExtractPlayer` relaient les options ; la démo synthétisée peut les ignorer.

**Effets.**
- **`reverse`** : à la lecture, on construit un tampon inversé de la seule fenêtre `[startSec, startSec + durée du palier]`, puis on le lit depuis `elapsedMs`.
  - Rien à préparer à l'avance : copier 20 s en stéréo ne prend que quelques millisecondes ; à mesurer sur le banc.
  - Chaque palier joue sa propre fenêtre à l'envers : le palier 2 se termine donc sur le contenu du palier 1. C'est assumé et documenté.
- **`slowed`** : `playbackRate = 0.75`.
  - La `duration` de `source.start` s'exprime en secondes **du fichier** : on passe le temps réel × 0,75.
  - Position dans le fichier : `startSec + playedMs × 0,75`.
  - Fin du fichier, en temps réel : `(duration − startSec) / 0,75`.
- **`short`** (très court) : c'est une affaire de **moteur**, pas de son. Le blind test utilise alors `FLASH_BLIND_TEST_SHORT_STAGE_DURATIONS_MS = [500, 2000, 10_000]` au lieu de 1 / 5 / 20 s. Fenêtres de buzz et points (100 / 50 / 20) inchangés.

**Choix de la transformation : par question.** La reconnaissance d'un extrait inversé dépend de l'extrait, donc c'est l'auteur qui choisit.
- Écarté « par mini-jeu » : une variante de blind test par effet multiplierait les mini-jeux.
- Écarté « par manche tirée au sort » : le moteur appliquerait un effet qui rend certains extraits injouables.

**Stockage.**
- Constantes `QUESTION_AUDIO_EFFECT_NONE`, `QUESTION_AUDIO_EFFECT_SHORT`, `QUESTION_AUDIO_EFFECT_REVERSE`, `QUESTION_AUDIO_EFFECT_SLOWED` et la liste `QUESTION_AUDIO_EFFECTS` dans shared.
- Colonne `questions.audio_effect varchar(20) NOT NULL DEFAULT 'none'`, avec CHECK.
- Le serveur refuse un effet autre que `none` si la question n'est pas audio : erreur `400 audio_effect_requires_audio`.
- `room/_content.ts` renvoie `audioEffect`, repris dans `EngineQuestion.audioEffect` (facultatif), puis dans le payload de `blind_test_stage_started`. `audioBridge` le transmet au lecteur.

**Effet sur le blind test existant.** Aucun tant que la valeur est `none`. Les paliers et la pause sur buzz sont identiques, en temps réel.

**Limites de Web Audio, et ce qu'on accepte.**
- `playbackRate` et `detune` lient hauteur et vitesse. `preservesPitch` n'existe que sur `<audio>`, pas sur `AudioBufferSourceNode`.
- On accepte **un seul effet « ralenti »**, plus lent et plus grave d'environ 5 demi-tons.
- Baisser la hauteur sans ralentir demanderait un AudioWorklet de traitement du signal ou une nouvelle dépendance : hors V1.

**Préchargement.** Inchangé. L'aperçu au backoffice se fait en Web Audio natif, en quelques lignes, dans une PR à part et facultative : `<audio>` ne sait pas lire à l'envers.

**Tests sans son réel.**
- Le faux `AudioContext` du paquet vérifie : la valeur de `playbackRate`, les arguments de `start(when, offset, duration)`, l'ordre inversé des échantillons sur une rampe connue, la pause et la reprise avec un effet, la fin de fichier.
- Moteur : durées des paliers en `short` et payload.
- `audioBridge` : options transmises et reprise après rechargement.
- Backend : CHECK aligné sur la constante, refus d'un effet sur une question non audio.

## 4. Test de contrat mini-jeux

**Où.** `game/room-app/tests/unit/miniGameContract.test.ts`. Seul `room-app` voit à la fois shared, le moteur, les vues et ses locales, par les alias de `vite.config.ts` et `tsconfig.json`.

**Ce qu'il vérifie, pour chaque valeur de `MINI_GAMES` :**
- `MINI_GAME_DEFINITIONS[id]` existe et son `.id` vaut `id` ;
- `MINI_GAME_QUESTION_ESTIMATES_MS[id]` existe ;
- les modes d'écran du mini-jeu, dans un nouveau registre explicite `MINI_GAME_VIEW_MODES: Record<MiniGame, readonly MiniGameScreenMode[]>` de `miniGameViews.ts` (non vide), ont chacun un composant dans `GAME_SCREENS` (`src/views/game/screens.ts`). `GameView.vue` passe pour cela de sa chaîne `v-if` à `<component :is>` ;
- `game.miniGames[id].name`, `.pitch` et `.rules` sont non vides en `fr` et en `en` ;
- aucune clé orpheline dans les locales.

**Libellés du backoffice.** Déjà vérifiés par `backoffice/tests/frontend/src/utils/game/helpers.test.ts`, qui boucle sur `MINI_GAMES`. On ne fait pas lire à `room-app` les fichiers du backoffice.

## 5. Décisions ouvertes

1. **« 30 / 60 minutes », c'est un créneau (jeu ≤ 20 et ≤ 45 min) ?** Je recommande oui : un créneau ne doit pas déborder, et 10 × 10 tient alors à 43 min au plus. **Par défaut : oui.**
2. **Standard = 10 × 10 maintenu ?** Je recommande oui : le calcul le confirme, et la base comme l'API ont déjà 10 × 10 par défaut. À revoir si le lot 5 ajoute plus de 5 min. **Par défaut : oui.**
3. **Le personnel peut-il changer le format au lobby de la salle ?** Je recommande non : la partie stockée divergerait de ce qui est joué. **Par défaut : non, affichage seulement.**
4. **Tirage des mini-jeux sans remise ?** Je recommande oui : chaque tirage reste équiprobable et on évite « encore la mort subite ». **Par défaut : oui.**
5. **Remplacer « don de points » par « Patate chaude » ?** Je recommande oui : c'est un doublon du vol de points, sans intérêt à 2 joueurs. **Par défaut : oui.**
6. **Pronostics des spectateurs au duel (+20) ?** Je recommande oui : sans eux, 4 joueurs sur 6 attendent. On peut les retirer après un essai. **Par défaut : oui.**
7. **Roue : une erreur coûte la moitié de V ?** Je recommande oui : sans risque, s'abstenir n'a aucun sens ; sans moitié, le jeu devient brutal. **Par défaut : oui.**
8. **Effet audio par question (plutôt que par thème) ?** Je recommande par question : c'est l'auteur qui juge si l'extrait reste reconnaissable. Un réglage par lot pourra venir plus tard. **Par défaut : par question.**
9. **Accepter « ralenti » = plus lent et plus grave en un seul effet ?** Je recommande oui : on reste sur Web Audio natif, sans dépendance. **Par défaut : oui, 0,75.**
10. **Ajouter « accéléré et plus aigu » (1,33) ?** Je recommande non pour l'instant : l'ajout coûterait une ligne, mais c'est un effet de plus à juger en salle. **Par défaut : non.**
11. **Juridique (Victoria) : un extrait transformé peut toucher au droit moral de l'auteur (intégrité de l'œuvre). Les transformations sont-elles limitées aux contenus dont les droits sont réglés, en attendant le lot 10 ?** **Par défaut : oui**, seulement sur le contenu éditeur du domaine public.

## 6. Découpage en PR

**Fichiers chauds** : `shared/src/index.ts`, `miniGames/index.ts`, `types.ts`, `miniGame.ts`, `GameView.vue`, `miniGameViews.ts`, les locales. Le socle les touche **une seule fois** pour les quatre mini-jeux.
- Une ébauche par mini-jeu dans son propre fichier, avec `minParticipants: GAME_PODIUMS + 1` : jamais jouable, mais elle compile et reste éligible aux QCM, ce qui garde `demoContent.test` vert.
- Écrans et constructeurs de vue en fichiers séparés.
- La branche actuelle (passer et pause) modifie `GameView.vue` : la PR 4.0 part **après son merge**.

| PR | Taille | Objectif et fichiers | Exclus | Tests | Dépend de |
| --- | --- | --- | --- | --- | --- |
| **3.1** Formats partagés | S | shared : formats, `GAME_DEFAULT_TIMINGS_MS`, estimations, `estimateGameDurationMs` ; `engine.ts` (délais lus dans shared) ; `LobbyView.vue` (démo) | base de données, API | `tests/backend/src/shared/gameDuration.test.ts`, `engine/tests/durationEstimates.test.ts`, test du lobby démo | — |
| **3.2** Tirage sans remise | S | `engine.ts` `beginRound`, README | — | `miniGameRotation.test.ts` (aucun doublon tant que possible, jamais deux fois de suite, rejouable) | — |
| **3.3** Format côté serveur | S | migration `games.format`, `games/_schemas.ts`, `games.ts`, `_shared.ts`, route room, `openapi.yaml`, `db.dbml` | interface | route (format → nombres, mélange refusé, défaut standard, ancienne partie à `null`), aller-retour de migration, schéma aligné sur `GAME_FORMATS` | 3.1 |
| **3.4** Format au backoffice et au lobby | S | `CreateGameForm.vue`, `form.ts`, `types/game.ts`, `games.json` fr/en, `StaffGameLobby.vue`, `room.json` | — | formulaire (Personnalisé fait apparaître les champs, estimation affichée), libellé du lobby | 3.3 |
| **4.0** Contrat et registre d'écrans | S | `miniGameViews.ts` (`MINI_GAME_VIEW_MODES`), `views/game/screens.ts`, `GameView.vue`, `miniGameContract.test.ts` | nouveaux mini-jeux | contrat ; `GameViewPause` et `MiniGameScreens` restent verts | merge pause, 3.1 |
| **4.1** Socle V1.1 | M | shared (4 constantes et leurs estimations) ; migration `…_add_v1_1_mini_games_to_game_rounds.js` et `gameSchema.test.ts` qui la lit ; DBML, OpenAPI ; moteur : `QuestionContext.random`, `roundData`, nouveaux types d'événements, 4 ébauches, registre, README ; room-app : 4 constructeurs vides et 4 écrans vides branchés ; locales `game.json` et `games.json` en textes définitifs ; `DEFAULT_BINDINGS` ; `uiSoundBridge.ts` | règles des mini-jeux | contrat aléatoire et `roundData` par un mini-jeu sonde (`vi.mock` du registre) ; ébauches jamais jouables ; couverture moteur 90/90/85/90 tenue | 4.0 |
| **4.2** Roue | M | `pointsWheel.ts`, `game/views/pointsWheel.ts`, `WheelScreen.vue`, `e2e/.../mini-game-points-wheel.spec.ts` | fichiers chauds | secteur tiré = rejouable avec la graine, +V / −V/2 bornée / abstention, pause qui gèle la roue | 4.1 |
| **4.3** Course | M | `race.ts`, vue, `RaceScreen.vue`, e2e | fichiers chauds | avance et recul bornés, ex æquo à la ms, bonus des plus avancés, dernière question passée, solo | 4.1 |
| **4.4** Patate chaude | M | `hotPotato.ts`, `targeting.ts` (extrait de `pointSteal.ts`), vue, écran, e2e | — | porteur initial, passe directe et par défilement, cible automatique, explosion forcée à la dernière question, passée = rien, perte bornée ; tests du vol de points inchangés | 4.1 |
| **4.5** Duel | M | `duel.ts`, vue, `DuelScreen.vue`, e2e | — | rotation des duellistes, pronostics limités à l'intro, main qui passe, −25 borné, `stage` 1 et 2, `winnerIds` réduit aux duellistes | 4.1 |
| **A.1** Lecteur avec effets | S | `game/audio` (`extractPlayer.ts`, `webAudioExtractPlayer.ts`, README) | jeu | faux contexte (voir §3) | — |
| **A.2** Effet stocké | S | shared, migration `questions.audio_effect`, routes questions, `room/_content.ts`, OpenAPI, DBML | interface | validation, CHECK, contenu de salle | — |
| **A.3** Effet joué | S | `EngineQuestion`, `flashBlindTest.ts` (paliers `short`), `audioBridge.ts`, `demoSynthPlayer.ts`, contenu de salle | — | paliers, payload, transmission, reprise | A.1, A.2 |
| **A.4** Formulaire de question | S | sélecteur d'effet (questions audio seulement), i18n, aperçu Web Audio facultatif | — | formulaire | A.2 |

Documentation à chaque PR : CHANGELOG (lignes `US:`), README du moteur et de l'audio, OpenAPI et DBML, `REPRISE.md`.

**En parallèle tout de suite** : 3.1, 3.2, A.1, A.2. Ensuite 3.3 puis 3.4, et A.3 puis A.4. Après le merge de la pause : 4.0, puis 4.1, puis **4.2 à 4.5 en parallèle**.

## 7. Risques et ce qui doit être validé en vrai

- **Durées.** Les hypothèses du typique (60 %, 40 %, palier 2) ne sont pas mesurées, et l'écart typique / haut est large (×1,5). Il faut mesurer 3 parties par format sur le banc, puis recaler `typicalMs` à partir des horodatages des événements (suivi en direct du lot 1).
- **Intro de 4 s.** Trop courte pour lire 4 règles d'un mini-jeu nouveau. À juger sur le banc, puis avec la voix du lot 5.
- **Lisibilité à 5 m.** Les 8 valeurs de la roue, la piste de la course à 6 pupitres, la liste de défilement à 5 ou 6 pupitres et les noms face à face du duel. À ajouter dans `banc-materiel.md`.
- **Plaisir de jeu.** L'attente des non-porteurs à la patate, l'intérêt des pronostics, la frustration du recul à la course, l'abstention à la roue. À tester avec de vrais joueurs ; les constantes se règlent sans changer les règles.
- **Équilibre des scores.** Les gros écarts possibles de la roue, la perte de 150 à la patate face aux 100 points habituels.
- **Matériel.** Coût de l'inversion audio sur un PC de salle modeste, artefacts du ralenti sur les enceintes, vrais buzzers pour la désignation par défilement.
- **Ébauches du socle.** Entre 4.1 et 4.5, les quatre mini-jeux apparaissent cochables au backoffice. Une sélection limitée à eux est refusée par la salle, mais il ne faut pas déployer en recette pendant ce temps.
- **Tirages modifiés.** Le tirage sans remise (3.2) change les tirages des tests à graine fixe. Ces tests sont à mettre à jour, sans en retirer d'assertion.

Fichiers clés lus :
- `game/engine/src/engine.ts`
- `game/engine/src/miniGames/miniGame.ts`
- `game/engine/src/miniGames/pointSteal.ts`
- `game/room-app/src/views/LobbyView.vue`
- `game/room-app/src/views/lobby/StaffGameLobby.vue`
- `game/room-app/src/game/miniGameViews.ts`
- `game/audio/src/webAudioExtractPlayer.ts`
- `game/room-app/src/audio/audioBridge.ts`
- `backoffice/backend/src/routes/games/_schemas.ts`
- `backoffice/backend/db/migrations/20261103220200_create_games_tables.js`
- `game/hardware/src/lighting/scenes.ts`