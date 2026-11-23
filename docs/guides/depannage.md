# Dépannage

Ce guide s'adresse au personnel du centre et à la personne qui installe la salle. Pour chaque
symptôme : la cause la plus probable, puis le geste à faire. Commence toujours par le geste le plus
simple.

> **Honnêteté d'abord.** Les causes et les gestes ci-dessous viennent du code et de la documentation
> du projet. **Rien n'a encore été validé sur du vrai matériel** : un geste qui ne règle pas ton
> problème est une information utile pour l'éditeur. Les points à confirmer sont marqués
> `> À vérifier sur le banc :`.

**Règle de sécurité : en cas de doute sur la fumée ou les lumières, coupe d'abord avec l'arrêt
d'urgence physique, puis cherche la cause.** Voir
[`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).

## Sommaire

- [Un buzzer ne répond pas](#un-buzzer-ne-répond-pas)
- [Pas de son](#pas-de-son)
- [Les lumières ne réagissent pas](#les-lumières-ne-réagissent-pas)
- [L'interface USB n'est pas détectée](#linterface-usb-nest-pas-détectée)
- [Le pont Art-Net ne se connecte pas](#le-pont-art-net-ne-se-connecte-pas)
- [La fumée ne part pas, ou ne s'arrête pas](#la-fumée-ne-part-pas-ou-ne-sarrête-pas)
- [Coupure d'internet pendant une partie](#coupure-dinternet-pendant-une-partie)
- [L'écran est figé ou blanc](#lécran-est-figé-ou-blanc)
- [Un deuxième onglet QuizzUp est ouvert](#un-deuxième-onglet-quizzup-est-ouvert)
- [Configuration modifiée depuis un autre poste](#configuration-modifiée-depuis-un-autre-poste)
- [Session expirée ou PC déconnecté](#session-expirée-ou-pc-déconnecté)
- [Les résultats n'arrivent pas au backoffice](#les-résultats-narrivent-pas-au-backoffice)
- [Qui prévenir](#qui-prévenir)

## Un buzzer ne répond pas

| Symptôme                                                  | Cause probable                                                             | Geste                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Aucun buzzer ne répond, message « Buzzers inactifs »      | La fenêtre du jeu a perdu le focus (un clic ailleurs, une fenêtre Windows) | Clique n'importe où dans la page : « Clique n’importe où pour réactiver les buzzers ».                                                       |
| Aucun buzzer ne répond, pas de message                    | Boîtier débranché ou câble USB lâche                                       | Vérifie le câble, rebranche, clique dans la page. Teste dans Matériel, onglet « Buzzers », section « Test des buzzers ».                     |
| Aucun buzzer d'une carte manette ne répond                | Le navigateur ne voit une manette qu'après un premier appui                | Appuie sur un buzzer. Message attendu : « Appuie sur un buzzer pour activer la carte : le navigateur ne la voit qu’après un premier appui. » |
| Un seul buzzer ne répond pas                              | Il n'a pas été appris, ou il a été appris avec une mauvaise touche         | Matériel, onglet « Buzzers » : relance « Lancer la configuration des buzzers » puis apprends-le de nouveau.                                  |
| « La touche … est réservée au système » à l'apprentissage | Le buzzer envoie une touche que Windows ou le navigateur garde pour eux    | Change la touche envoyée par le boîtier, si possible.                                                                                        |
| Le pupitre réagit mais pas le bon                         | Deux buzzers mal associés                                                  | Reprends l'association : « Recommencer » puis « Enregistrer l’association ».                                                                 |
| Le joueur n'a plus de buzzer du tout (boîtier absent)     | Panne matérielle                                                           | Utilise le clavier de simulation : « Revenir au clavier de simulation ». Les touches sont rappelées sur l'écran d'inscription.               |

> À vérifier sur le banc : comportement d'une vraie carte manette (rebonds, numéros d'entrée,
> reconnaissance après redémarrage). Tests B du banc.

## Pas de son

Le navigateur **interdit** de jouer du son tant qu'un humain n'a pas cliqué dans la page.

| Symptôme                                           | Cause probable                                                   | Geste                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pas de son après un redémarrage ou un rechargement | Le son n'a pas été débloqué par un clic                          | Clique sur « Lancer la salle » (depuis « Prêt à jouer »). Ce clic débloque le son. |
| Pas de son, l'écran est bien en plein écran        | Volume Windows à zéro, mauvaise sortie audio, enceintes éteintes | Vérifie le volume, la sortie sélectionnée dans Windows, les enceintes.             |
| Pas de son, onglet muet                            | Onglet du navigateur mis en sourdine                             | Clic droit sur l'onglet : « Réactiver le son du site ». Hors kiosque seulement.    |
| Pas d'extrait au lancement de la partie            | Fichier audio absent ou format non lisible                       | Au backoffice, vérifie que la question a bien un fichier audio (mp3 ou ogg).       |
| « Préparation des extraits… » qui dure longtemps   | Connexion lente pour télécharger les extraits                    | Attends, ou vérifie la connexion du PC.                                            |

## Les lumières ne réagissent pas

Les lumières peuvent être en **simulation** : l'écran de salle montre alors des couleurs à l'écran
mais n'envoie rien aux appareils. C'est le cas par défaut.

Vérifie dans l'ordre, dans Matériel, onglet « Lumières et fumée » :

1. **L'arrêt d'urgence est-il actif ?** Si oui, tout est éteint. Vérifie que la salle est sûre, puis
   clique sur « Rallumer les lumières » et confirme. La fumée restera désarmée.
2. **L'interface est-elle connectée ?** Le statut doit être « connectée ». Sinon, clique sur
   « Connecter l’interface DMX » (USB) ou « Connecter le pont » (Art-Net).
3. **Es-tu en simulation ?** « Passer en simulation » aurait été cliqué par erreur : reconnecte l'interface.
4. **L'adresse DMX de l'appareil** correspond-elle à celle réglée sur l'appareil lui-même ? Utilise
   « Identifier » ou « Tester une scène » sur le pupitre concerné.
5. **Les câbles DMX** : un câble défectueux ou un appareil en bout de chaîne sans bouchon de terminaison
   donne des comportements instables.
6. **L'onglet est-il masqué ?** Si la fenêtre est cachée (autre fenêtre devant, écran éteint), le
   logiciel coupe la fumée et refuse d'en envoyer de nouvelle.

**Avertissements affichés à l'écran**

| Message                                                                            | Signification                                                         | Geste                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| « La page a gelé : fumée coupée par sécurité. »                                    | Le logiciel s'est figé plus d'une demi-seconde, la fumée a été coupée | Attends. Si ça se répète, redémarre le PC et signale-le.            |
| « Onglet masqué : fumée coupée par sécurité. »                                     | La fenêtre n'est plus visible                                         | Remets la fenêtre du jeu au premier plan.                           |
| « L’interface DMX ne répond plus. »                                                | L'interface USB ne reçoit plus les données                            | Vérifie le câble USB. Reconnecte l'interface.                       |
| « L’interface DMX répond de nouveau : lumières reprises (fumée toujours coupée). » | Retour à la normale ; la fumée doit être réarmée à la main            | Si besoin, coche de nouveau « Fumée autorisée pour cette session ». |
| « Pont Art-Net non connecté : les lumières restent simulées et la fumée coupée. »  | Le pont n'est pas lancé ou pas joignable                              | Voir [le pont Art-Net](#le-pont-art-net-ne-se-connecte-pas).        |

> À vérifier sur le banc : tous les symptômes de cette section avec de vrais appareils (tests D du banc).

## L'interface USB n'est pas détectée

1. Vérifie que tu utilises **Chrome ou Edge** : « Ce navigateur ne pilote pas l’USB : utilise Chrome ou Edge. »
2. Vérifie que la page est servie en **HTTPS** (ou `localhost`). Sinon, le navigateur interdit l'USB.
3. Clique sur « Connecter l’interface DMX » et choisis l'interface dans la fenêtre de Chrome.
4. Vérifie le câble USB et essaie un autre port.

| Message                                                  | Cause probable                                | Geste                                                                     |
| -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| « Aucune interface choisie. »                            | La fenêtre de choix a été fermée sans choisir | Recommence et sélectionne l'interface.                                    |
| « L’interface est déjà utilisée par un autre logiciel. » | Un autre programme a ouvert l'interface       | Ferme ce programme (un autre logiciel de lumières, par exemple).          |
| « Le navigateur a refusé l’accès à l’interface. »        | L'autorisation USB a été refusée              | Autorise l'appareil dans les réglages du site de Chrome, puis recommence. |
| « L’interface a été débranchée. »                        | Câble ou alimentation                         | Rebranche, puis « Connecter l’interface DMX ».                            |
| « Impossible d’ouvrir l’interface DMX. »                 | Cause inconnue                                | Débranche, rebranche, redémarre Chrome. Sinon, redémarre le PC.           |

Une interface choisie une fois est normalement retenue par Chrome : elle ne devrait pas redemander
d'autorisation après un redémarrage.

> À vérifier sur le banc : la reconnexion automatique de l'interface après redémarrage.

## Le pont Art-Net ne se connecte pas

Le pont (`quizzup-artnet-bridge`) est le petit programme Windows qui relaie les lumières vers un
boîtier réseau Art-Net. Il écoute en local sur le port 7654.

1. **Est-il lancé ?** Dans le Gestionnaire des tâches de Windows, cherche `quizzup-artnet-bridge`.
   Avec le kit du poste, il démarre tout seul avec Windows et se relance chaque minute.
2. **Windows l'a-t-il bloqué ?** Le programme n'est pas signé. SmartScreen peut afficher un
   avertissement (« Informations complémentaires » puis « Exécuter quand même »). Smart App Control, lui,
   bloque un programme non signé **sans rien afficher** : désactive-le si c'est ton cas.
3. **Pare-feu** : autorise UDP 6454 pour les réseaux de profil **Privé**. Une deuxième carte réseau
   « non identifiée » est classée **Public** par Windows : force le profil Privé.
4. **Le boîtier est-il sur le même réseau ?** Clique sur « Chercher les nœuds ». Sinon saisis l'« IP du
   nœud Art-Net » (adresse de réseau local, jamais avec un port).
5. **Deux cartes réseau** : la recherche automatique peut échouer ; voir l'option `--poll-broadcast`
   dans le [README du pont](../../game/artnet-bridge/README.md).
6. L'écran réessaie de se connecter au pont toutes les 10 secondes.

Si les lumières d'un pupitre n'obéissent pas, alors que le pont est connecté : vérifie l'**univers**
déclaré. Le modèle « Salle 6 pupitres » met tous les appareils sur l'univers 0 ; ton boîtier peut en
attendre d'autres.

> À vérifier sur le banc : tout ce chapitre. Le pont n'a jamais parlé à un vrai boîtier ni tourné sur
> un vrai Windows (test A du banc).

## La fumée ne part pas, ou ne s'arrête pas

### Elle ne s'arrête pas : urgence

1. **Coupe immédiatement avec l'arrêt d'urgence physique** (ou l'alimentation de la machine).
2. Ventile la salle, fais sortir le public si nécessaire.
3. Ne rallume rien tant que la cause n'est pas comprise.

Une interface USB ou le pont **répète la dernière image** si le PC plante : seul le **relais
temporisé** (10 secondes maximum) coupe alors la fumée. Si la fumée a duré plus de 10 secondes, ce
relais est défaillant ou absent : **ne réutilise pas la machine** avant de l'avoir fait contrôler.

### Elle ne part pas

Dans Matériel, onglet « Lumières et fumée », regarde le statut de la fumée :

| Statut                        | Signification                                          | Geste                                                                                     |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| « désactivée »                | La fumée n'a pas été activée pour cette salle          | Active-la dans l'assistant, étape « Sécuriser la fumée ».                                 |
| « non autorisée »             | Personne n'a armé la fumée pour cette session          | Coche « Fumée autorisée pour cette session » (après le contrôle d'ouverture).             |
| « pause de sécurité »         | Le délai minimal entre deux émissions n'est pas écoulé | Attends (30 secondes par défaut).                                                         |
| « bloquée (arrêt d’urgence) » | L'arrêt d'urgence est actif                            | « Rallumer les lumières » ; puis réarme la fumée.                                         |
| « prête »                     | Tout est bon                                           | Elle partira à la scène de victoire de la partie (3 secondes). Teste avec « Tester 2 s ». |

Autres causes : fumée coupée par la sécurité (« La page a gelé… », « Onglet masqué… », « L’interface
DMX ne répond plus. »), machine éteinte, relais non alimenté, liquide ou chauffe de la machine
insuffisants, mauvaise adresse du relais de fumée.

> À vérifier sur le banc : tests F du banc. **Ne teste jamais la fumée en présence de public.**

## Coupure d'internet pendant une partie

| Ce qui continue de marcher                                | Ce qui attend le retour du réseau                 |
| --------------------------------------------------------- | ------------------------------------------------- |
| La partie en cours, du début à la fin                     | L'envoi des scores au backoffice                  |
| Les buzzers, le son (extraits déjà chargés), les lumières | Le lancement d'une **nouvelle** partie            |
| L'arrêt d'une partie depuis l'écran de salle              | La synchronisation de la configuration matérielle |

L'écran de salle garde la partie en local. À la fin, si le réseau manque, il affiche « Hors ligne :
résultats en attente, nouvel essai automatique ». Les résultats sont gardés sur le PC et renvoyés
dès que le réseau revient (réessai à 2, 5, 15, 30 secondes, puis toutes les minutes). Un bandeau
« résultat de partie en attente d’envoi » reste affiché tant qu'ils ne sont pas partis.

- **Ne recharge pas la page (F5) pendant une coupure** : sans internet, la page ne peut pas se
  recharger et reste blanche. Voir [L'écran est figé ou blanc](#lécran-est-figé-ou-blanc).
- Si le PC est éteint par erreur pendant une partie : au retour, « Une partie est en cours » propose
  « Reprendre la partie » (là où elle s'était arrêtée) ou « Abandonner cette partie ».
- Sur l'écran d'attente : « Backoffice injoignable » avec « Réessayer ». Une connexion est nécessaire
  pour **lancer** une partie.

> À vérifier sur le banc : coupure réelle du réseau pendant une manche, puis retour (test G du banc).

## L'écran est figé ou blanc

1. **Attends 10 secondes.** Une partie qui charge les extraits peut ralentir un instant.
2. Clique dans la page : le focus a peut-être été perdu.
3. Si tout est figé, appuie sur F5 **seulement si internet fonctionne**. Au rechargement, tu
   retrouves « Prêt à jouer » ; si une partie était en cours, « Reprendre la partie » est proposé.
   Reclique sur « Lancer la salle » pour débloquer le son.
4. **Page blanche et pas d'internet** : l'application n'est pas gardée en cache. Rétablis internet,
   puis recharge. (Une version qui fonctionne sans internet au rechargement est prévue plus tard.)
5. En dernier recours, redémarre le PC. **Avant**, assure-toi que la fumée est coupée.

Un figeage de plus d'une demi-seconde coupe automatiquement la fumée (voir plus haut).

## Un deuxième onglet QuizzUp est ouvert

Le message affiché est « QuizzUp est déjà ouvert sur ce PC ». Le texte complet est : « Une autre fenêtre pilote déjà les buzzers et les lumières. Ferme cet onglet
et utilise la fenêtre déjà ouverte. » QuizzUp n'autorise **qu'un seul onglet par PC**, pour éviter que
deux fenêtres pilotent les mêmes lumières.

**Geste** : ferme cet onglet ou cette fenêtre, et retourne dans celle qui était déjà ouverte (elle est
peut-être cachée derrière une autre fenêtre ou sur un autre bureau virtuel).

## Configuration modifiée depuis un autre poste

Le message complet est : « La configuration a été modifiée depuis un autre poste ; la version la plus
récente a été chargée. » Il apparaît dans l'écran Matériel si deux PC ont modifié la configuration de
la même salle. Le logiciel a gardé la version la plus récente.

**Geste** : relis les réglages (buzzers, plan, lumières) pour vérifier qu'ils sont ceux que tu veux. Si
besoin, refais la modification. Une salle est prévue pour **un seul PC** : si deux PC se connectent au
même compte de salle, ce sont eux qui se marchent dessus.

## Session expirée ou PC déconnecté

| Symptôme                                           | Cause probable                                                                             | Geste                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Retour sur « Connexion de la salle » au démarrage  | La connexion de la salle a expiré (elle est valable 365 jours) ou le compte a été supprimé | Reconnecte la salle (« Connecter la salle »). Une partie sauvegardée est gardée. |
| « Identifiants invalides. »                        | Mauvais identifiant ou mot de passe ; mot de passe changé                                  | Demande à un admin de recréer le compte (« Gérer le compte de salle »).          |
| Le PC est déconnecté sans raison                   | Compte de salle supprimé, ou compagnie désactivée                                          | Demande à un admin de vérifier la salle et son compte.                           |
| La salle est connectée mais aucune partie ne vient | La salle est inactive au backoffice                                                        | Dans la fiche de la compagnie, « Activer la salle ».                             |

Pendant une session de jeu, la connexion n'est vérifiée **qu'au démarrage** : une expiration ne coupe
pas une partie en cours.

## Les résultats n'arrivent pas au backoffice

- Le bandeau indique « Hors ligne : résultats en attente… » ou « Salle déconnectée : résultats en
  attente, ils seront envoyés à la reconnexion » : rétablis internet, ou reconnecte la salle. Les
  résultats partent seuls.
- Le bandeau indique « Résultats refusés par le backoffice. » : le serveur a refusé les résultats.
  Note l'heure et prévient l'éditeur.
- Une partie arrêtée depuis l'écran de salle reste « En cours » au backoffice : clique sur « Arrêter »
  dans la liste des parties.

## Qui prévenir

Quand tu contactes l'éditeur, donne :

- ce que tu as vu : le message exact, ou une photo de l'écran ;
- ce que tu as fait juste avant ;
- l'heure ;
- le matériel concerné (marque et modèle de l'interface DMX, des buzzers, du PC).

Pour toute question de sécurité (fumée qui ne s'arrête pas, lumières intenses, malaise), contacte
d'abord les **secours** et le responsable du site, puis l'éditeur.
