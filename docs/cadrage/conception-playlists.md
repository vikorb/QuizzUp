# Conception : playlists par genre pour le blind test

> Issue #204. Conception du 24 novembre 2026. Complète `conception-formats-mini-jeux.md` (audio).

## 1. Principe

Une playlist est un **thème `audio` qui porte l'identifiant d'une playlist du fournisseur
d'extraits**. Le `scope` global ou compagnie des thèmes règle le multi-compagnies sans rien ajouter.

Quand la salle charge le contenu au lancement, juste avant le préchargement, le serveur lit la
playlist en un appel, tire `questions_per_round` titres et fabrique pour chacun une question « Quel
est ce titre ? » avec trois leurres pris dans la même playlist. **Le moteur ne change pas.**

Un thème-playlist qui échoue (fournisseur muet, playlist supprimée ou trop petite) est écarté seul.
La partie part avec le reste.

Écarté :

- **Importer chaque playlist en lignes `questions` / `answers`** : synchronisation à maintenir,
  centaines de lignes par genre, leurres figés, un appel au fournisseur par question au chargement.
- **Envoyer toute la playlist et tirer dans la salle** : change le contrat du contenu sans gain.
  Choisir le contenu jouable, le serveur le fait déjà ; ce n'est pas arbitrer la partie.

Ce que ce choix interdit plus tard : les questions tirées ont des id négatifs (`-trackId`), donc
aucune ligne `game_answers` ne peut pointer vers elles. Le jour où la salle remontera ses réponses,
`question_id` devra devenir nullable, avec une référence au titre.

## 2. Données et routes

Migration `add_playlist_to_themes`, sur le modèle de
`20261124110000_add_media_provider_to_questions.js` (`lock_timeout`, retour arrière refusé si une
colonne est utilisée) :

- `themes.playlist_provider varchar(20) NULL`, CHECK sur la liste des fournisseurs (constante
  partagée existante) ;
- `themes.playlist_ref varchar(64) NULL`, CHECK `~ '^\d{1,20}$'` ;
- CHECK de paire (les deux nuls ou les deux renseignés) et CHECK `playlist_ref IS NULL OR mode =
  'audio'` ;
- aucun titre ni lien stocké.

Service : `getProviderPlaylistTracks(ref)` dans `services/mediaProvider.ts`. Il réutilise `fetchJson`
(délai 5 s) et lit `GET /playlist/<ref>/tracks?limit=500` en un seul appel. `trackSchema` gagne
`readable` et `title_short`.

Backoffice :

- `POST /themes` et `PATCH /themes/:id` acceptent `playlistRef: string | null` ; `GET` le renvoie.
  Le frontend extrait les chiffres d'un lien de playlist.
- Contrôle à l'enregistrement : 422 `theme_playlist_not_found` (playlist inconnue), 422
  `theme_playlist_too_small` (moins de 4 titres avec extrait), 502 `media_provider_unavailable`.
- Droits inchangés : ceux du thème.

Salle :

- `GET /room/games/current/content` : contrat inchangé. Question `id = -trackId`,
  `mediaType: 'audio'`, `mediaUrl` = lien d'extrait, `mediaCredit` rempli ; réponses `id = -trackId`
  de chaque titre.
- Nouvelle route `GET /room/games/current/tracks?refs=1,2` pour la reprise après rechargement :
  compte de salle, partie en cours obligatoire, références en chiffres, au plus
  `ROOM_CONTENT_MAX_IDS` ; réponse `{ items: [{ ref, mediaUrl, mediaCredit }] }`.

## 3. Tirage

- **Quand** : dans `loadRoomContent`, au lancement. Pas à la création de la partie : un lien
  d'extrait expire 15 minutes après sa lecture.
- **Volume** : K = `games.questions_per_round` titres par playlist, au plus 6 playlists par partie
  (tirées au hasard s'il y en a plus). La lecture d'une playlist est limitée à ses 500 premiers titres
  (un seul appel) : le tirage de L2 porte donc sur ces 500 titres.
- **Titres jouables** : `readable` non faux (champ absent = jouable) et lien d'extrait en `https`. Doublons retirés sur
  `title_short` normalisé (minuscules, sans accents ni espaces superflus).
- **Leurres** : 3 titres pris dans toute la liste, même sans extrait ; titres normalisés distincts
  du bon et entre eux. Texte des réponses : « titre – artiste ».
- **Playlist trop petite** : moins de 2 titres jouables, thème écarté ; 2 ou 3 titres, autant de
  réponses ; moins de K titres, manche plus courte.
- **Rejeu** : dans une partie, `usedQuestionIds` du moteur empêche de rejouer un titre, même présent
  dans deux playlists. D'une partie à l'autre : nouveau tirage, sans mémoire.
- **Pannes** : une erreur propre à une playlist n'écarte qu'elle ; seuls un quota dépassé ou un délai
  coupent tous les appels. Après le préchargement, une coupure d'internet ne change rien.
- **Reprise** : `refreshSavedMedia` (écran de salle) doit séparer les id positifs (`?ids=`) des id
  négatifs (route `tracks`), sinon le schéma répond 400 et la sauvegarde garde des liens expirés.

## 4. Lots

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| L1 (M) | Migration, DBML, `getProviderPlaylistTracks`, `POST` / `PATCH` / `GET /themes`, OpenAPI | |
| L2 (M) | `routes/room/_playlists.ts` (fonction pure `buildPlaylistQuestions(tracks, count, random)`), intégration à `loadRoomContent`, route `tracks`, OpenAPI | L1 |
| L3 (S) | Écran de salle : `fetchCurrentTracks`, `refreshSavedMedia` scindé, test moteur avec id négatifs | L2 |
| L4 (S) | Backoffice : champ « Lien de playlist » du formulaire de thème en mode audio, i18n | L1 |

## 5. À mesurer sur le banc

- Mémoire du navigateur et durée du préchargement avec 6 playlists de 10 extraits (estimation :
  environ 700 Mo décodés). Si c'est trop : garder le MP3 et ne décoder qu'au moment de la question.
- Couper internet après le lancement et vérifier que la partie continue.

## 6. Choix par défaut

- Les réponses affichent « titre – artiste ».
- L'opérateur n'impose pas de genre : les joueurs choisissent parmi les thèmes proposés.
- Aucune mémoire des titres joués d'une partie à l'autre.
