# @quizzup/room-app — écran de salle

Application Vue 3 qui tourne **dans Chrome ou Edge sur le PC de la salle**, sans rien installer
(US-ROOMAPP-01, #61). Elle exécute le moteur de jeu (`game/engine`), lit les buzzers, joue les
extraits du blind test et affiche la partie sur l'écran de la salle.

- **Charte** : la feuille `backoffice/frontend/src/assets/styles/main.css` est importée telle
  quelle (fonds, accents bleu-violet, néons, Exo 2) ; on n'ajoute que les couleurs des 4 pupitres
  (dérivées des accents) et une typographie « plateau TV » lisible de loin.
- **Composants** : `UiButton`, `FormField`, `SectionCard`, `ConfirmModal`… sont repris du
  backoffice à l'identique.
- **Moteur et constantes** consommés en sources via des alias (`@quizzup/game-engine`,
  `@quizzup/shared`), sans build.

## Parcours

| Écran     | Route    | Rôle                                                                                                                                                                                           |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion | `/login` | Compte de salle (rôle `room`, US-ROOM-02) ou **mode démo** sans compte.                                                                                                                        |
| Lancement | `/`      | « Lancer la salle » : plein écran, écran maintenu allumé, son débloqué, touches système captées. Reprise d'une partie interrompue.                                                             |
| Lobby     | `/lobby` | Un joueur par pupitre (1 à 4) : pseudo, email facultatif avec **consentement RGPD explicite et horodaté**. Un appui buzzer fait briller son pupitre. Format 10 × 10 ou partie courte 3 × 3.    |
| Partie    | `/play`  | Annonce du mini-jeu tiré au sort → choix du thème par le joueur désigné (A-D) → blind test éclair (paliers 1 s / 5 s / 20 s, 100 / 50 / 20 pts) → révélation → bilan de manche → podium final. |

Une alerte plein écran signale la **perte de focus** (les buzzers clavier ne sont plus reçus).

## Architecture

```
src/
├─ game/        session de jeu (moteur + sauvegarde/reprise), sélecteurs d'affichage, lobby RGPD
├─ hardware/    port buzzers + clavier de simulation, plein écran / wake lock / keyboard lock
├─ audio/       port lecteur d'extraits + lecteur silencieux, pont événements moteur → audio
├─ views/       écrans (login, lancement, lobby, partie) et sous-écrans de phase (views/game)
└─ components/  composants de jeu (tableau des scores, réponses A-D, minuteur…) et UI du backoffice
```

- **L'écran ne calcule aucune règle** : il envoie des commandes horodatées au moteur
  (`start`, `tick` toutes les 50 ms, `press`, `abort`) et lit `state.phase` via `game/selectors.ts`.
- **Reprise après rechargement** : graine + commandes (hors ticks) sont sauvegardées dans
  `localStorage` ; la reprise se fait d'un clic depuis l'écran de lancement (plein écran et son
  à rouvrir), la partie est rejouée, l'horloge recalée et l'extrait en cours relancé. La
  sauvegarde, qui contient les emails consentis, est effacée dès la fin de la partie et à la
  déconnexion de la salle.
- **Ports** à brancher quand les paquets voisins seront mergés :
  - buzzers appris : `setBuzzerInputFactory()` (`hardware/useBuzzers.ts`) ← `game/hardware` ;
  - lecture Web Audio : `configureRoomGame({ player })` (`game/useRoomGame.ts`) ← `game/audio` ;
  - contenu de la compagnie : `loadRoomThemes()` (`game/content.ts`) ← API à créer. En attendant,
    la salle joue un contenu de démonstration « sans tubes » (instruments, bruitages…).

### Clavier de simulation

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
