# Utiliser QuizzUp au quotidien

Ce guide s'adresse au **personnel du centre** : la personne qui ouvre la salle, accueille les joueurs
et lance les parties. La salle doit déjà être installée : voir
[`installation-salle.md`](installation-salle.md).

> **Honnêteté d'abord.** Ce guide décrit ce que le code fait aujourd'hui. **Rien n'a encore été
> validé sur du vrai matériel** (buzzers, lumières, fumée). Les points à confirmer sont marqués
> `> À vérifier sur le banc :`. Les captures d'écran, signalées par `<!-- capture : … -->`, seront
> ajoutées après la recette.

## Comment ça marche, en deux phrases

Le personnel prépare et lance la partie **depuis le backoffice** (l'outil de gestion, sur n'importe
quel ordinateur). L'**écran de salle** (le PC de la salle) reçoit la partie, l'anime avec les
buzzers, les lumières et le son, puis renvoie les scores au backoffice.

L'écran de salle n'inscrit personne : c'est le personnel qui inscrit les joueurs au backoffice.

## 1. Ouvrir la salle

1. Allume l'écran, les enceintes, les lumières et le PC de la salle. Branche l'interface DMX USB et
   les buzzers si ce n'est pas déjà fait.
2. Si la salle utilise une machine à fumée, applique d'abord le contrôle d'ouverture de
   [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).
3. Sur le PC, attends que l'écran « Prêt à jouer » s'affiche (avec l'installation automatique, il
   s'ouvre tout seul).
4. Clique sur « Lancer la salle ».

**Ce que tu dois voir** : l'écran passe en plein écran et affiche « Partie du jour » avec le message
« En attente d’une partie ». Le son est débloqué (il ne peut l'être qu'après un clic).

<!-- capture : salle-en-attente.png — écran « En attente d’une partie » -->

**Si ça ne marche pas**

- « Le plein écran a été refusé par le navigateur. Tu peux le relancer avec la touche F11. » : appuie
  sur F11.
- Tu vois « Connexion de la salle » au lieu de « Prêt à jouer » : la session a expiré ou le compte a
  été supprimé. Reconnecte la salle avec son identifiant et son mot de passe. Voir
  [`depannage.md`](depannage.md).
- Tu vois « Backoffice injoignable » : vérifie la connexion internet du PC, puis clique sur
  « Réessayer ».

## 2. Créer et lancer une partie (au backoffice)

1. Connecte-toi au backoffice.
2. Ouvre « Parties », puis clique sur « Lancer une partie ». La page « Nouvelle partie » s'ouvre.
3. Renseigne :
   - « Salle » : choisis la salle (« Choisir une salle ») ;
   - « Manches » et « Questions par manche » ;
   - la section « Mini-jeux » : les mini-jeux sont tirés au sort parmi ceux que tu coches (au moins
     un) ;
   - la section « Participants » : voir ci-dessous.
4. Clique sur « Lancer la partie ».

### Inscrire les joueurs

Dans « Participants », clique sur « Ajouter un participant », puis renseigne :

- « Pupitre » : le numéro du pupitre (de 1 à 6, selon ce que la salle possède) ;
- « Nom affiché » : le pseudo montré à l'écran ;
- « Email » : facultatif. S'il est renseigné, le consentement du joueur est **obligatoire**.
- « Ajouter un 2e joueur » : pour jouer à deux sur le même pupitre.

Il faut de 1 à 6 pupitres, avec 1 ou 2 joueurs par pupitre.

> **À venir** : l'inscription des joueurs par QR code, depuis leur téléphone, n'existe pas encore.
> Aujourd'hui, c'est toujours le personnel qui saisit les joueurs.

**Ce que tu dois voir au backoffice** : la partie apparaît dans la liste, avec l'état « En attente ».

**Ce que tu dois voir sur l'écran de salle** : en quelques secondes (l'écran interroge le backoffice
toutes les 3 secondes), le message « Partie prête : … manches × … questions » et le bouton
« Démarrer la partie ». Chaque joueur peut appuyer sur son buzzer : « Buzzer OK » s'affiche sur son
pupitre.

<!-- capture : backoffice-nouvelle-partie.png — page « Nouvelle partie » remplie -->
<!-- capture : salle-partie-prete.png — écran « Partie prête » avec « Buzzer OK » -->

**Si ça ne marche pas**

| Message                                                                             | Cause probable                             | Geste                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| « Cette salle est inactive : activez-la avant d'y lancer une partie. » (backoffice) | La salle est désactivée                    | Dans la fiche de la compagnie, « Activer la salle ». |
| « Une partie est déjà en attente ou en cours dans cette salle. » (backoffice)       | Une partie précédente n'est pas terminée   | Termine-la, ou clique sur « Arrêter » dans la liste. |
| « Un des pupitres choisis n'existe pas dans cette salle. » (backoffice)             | Numéro de pupitre trop grand pour la salle | Corrige le numéro du pupitre.                        |
| « Aucun thème jouable pour cette partie : … »                                       | Pas de question audio active               | Ajoute ou active des questions audio au backoffice.  |
| « Aucun joueur n’est inscrit à cette partie : … »                                   | Participants oubliés                       | Ajoute les participants au backoffice.               |
| « Cette partie n’est plus disponible (arrêtée ou terminée au backoffice). »         | La partie a été arrêtée entre-temps        | Crée une nouvelle partie.                            |

## 3. Démarrer la partie

Sur l'écran de salle, clique sur « Démarrer la partie ». Le message « Préparation des extraits… »
s'affiche pendant que les sons se chargent, puis la partie démarre.

Les joueurs répondent avec leur buzzer. Le principal mini-jeu est le **blind test éclair** : un
extrait est joué par paliers de 1, 5 puis 20 secondes, et plus la réponse est rapide, plus elle
rapporte (100, 50 ou 20 points).

**Si ça ne marche pas** : « Impossible de démarrer la partie. Vérifie la connexion et réessaie. » :
le PC n'a pas pu charger le contenu. Vérifie internet, puis recommence.

## 4. Suivre la partie

Une fois la partie lancée, **elle continue sans internet** : les buzzers sont jugés sur le PC de la
salle. Tu n'as rien à faire. Tu peux suivre l'avancée sur l'écran de salle.

Pendant la partie :

- Garde la fenêtre du jeu **au premier plan** et ne clique pas ailleurs. Si le message « Buzzers
  inactifs » s'affiche, clique n'importe où dans la page pour réactiver les buzzers.
- Ne fais rien d'autre sur ce PC (pas de navigation web, pas d'autres programmes).

## 5. Mettre en pause, passer une question

> **À venir.** La mise en pause d'une partie et la fonction « passer une question » sont en cours de
> développement et **ne sont pas dans la version décrite par ce guide**. En attendant, tu ne peux
> qu'arrêter la partie (voir plus bas).
>
> À vérifier à la livraison : ce paragraphe sera complété avec les libellés exacts des boutons.

## 6. Arrêter une partie

**Depuis l'écran de salle** : clique sur l'icône « Arrêter la partie » dans la barre du haut. Une
confirmation s'affiche : « Arrêter la partie en cours ? Les scores actuels seront conservés comme
résultat. » Valide.

L'écran affiche alors « Partie arrêtée ».

> **Attention.** D'après le code actuel, arrêter la partie **depuis l'écran de salle** ne prévient pas
> le backoffice : la partie y reste « En cours » et la salle reste « occupée ». Pour la libérer,
> clique ensuite sur « Arrêter » dans la liste des « Parties » du backoffice. Le texte de la
> confirmation (« conservés comme résultat ») est donc plus optimiste que le comportement réel.
>
> À vérifier sur le banc : test G de l'arrêt en cours de partie.

**Depuis le backoffice** : dans « Parties », clique sur « Arrêter » sur la ligne de la partie. La
confirmation indique : « Arrêter la partie en cours dans la salle « … » ? Elle ne pourra pas reprendre
et la salle sera libérée. »

## 7. Arrêt d'urgence

En cas de danger (fumée, lumières, malaise d'un joueur), utilise **d'abord l'arrêt d'urgence
physique** : le bouton rouge câblé sur la machine à fumée ou l'alimentation. Il agit même si le PC est
planté.

À l'écran, dans la partie comme dans l'écran Matériel (onglet « Lumières et fumée »), le bouton
« Arrêt d'urgence » éteint les lumières et verrouille la fumée. Il apparaît dans la barre de la partie
seulement si des appareils lumineux sont déclarés.

- Le verrouillage **est retenu** : il survit au rechargement de la page et au redémarrage du PC.
- Pour rétablir les lumières, ouvre l'écran Matériel, onglet « Lumières et fumée », clique sur
  « Rallumer les lumières » et confirme après avoir vérifié que la salle est sûre. **La fumée reste
  désarmée** : il faut cocher de nouveau « Fumée autorisée pour cette session ».

> Le bouton à l'écran **ne remplace pas** l'arrêt d'urgence physique. Voir
> [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).

## 8. Enchaîner deux sessions

1. À la fin de la partie, l'écran affiche « Fin de la partie » avec le vainqueur, puis l'état d'envoi
   des résultats : « Envoi des résultats… » puis « Résultats enregistrés ».
2. Attends « Résultats enregistrés » avant de continuer, si tu peux. Sinon, les résultats sont gardés et
   renvoyés tout seuls (voir ci-dessous).
3. Clique sur « Nouvelle partie » : l'écran repasse sur « En attente d’une partie ». (« Retour à
   l’accueil » ramène à « Prêt à jouer » : clique alors sur « Lancer la salle ».)
4. Au backoffice, crée la partie suivante (voir le chapitre 2). Si la partie précédente est restée
   « En cours », clique d'abord sur « Arrêter ».
5. Entre deux sessions, vérifie que la fumée est prête et que la salle est aérée.

**Si l'envoi des résultats ne passe pas** : l'écran affiche « Hors ligne : résultats en attente, nouvel
essai automatique » ou « Salle déconnectée : résultats en attente, ils seront envoyés à la
reconnexion ». Rien n'est perdu : les résultats sont gardés sur le PC et renvoyés, d'abord après
quelques secondes, puis toutes les minutes. Un bandeau « résultat de partie en attente d’envoi »
s'affiche sur l'écran d'attente. Si tu vois « Résultats refusés par le backoffice. », prévient
l'éditeur. Voir [`depannage.md`](depannage.md).

## 9. Fin de journée

1. Attends qu'il ne reste aucun résultat en attente d'envoi (aucun bandeau « en attente d’envoi »).
2. Si une partie est restée « En cours » au backoffice, clique sur « Arrêter ».
3. **Coupe la machine à fumée à l'alimentation** (interrupteur physique).
4. Éteins les lumières, l'écran et les enceintes, puis le PC.

Ne clique pas sur le bouton « Déconnecter la salle » en fin de journée : il remet les lumières à zéro,
coupe la fumée et efface la partie sauvegardée. Il sert à changer de compte, pas à fermer.

> À vérifier sur le banc : l'état des lumières quand le navigateur ou le PC est éteint (une interface
> USB peut répéter sa dernière trame tant qu'elle est alimentée, d'où la coupure physique à l'étape 3).

## Ce qui n'existe pas encore

Ces fonctions sont **prévues**, mais **ne sont pas disponibles** :

- le pilotage de la salle à distance depuis le backoffice ;
- l'inscription des joueurs par QR code ;
- les sessions programmées à l'avance ;
- la mise en pause et « passer une question » (en cours de développement).
