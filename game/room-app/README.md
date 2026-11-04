# @quizzup/room-app — écran de salle

Application Vue 3 qui tourne **dans Chrome ou Edge sur le PC de la salle**, sans rien installer
(US-ROOMAPP-01, #61). Elle exécute le moteur de jeu (`game/engine`), lit les buzzers, joue les
extraits du blind test et affiche la partie sur l'écran de la salle.

- **Charte** : la feuille `backoffice/frontend/src/assets/styles/main.css` est importée telle
  quelle (fonds, accents bleu-violet, néons, Exo 2) ; on n'ajoute que les couleurs des 6 pupitres
  (dérivées des accents) et une typographie « plateau TV » lisible de loin.
- **Composants** : `UiButton`, `FormField`, `SectionCard`, `ConfirmModal`… sont repris du
  backoffice à l'identique.
- **Moteur, matériel, audio et constantes** consommés en sources via des alias
  (`@quizzup/game-engine`, `@quizzup/hardware`, `@quizzup/audio`, `@quizzup/shared`), sans build.

## Parcours

| Écran     | Route       | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion | `/login`    | Compte de salle (rôle `room`, US-ROOM-02) ou **mode démo** sans compte.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Lancement | `/`         | « Lancer la salle » : plein écran, écran maintenu allumé, son débloqué, touches système captées. Reprise d'une partie interrompue.                                                                                                                                                                                                                                                                                                                                                                                    |
| Lobby     | `/lobby`    | **Compte de salle** : la partie est préparée au backoffice (joueurs, pupitres, format) ; l'écran l'attend (`GET /room/games/current`, vérifiée toutes les 3 s), affiche les joueurs, précharge les extraits puis la démarre (`POST /room/games/:id/start`). **Mode démo** : un joueur par pupitre (4 par défaut, jusqu'à 6 selon le réglage de la salle), pseudo, email facultatif avec **consentement RGPD explicite et horodaté**. Un appui buzzer fait briller son pupitre. Format 10 × 10 ou partie courte 3 × 3. |
| Matériel  | `/hardware` | Nombre de pupitres de la salle (1 à 6, 4 par défaut, enregistré dans `rooms.config.desksCount` et relu par le backoffice), association des buzzers (apprentissage pupitre × A-D) et test, lumières (salle simulée, connexion de l'interface DMX, scènes de test, identification), fumée (autorisation par l'opérateur, test), **arrêt d'urgence**, configuration avancée en JSON.                                                                                                                                     |
| Partie    | `/play`     | Annonce du mini-jeu tiré au sort → choix du thème par le joueur désigné (A-D) → question du mini-jeu (blind test éclair, rapidité, premier buzz, vrai ou faux, quitte ou double, mort subite, vol de points, série, estimation, révélation progressive) → révélation → bilan de manche → podium final.                                                                                                                                                                                                                |

Une alerte plein écran signale la **perte de focus** (les buzzers clavier ne sont plus reçus).

## Architecture

```
src/
├─ game/        session de jeu (moteur + sauvegarde/reprise), sélecteurs d'affichage, lobby RGPD
├─ hardware/    matériel de la page (roomHardware.ts : config, buzzers, lumières), plein écran / wake lock
├─ audio/       lecteur silencieux (tests), ponts événements moteur → extraits et sons d'interface
├─ views/       écrans (login, lancement, lobby, partie) et sous-écrans de phase (views/game)
└─ components/  composants de jeu (tableau des scores, réponses A-D, minuteur…) et UI du backoffice
```

- **Mini-jeux tirés au sort** : tous par défaut. Le réglage `localStorage`
  `quizzup_room_mini_games` (liste JSON de codes, ex. `["flash_blind_test"]`) restreint le tirage
  sur cette salle, en attendant `rooms.config` ; les tests de bout en bout s'en servent pour le
  blind test (`src/game/miniGamesSetting.ts`).
- **L'écran ne calcule aucune règle** : il envoie des commandes horodatées au moteur
  (`start`, `tick` toutes les 50 ms, `press`, `abort`) et lit `state.phase` via `game/selectors.ts`.
- **Reprise après rechargement** : graine + commandes (hors ticks) sont sauvegardées dans
  `localStorage` ; la reprise se fait d'un clic depuis l'écran de lancement (plein écran et son
  à rouvrir), la partie est rejouée, l'horloge recalée et l'extrait en cours relancé. La
  sauvegarde, qui contient les emails consentis, est effacée dès la fin de la partie et à la
  déconnexion de la salle.
- **Matériel** (`hardware/roomHardware.ts`) : **une seule** entrée buzzers
  (`createKeyboardBuzzerInput` de `game/hardware`) et **un seul** contrôleur de lumières pour
  toute la page. Le contrôleur démarre au clic « Lancer la salle », reçoit tous les événements du
  moteur (`handleGameEvent`) et s'arrête (noir, fumée coupée) à la déconnexion. Une interface DMX
  déjà autorisée se reconnecte sans clic. La
  copie de secours de la config est gardée dans le navigateur (`quizzup_room_hardware`).
- **Audio** (`main.ts`) : `WebAudioExtractPlayer` de `game/audio` (extraits préchargés et décodés
  avant la partie, téléchargés avec le jeton de la salle) et `UiSoundPlayer` sur le même
  `AudioContext` pour les sons d'interface (buzz, bonne / mauvaise réponse, palier suivant…).
- **Contenu** : `GET /room/games/current/content` (`utils/roomApi.ts`), chemins de médias
  complétés avec `VITE_API_URL` ; seuls les extraits **audio** sont préchargés. En mode démo,
  thèmes « sans tubes » dont les extraits `demo://` sont **synthétisés** à la volée
  (`audio/demoSynthPlayer.ts`, libres de droits).
- **Config matérielle** : gardée sur le compte de la salle (`rooms.config`), relue via
  `GET /room/me` et enregistrée via `PUT /room/config` (`hardware/hardwareSync.ts`) ; le navigateur
  n'en garde qu'une copie de secours.

### Clavier de simulation

Utilisé tant qu'aucun buzzer n'est associé (écran Matériel).

| Pupitre | A   | B   | C   | D   |
| ------- | --- | --- | --- | --- |
| 1       | `1` | `2` | `3` | `4` |
| 2       | `Q` | `W` | `E` | `R` |
| 3       | `A` | `S` | `D` | `F` |
| 4       | `Z` | `X` | `C` | `V` |

Touches physiques (`KeyboardEvent.code`) : sur un clavier AZERTY, la rangée du pupitre 2 est
`A Z E R`, celle du pupitre 3 `Q S D F`, celle du pupitre 4 `W X C V`.

## Commandes

```bash
npm install          # .npmrc : legacy-peer-deps (comme game/engine)
npm run dev          # http://localhost:4174 (VITE_API_URL pour l'API, défaut :3001 ;
                     # le backend doit autoriser l'origine :4174 dans CORS_ORIGIN)
npm run lint
npm run format:check
npm run type-check
npm test             # npm run test:coverage : seuils 80 % lignes / 75 % branches
npm run build
```
