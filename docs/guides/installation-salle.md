# Installer une salle QuizzUp, de la boîte à la première partie

Ce guide s'adresse à la personne qui installe la salle : le gérant, un technicien ou un
prestataire. Tu n'as pas besoin de connaître QuizzUp. Il faut compter environ **15 minutes** si le
matériel est déjà branché et le compte de ta compagnie déjà créé.

> **Honnêteté d'abord.** Ce guide a été écrit à partir du code et des documents du projet.
> **Rien n'a encore été validé sur du vrai matériel** (buzzers, interface DMX, lumières, machine à
> fumée). Chaque point incertain est marqué `> À vérifier sur le banc :`. Le banc d'essai est décrit
> dans [`docs/recette/banc-materiel.md`](../recette/banc-materiel.md). Tant qu'il n'est pas passé,
> considère ce guide comme **un brouillon à confirmer**.

Les captures d'écran sont signalées par des emplacements `<!-- capture : … -->` : elles seront
ajoutées après la recette sur le banc.

## Sommaire

1. [Ce qu'il te faut](#1-ce-quil-te-faut)
2. [Créer la salle et son compte dans le backoffice](#2-créer-la-salle-et-son-compte-dans-le-backoffice)
3. [Préparer le PC de la salle](#3-préparer-le-pc-de-la-salle)
4. [Connecter le PC à la salle](#4-connecter-le-pc-à-la-salle)
5. [Configurer les pupitres et les buzzers](#5-configurer-les-pupitres-et-les-buzzers)
6. [Configurer les lumières](#6-configurer-les-lumières)
7. [Sécuriser la machine à fumée (si tu en as une)](#7-sécuriser-la-machine-à-fumée-si-tu-en-as-une)
8. [Vérification finale](#8-vérification-finale)
9. [Plein écran et démarrage automatique](#9-plein-écran-et-démarrage-automatique)
10. [Et ensuite](#10-et-ensuite)

## 1. Ce qu'il te faut

### Le matériel

| Élément            | Ce qui convient                                                                                                          | Remarque                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| PC de la salle     | Un PC Windows dédié, qui reste allumé                                                                                    | Un seul onglet QuizzUp par PC. Le kit d'installation automatique vise Windows 10 ou 11.                    |
| Navigateur         | **Google Chrome** (recommandé) ou Microsoft Edge                                                                         | Voir l'encadré ci-dessous.                                                                                 |
| Écran              | Un écran ou un vidéoprojecteur relié au PC                                                                               | Le jeu s'affiche en plein écran.                                                                           |
| Son                | Des enceintes reliées à la sortie audio du PC                                                                            | Les extraits musicaux sont joués par le navigateur.                                                        |
| Réseau             | Un accès internet                                                                                                        | Nécessaire pour se connecter et recevoir la partie. Une fois la partie reçue, elle continue sans internet. |
| Buzzers            | Soit un boîtier qui **imite un clavier**, soit une **carte « manette » USB** (entrées lues par le navigateur)            | De 1 à 6 pupitres, 4 buzzers (A, B, C, D) par pupitre.                                                     |
| Interface lumières | Une interface **DMX USB** (type « DMX USB Pro », recommandée) ou un **boîtier réseau Art-Net** via le pont QuizzUp       | Facultatif : sans interface, les lumières restent simulées à l'écran.                                      |
| Lumières           | Appareils DMX (lyres, projecteurs, rubans LED sur décodeur)                                                              | Chaque appareil a une **adresse DMX** réglée sur l'appareil.                                               |
| Machine à fumée    | Facultatif. Il faut un **relais DMX**, un **relais temporisé** de 10 secondes maximum et un **arrêt d'urgence physique** | Voir [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md) **avant** de brancher la machine.    |

> **Pourquoi Chrome ou Edge ?** Les lumières en USB passent par une fonction du navigateur (Web
> Serial) que seuls Chrome et Edge proposent. Les buzzers « carte manette » passent par une autre
> fonction (API Gamepad). La page doit aussi être servie en HTTPS (ou ouverte en `localhost`) pour
> que le navigateur autorise l'USB. Firefox et Safari ne conviennent pas pour piloter les lumières.
>
> À vérifier sur le banc : le kit d'installation automatique du poste ne configure que Chrome. Si tu
> utilises Edge, la configuration est à faire à la main.

### Les deux chaînes d'éclairage possibles

- **Chaîne A : interface USB.** Tu branches une interface DMX USB sur le PC. Rien à installer :
  le navigateur la pilote directement.
- **Chaîne B : salle déjà équipée en Art-Net.** Tu installes le **pont QuizzUp**
  (`quizzup-artnet-bridge`), un petit programme Windows qui relaie les lumières vers ton boîtier
  réseau. C'est le seul élément à installer, et il est facultatif. Demande l'exécutable à l'éditeur :
  il n'est pas disponible en téléchargement public. Voir
  [l'étape 6](#6-configurer-les-lumières).

> À vérifier sur le banc : aucune des deux chaînes n'a encore été essayée avec de vrais appareils.
> Les exemples de matériel cités dans la documentation du projet (interface DMX USB Pro, carte
> manette 32 entrées, boîtiers Art-Net courants) sont des **exemples à confirmer**, pas une liste de
> matériel garanti.

### Ce qu'il faut avoir sous la main

- L'adresse web de l'écran de salle, donnée par l'éditeur ou ton prestataire.
- L'identifiant et le mot de passe d'un compte **admin** de ta compagnie (pour l'étape 2).
- Pour chaque appareil lumineux : son type et son adresse DMX.
- Un plan simple de la salle : combien de pupitres, et dans quel ordre.

## 2. Créer la salle et son compte dans le backoffice

La salle est un objet du **backoffice** (l'outil de gestion). Le PC de la salle s'y connecte avec un
**compte de salle** : un compte par salle, qui ne donne aucun accès au backoffice.

Seuls les rôles **admin** et **superadmin** peuvent créer une salle et son compte. Un compte
**user** ne peut que les consulter.

### 2.1 Créer la salle

**Ce que tu fais**

1. Connecte-toi au backoffice avec ton compte admin.
2. Dans le menu, ouvre « Ma compagnie ». Un superadmin ouvre « Clients » puis la fiche de la
   compagnie concernée.
3. Dans la section « Salles », clique sur « Ajouter une salle ».
4. Saisis le « Nom de la salle » (par exemple le nom de la pièce), puis clique sur « Créer la
   salle ».

**Ce que tu dois voir** : la salle apparaît dans la liste, active, avec la mention « Non
configurée » dans la colonne « Configuration matérielle ». C'est normal : la configuration se fait
depuis le PC de la salle (étapes 4 à 8).

<!-- capture : backoffice-salles-liste.png — section « Salles » avec une salle « Non configurée » -->

**Si ça ne marche pas** : si « Ajouter une salle » n'apparaît pas, ton compte n'est pas admin. Demande
à un admin de ta compagnie.

### 2.2 Créer le compte de salle

**Ce que tu fais**

1. Sur la ligne de la salle, choisis « Gérer le compte de salle ».
2. Dans le panneau « Compte de connexion », renseigne :
   - « Identifiant du PC de la salle » : au moins 3 caractères (lettres, chiffres, points, tirets
     ou tirets bas) ;
   - « Mot de passe » : de 8 à 100 caractères ;
   - « Confirmer le mot de passe ».
3. Clique sur « Créer le compte ».

**Ce que tu dois voir** : le panneau indique qu'un compte existe pour cette salle.

**Note ce mot de passe tout de suite** : il ne peut pas être réaffiché. En cas d'oubli, il faut
cliquer sur « Supprimer le compte de salle » (le PC est alors déconnecté immédiatement) puis le
recréer.

<!-- capture : backoffice-compte-de-salle.png — panneau du compte de salle, formulaire rempli (mot de passe masqué) -->

## 3. Préparer le PC de la salle

Deux possibilités.

### Option rapide : le kit d'installation du poste

Le dossier [`deploy/poste-salle/`](../../deploy/poste-salle/README.md) contient un script
PowerShell qui prépare un PC Windows : réglages de Chrome, lancement automatique de l'écran de salle
en mode kiosque au démarrage, veille désactivée, installation facultative du pont Art-Net. Suis son
README.

> À vérifier sur le banc : **ce script n'a jamais été exécuté sur un vrai PC.** Prévois une session
> Windows dédiée à la salle, ouverte au moins une fois, et garde une solution de secours
> (installation à la main ci-dessous).

### Option à la main

1. Installe Google Chrome (ou Edge) à jour.
2. Dans les réglages Windows, mets la veille de l'écran, du disque et des ports USB sur « Jamais ».
3. Branche l'interface DMX USB et le boîtier de buzzers **avant** de lancer le navigateur.
4. Ouvre Chrome sur l'adresse de l'écran de salle.

**Ce que tu dois voir** : la page « Connexion de la salle ».

**Si ça ne marche pas** : si la page ne s'affiche pas, vérifie l'adresse web et la connexion internet
du PC. Si tu vois « Impossible de joindre l’API. » plus tard, c'est le même problème : le PC n'atteint
pas le backoffice.

## 4. Connecter le PC à la salle

**Ce que tu fais**

1. Sur la page « Connexion de la salle », saisis l'« Identifiant du compte de salle » et le « Mot de
   passe » créés à l'étape 2.2.
2. Clique sur « Connecter la salle ».

**Ce que tu dois voir** : l'écran « Prêt à jouer ». Le bouton « Lancer la salle » est toujours là.
Tant que la salle n'est pas configurée, un bouton « Lancer la configuration de la salle » s'y ajoute
au-dessus. Une fois la salle configurée, c'est « Reconfigurer la salle » qui apparaît, sous
« Lancer la salle ».

<!-- capture : salle-connexion.png — écran « Connexion de la salle » -->
<!-- capture : salle-accueil-pret-a-jouer.png — écran « Prêt à jouer » avant configuration -->

**Si ça ne marche pas**

| Message                                     | Cause probable                                        | Geste                                                     |
| ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| « Identifiants invalides. »                 | Faute de frappe, ou compte supprimé et recréé         | Retape. En cas de doute, recrée le compte (étape 2.2).    |
| « Ce compte n’est pas un compte de salle… » | Tu as saisi un compte admin ou user                   | Utilise le compte créé avec « Gérer le compte de salle ». |
| « Impossible de joindre l’API. »            | Pas d'internet, ou backoffice injoignable             | Vérifie le réseau du PC, puis réessaie.                   |
| « QuizzUp est déjà ouvert sur ce PC »       | Un autre onglet ou une autre fenêtre est déjà ouverte | Ferme cet onglet et utilise la fenêtre déjà ouverte.      |

Le bouton « Essayer en mode démo (sans compte) » permet de tester l'écran sans compte. Ce mode ne
sert pas à l'installation : les parties de démonstration ne sont pas liées à ta compagnie.

## 5. Configurer les pupitres et les buzzers

Depuis « Prêt à jouer », clique sur « Lancer la configuration de la salle ». Un assistant plein
écran se lance. Il enregistre sur le compte de la salle (avec une copie de secours sur ce PC). Tu
peux le quitter avec le bouton « Quitter » (ou la touche Échap) : il demande alors « Quitter la
configuration sans enregistrer ? ».

### 5.1 Pupitres et couleurs

1. Écran « Bonjour ! » : clique sur « C’est parti ».
2. Écran « Choisis les couleurs » : touche un buzzer, puis sa couleur. Pour changer deux buzzers de
   place, utilise « Échanger la place » puis touche l'autre buzzer. Clique sur « C’est bon ».
3. Écran « Combien as-tu de pupitres ? » : choisis un nombre de **1 à 6**, puis « C’est bon ».

**Ce que tu dois voir** : un pupitre vu du dessus, avec ses 4 buzzers colorés.

<!-- capture : assistant-couleurs.png — écran « Choisis les couleurs » -->

### 5.2 Apprendre chaque buzzer

L'assistant demande les buzzers un par un : « Buzzer 1 sur 24 » (pour 6 pupitres), avec la consigne
« Appuie sur le buzzer bleu (A) ».

**Ce que tu fais** : appuie physiquement sur le buzzer demandé.

**Ce que tu dois voir** : « C’est noté ! (touche …) » puis l'assistant passe au buzzer suivant.

**Si ça ne marche pas**

- Rien ne se passe : vérifie que le boîtier est branché et que la page a le focus (clique une fois
  dans la page). Voir [`depannage.md`](depannage.md).
- « La touche … est déjà prise par le buzzer … du pupitre … » : tu as appuyé sur un autre buzzer.
  Appuie sur le bon.
- « La touche … est réservée au système » : ce buzzer envoie une touche que le navigateur garde pour
  lui. Change l'affectation dans le boîtier si c'est possible.
- Tu t'es trompé de buzzer : utilise « Retour ». Pour sauter un buzzer, « Passer ».

### 5.3 Fin des buzzers

Écran « Ta salle est prête ! » : tu vois les pupitres avec la touche de chaque buzzer.

- Clique sur « Terminer » pour enregistrer et revenir à l'accueil ;
- ou sur « Régler les lumières » pour enchaîner avec l'étape 6.

Si tu vois « Impossible d’enregistrer. Vérifie la connexion et réessaie. », l'enregistrement a
échoué : réessaie. Une simple coupure du réseau n'affiche pas ce message : la configuration est alors
gardée sur ce PC et renvoyée plus tard. Pour le savoir, ouvre l'écran Matériel : si le backoffice n'a
pas reçu la configuration, il affiche « Backoffice injoignable : configuration gardée sur ce PC, elle
sera renvoyée au prochain démarrage ou enregistrement. »

Quand le backoffice a reçu la configuration, la salle passe à « Configurée » dans la colonne
« Configuration matérielle » de la section « Salles ».

### 5.4 Si tes buzzers sont une carte manette USB

Le parcours ci-dessus apprend les buzzers comme des **touches de clavier**. Si ta carte est lue comme
une manette, passe par l'écran Matériel :

1. Sur « Prêt à jouer », clique sur le bouton icône « Matériel de la salle ».
2. Ouvre l'onglet « Assistant ». Clique sur « Suivant » après l'étape « Vérifier le navigateur » :
   tu arrives à l'étape « Associer les buzzers ».
3. Dans la liste « Boîtier des buzzers », choisis « Carte manette (entrées USB) ». Le champ « Nom de
   la carte (facultatif) » aide à la reconnaître.
4. Appuie sur un buzzer : le navigateur ne voit la carte qu'**après un premier appui**.

> À vérifier sur le banc : le comportement exact de la carte manette (reconnaissance, numéros des
> entrées, rebonds) n'a jamais été essayé avec une vraie carte. Tests B du banc.

## 6. Configurer les lumières

Cette étape est facultative : sans interface DMX, les lumières restent **simulées** à l'écran et la
fumée reste **désactivée**.

Il existe **deux chemins séparés**. Ils n'ont pas les mêmes écrans et ne règlent pas les mêmes choses.
Choisis-en un.

- **Chemin court** (6.1) : bouton « Régler les lumières » à la fin de l'étape 5, écran « Passons aux
  lumières ! ». Il cherche l'interface, importe le modèle 6 pupitres ou garde les appareils déjà
  déclarés, puis les teste un par un. Il n'a **ni** formulaire d'appareil, **ni** fichier de calage,
  **ni** visée des lyres, **ni** saisie d'IP, **ni** réglage de la fumée.
- **Assistant Matériel** (6.2) : bouton « Matériel de la salle » sur « Prêt à jouer », onglet
  « Assistant ». Il couvre tout : interface, appareils un par un, plan, tests, visée des lyres, fumée.
  Il se termine par « Récapitulatif » et « Enregistrer la configuration ».

Pour une salle au modèle 6 pupitres, le chemin court suffit. Pour tout le reste (appareils à saisir,
lyres à viser, IP Art-Net à la main, fumée), passe par l'assistant Matériel.

### 6.1 Chemin court : « Passons aux lumières ! »

1. **Écran « Passons aux lumières ! ».**
   - Chaîne A (USB) : clique sur « Chercher une interface USB ». Chrome ouvre une fenêtre de choix :
     sélectionne ton interface et valide. Tu vois la carte « Interface USB trouvée ».
   - Chaîne B (Art-Net) : lance le pont **avant** d'arriver à cet écran (voir 6.3). L'écran cherche tout
     seul les boîtiers réseau (« Recherche d’un boîtier réseau… ») et affiche une carte du type
     « Boîtier réseau … trouvé » avec l'adresse IP du boîtier. S'il y en a plusieurs, touche la carte
     du bon boîtier. Chrome peut demander l'autorisation d'accéder au réseau local : accepte-la.
   - Rien trouvé : « Aucune interface : on continue en simulation ». Le bouton devient « Continuer en
     simulation ». Si ton boîtier Art-Net n'apparaît pas alors que le pont tourne, ce chemin ne permet
     pas de saisir l'IP à la main : passe par l'assistant Matériel (6.2).
   - Sinon, clique sur « C’est bon ».
2. **Écran « Comment est équipée ta salle ? ».**
   - « Salle 6 pupitres » (« Le modèle QuizzUp ») : importe le modèle (lyres, rubans LED, adresses
     prédéfinies). Compare chaque adresse avec ce qui est réglé sur tes appareils. Si des appareils
     sont déjà déclarés, une confirmation demande : « Tes appareils actuels seront remplacés par ceux
     du modèle 6 pupitres. Continuer ? ». Si le modèle chevauche l'adresse de ta machine à fumée, tu
     vois « Le modèle chevauche l’adresse de ta machine à fumée. Garde tes appareils, ou change
     l’adresse de la fumée dans Matériel. »
   - « Je garde mes appareils actuels » : ce bouton n'apparaît que si des appareils sont **déjà
     déclarés** (il affiche « … appareil(s) déjà réglé(s) »). Il ne sert qu'à les tester : il ne
     permet de rien déclarer. Sur une salle neuve, il est absent.
   - « Je configurerai plus tard » (« Tu pourras le faire depuis Matériel. ») : rien n'est testé ni
     enregistré.
3. **Test, appareil par appareil.** « Appareil 1 sur 8 », « Est-ce que ça s’allume ? ». Réponds
   « Oui ! » ou « Non ». Après un « Non », l'aide « Pas de souci, vérifions ensemble : » rappelle
   l'adresse DMX et le câble ; tu peux « Réessayer » ou « Passer ».
4. **Si une machine à fumée est déclarée** : écran « Une machine à fumée est prévue ». Elle reste
   désactivée ici. « Régler la fumée » enregistre les lumières puis ouvre l'assistant Matériel (étape 7).
   « Continuer » saute ce réglage.
5. **Écran « Tes lumières sont prêtes ! »** avec le bilan « … appareil(s) OK, … à vérifier. ». Clique
   sur « Terminer » : les lumières sont enregistrées et tu reviens à « Prêt à jouer ». Si tu avais choisi
   « Je configurerai plus tard », l'écran s'appelle « Les lumières, plus tard » et rien n'est enregistré.

Si tu quittes avec « Quitter » (ou Échap) avant « Terminer », la question « Quitter la configuration
sans enregistrer ? Ce que tu viens de régler sera perdu. » s'affiche. Les lumières reviennent à l'état de
départ.

**Si ça ne marche pas** : « Ce navigateur ne gère pas l’USB : utilise Chrome ou Edge. » ; ou la fenêtre
de choix USB est vide (interface mal branchée, pilote absent, ou autre programme qui l'utilise :
ferme-le).

### 6.2 Assistant Matériel : onglet « Assistant »

**Ouvrir l'assistant** : sur « Prêt à jouer », clique sur le bouton icône « Matériel de la salle », puis
sur l'onglet « Assistant ». L'en-tête indique « Étape … sur … » et le nom de l'étape. Tu avances avec
« Suivant » et tu reviens avec « Précédent ». Si « Suivant » est grisé, la ligne « « Suivant » reste
grisé : » liste les raisons.

Les étapes, dans l'ordre. Certaines n'apparaissent que si elles servent :

1. « Vérifier le navigateur ».
2. « Associer les buzzers » (voir 5.4 pour une carte manette).
3. « Choisir l’interface DMX ».
4. « Déclarer les appareils ».
5. « Placer la salle sur le plan » (facultatif).
6. « Tester chaque appareil » (si au moins un appareil, hors machine à fumée).
7. « Viser les pupitres » (si au moins une lyre).
8. « Sécuriser la fumée » (si une machine à fumée est déclarée).
9. « Récapitulatif ».

**Étape « Choisir l’interface DMX »**

- Chaîne A (USB) : choisis « Interface DMX USB Pro » (recommandée), puis clique sur « Connecter
  l’interface DMX ». Chrome ouvre une fenêtre de choix : sélectionne ton interface. Tu vois « Interface
  connectée. ».
- Chaîne B (Art-Net) : lance le pont avant (voir 6.3). Puis, dans cet ordre :
  1. choisis « Pont Art-Net local (boîtier réseau) » ;
  2. clique sur « Connecter l’interface DMX » ;
  3. clique sur « Chercher les nœuds » (environ 3 secondes) et touche ton boîtier dans la liste, ou saisis
     l'« IP du nœud Art-Net » (une adresse de réseau local).

  Tant que le pont n'est pas connecté, « Chercher les nœuds » reste grisé, avec le message « Connecte
  d’abord le pont (bouton ci-dessous) pour chercher les nœuds. » Quand l'adresse est prise en compte, tu
  vois « Cible effective du pont : … ».

- Si tu n'as aucune interface : garde « Simulation (aucune interface) ».

**Étape « Déclarer les appareils »** : trois façons, que tu peux combiner.

- « Importer une salle 6 pupitres » : importe le modèle. Compare chaque adresse avec ce qui est réglé
  sur tes appareils.
- Le formulaire : « Type d’appareil », « Nom », « Pupitre », « Univers », « Adresse », puis « Ajouter ».
  Laisse « Adresse » vide pour prendre la première adresse libre. Une interface USB ne gère que
  l'univers 0.
- « Reprendre les positions des lyres (fichier) » : lit un fichier de positions de lyres (`.txt`, `.cfg`
  ou `.ini`).

Si deux appareils se chevauchent (même adresse), l'assistant le signale : corrige l'adresse.

**Étape « Tester chaque appareil »** : pour chaque appareil, « Allumer », « Éteindre », puis « Ça marche »
ou « Rien ne se passe ». Après un « Rien ne se passe », vérifie l'adresse DMX et le câble. « Suivant »
reste grisé tant que tous les appareils ne sont pas testés.

**Étape « Viser les pupitres »** (si tu as des lyres) : tu pointes chaque lyre vers chacun de ses
pupitres. Les flèches du clavier déplacent la lyre ; Maj donne un pas fin ; Entrée (ou « Valider »)
valide. « Copier le précédent », « Inverser pan » et « Inverser tilt » aident à aller plus vite.

> **N'oublie pas la dernière étape.** Va jusqu'à « Récapitulatif » avec « Suivant », puis clique sur
> **« Enregistrer la configuration »** et attends le message « Configuration enregistrée. ». Tant que tu
> ne l'as pas fait, des réglages des dernières étapes peuvent être perdus : en particulier la fumée
> reste enregistrée comme désactivée, et la visée des lyres faite juste avant n'est pas forcément gardée.
> Si le récapitulatif affiche « Points à corriger », corrige-les d'abord.

**Ce que tu dois voir** : chaque appareil réagit comme annoncé ; au récapitulatif, « Tout est prêt. » ;
après l'enregistrement, « Configuration enregistrée. ».

### 6.3 Installer et lancer le pont Art-Net (chaîne B seulement)

**Demande l'exécutable à l'éditeur.** Il n'est pas disponible en téléchargement public, et il n'est pas
signé (voir le [README du pont](../../game/artnet-bridge/README.md)).

1. Copie `quizzup-artnet-bridge.exe` dans `C:\QuizzUp\`.
2. Lance-le dans un terminal PowerShell, **avec l'adresse de l'écran de salle** (celle que tu ouvres
   dans Chrome) :

   ```powershell
   C:\QuizzUp\quizzup-artnet-bridge.exe --origin https://salle.quizzup.fr
   ```

   Remplace l'adresse par celle de ta salle. L'option `--origin` est **obligatoire** : sans elle, le pont
   s'arrête avec le message « --origin est obligatoire… ». Un double-clic sur l'exécutable ne suffit donc
   pas. Avec le [kit du poste](../../deploy/poste-salle/README.md), c'est le kit qui lance le pont avec
   cette option, tout seul au démarrage.

3. Le pont écoute en local sur le port 7654. Laisse sa fenêtre ouverte (réduis-la).
4. Au premier lancement, Windows demande d'autoriser le pont sur le réseau : coche **Réseaux privés**.
   Autorise aussi le trafic UDP sur le port 6454 dans le pare-feu, pour les réseaux de profil **Privé**.
5. Windows SmartScreen peut afficher un avertissement : clique sur « Informations complémentaires »
   puis « Exécuter quand même ».
6. Si le PC a deux cartes réseau, la recherche automatique peut échouer : le README du pont décrit
   l'option `--poll-broadcast`.

> **Smart App Control (Windows 11).** S'il est activé, il bloque le pont **sans rien afficher** : le pont
> ne démarre pas. Sa désactivation est **irréversible sans réinitialiser Windows**. Ne le désactive pas
> à la légère : lis d'abord la section « Exécutable non signé : SmartScreen et Smart App Control » du
> README du [kit du poste de salle](../../deploy/poste-salle/README.md), et demande conseil à l'éditeur.

> À vérifier sur le banc : le pont n'a jamais parlé à un vrai boîtier Art-Net. Le comportement de
> Windows (SmartScreen, Smart App Control, pare-feu, profil réseau) est décrit d'après la
> documentation, pas constaté. Test A du banc.

> À vérifier sur le banc : tout le chapitre 6. Aucun appareil réel n'a été piloté. Tests D du banc.

<!-- capture : assistant-lumieres-test.png — écran « Est-ce que ça s’allume ? » -->
<!-- capture : assistant-recapitulatif.png — écran « Récapitulatif » avec le bouton « Enregistrer la configuration » -->

## 7. Sécuriser la machine à fumée (si tu en as une)

**Lis d'abord [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).** Le logiciel ne
remplace ni l'arrêt d'urgence physique, ni le relais temporisé, ni la détection incendie du site.

La fumée est **désactivée par défaut**. Elle se règle uniquement dans l'assistant Matériel (6.2) : le
chemin court ne la règle pas. Pour l'utiliser :

1. Écran Matériel, onglet « Assistant », étape « Sécuriser la fumée ». Elle n'apparaît que si une
   machine à fumée est déclarée à l'étape « Déclarer les appareils ».
2. Coche « Utiliser la fumée dans cette salle ».
3. Règle « Durée max d’une émission (s) » et « Pause entre deux émissions (s) ». Le logiciel
   plafonne la durée à 10 secondes et impose au moins 5 secondes de pause, quoi que tu saisisses.
4. Coche chacune des « Vérifications obligatoires », **après les avoir réellement faites** : arrêt
   d'urgence physique, relais temporisé, détection incendie et consignes du site vérifiées avec le
   responsable. La case du test de coupure est grisée : elle se coche toute seule à la fin du test.
5. Lance le test de coupure avec « Lancer le plantage simulé ». Ce bouton reste grisé tant que
   « Utiliser la fumée dans cette salle », l'arrêt d'urgence physique et le relais temporisé ne sont pas
   cochés. Il exige aussi que la **vraie** interface DMX soit connectée : en simulation, tu vois
   « Connecte d’abord la vraie interface DMX : en simulation, aucune fumée ne sortirait et le test ne
   prouverait rien. » Deux confirmations te sont demandées (la salle vide, l'arrêt d'urgence physique
   à portée de main), puis la fumée **part vraiment**.
6. **Pendant le test** (15 secondes sans aucune trame envoyée), regarde la machine. Si la fumée dure
   plus de 10 secondes : clique tout de suite sur « La fumée ne s’arrête pas : tout couper » **et**
   appuie sur l'arrêt d'urgence physique.
7. **Après les 15 secondes**, la question « La fumée s’est-elle arrêtée toute seule en 10 secondes au
   plus ? » s'affiche. Réponds « Elle s’est arrêtée » ou « Elle continue ». Avec « Elle continue »,
   l'arrêt d'urgence logiciel se déclenche et tu vois « La fumée ne doit pas être utilisée : vérifie le
   câblage et le réglage du relais temporisé, puis refais le test. » : **coupe la machine à la main**.
8. **Enregistre.** Clique sur « Suivant » jusqu'à « Récapitulatif », puis sur « Enregistrer la
   configuration », et attends « Configuration enregistrée. ». Sans cette étape, la fumée reste
   enregistrée comme désactivée.

Avant chaque ouverture, il faut ensuite cocher « Fumée autorisée pour cette session » dans l'onglet
« Lumières et fumée ». Dans la configuration normale, le logiciel ne le fait jamais à ta place.

> **Une exception à ne jamais utiliser.** Dans « Configuration avancée » (réglage JSON), la valeur
> `"requireConfirmation": false` arme la fumée d'office : plus aucune case à cocher. Ni l'assistant ni la
> validation de la configuration ne l'empêchent. **N'y touche jamais.** Vérifie à chaque ouverture que
> « Fumée autorisée pour cette session » est décochée au démarrage.

> À vérifier sur le banc : toute la chaîne fumée (tests F du banc). **Ne branche jamais une vraie
> machine sans avoir testé l'arrêt d'urgence physique et le relais temporisé.**

## 8. Vérification finale

Fais ce contrôle avant d'accueillir du public.

1. Écran Matériel, onglet « Buzzers » : appuie sur chaque buzzer. Le pupitre concerné réagit.
2. Onglet « Lumières et fumée » : « Tester une scène » sur un pupitre, ou « Identifier » un appareil.
   Si tu as une machine à fumée, vérifie que « Fumée autorisée pour cette session » est **décochée**.
   Attention : les scènes « Buzz », « Bonne réponse » et « Victoire » produisent des **éclairs rapides**
   (voir [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md), 1.8).
3. Onglet « Diagnostic » : « Commencer le diagnostic ». Tu peux tester les sorties une à une et
   « Tout éteindre ». Le diagnostic s'arrête seul après 10 minutes sans action. Clique sur « Terminer le
   diagnostic ».
4. Dans le backoffice, lance une partie de test (voir
   [`utilisation-quotidienne.md`](utilisation-quotidienne.md)) et joue-la jusqu'à la fin.

**Ce que tu dois voir** : le son sort des enceintes, les lumières suivent, et à la fin le bandeau
« Résultats enregistrés ». Si la salle est encore « Non configurée » dans le backoffice, la
configuration n'a pas été enregistrée : reprends l'étape 5 ou 6.

> À vérifier sur le banc : une partie complète avec buzzers, lumières, son et envoi des résultats
> (test G du banc).

## 9. Plein écran et démarrage automatique

### Lancer la salle

Sur l'écran « Prêt à jouer », clique sur « Lancer la salle ». En un clic, le logiciel passe en plein
écran, débloque le son (le navigateur l'exige après un geste humain), démarre les lumières et demande
à Windows de garder l'écran allumé.

Si tu vois « Le plein écran a été refusé par le navigateur. Tu peux le relancer avec la touche F11. »,
appuie sur F11.

> À vérifier sur le banc : le maintien de l'écran allumé n'est pas repris quand l'onglet revient au
> premier plan. Vérifie qu'il reste allumé après 30 minutes.

### Démarrage automatique

Avec le kit du poste, Chrome se lance en mode kiosque sur l'écran de salle à l'ouverture de la
session Windows. Il reste deux gestes à faire à la main : **autoriser l'interface DMX** dans Chrome
(Matériel, onglet « Lumières et fumée ») et régler Windows pour **ouvrir la session automatiquement**
après une coupure de courant (et le BIOS pour redémarrer tout seul au retour du courant). Détails dans
le README du kit.

Le PC reste connecté au compte de salle (le jeton est valable 365 jours). Après un redémarrage, tu
retrouves « Prêt à jouer » : **clique sur « Lancer la salle »**, car le son ne peut pas démarrer sans
geste humain.

> À vérifier sur le banc : redémarrage complet du PC, reconnexion de l'interface DMX sans nouvelle
> autorisation, son sans clic préalable. Test du kit poste, jamais fait en vrai.

## 10. Et ensuite

- Utiliser la salle au quotidien : [`utilisation-quotidienne.md`](utilisation-quotidienne.md).
- En cas de souci : [`depannage.md`](depannage.md).
- Tu viens d'un autre système de quiz : [`migration-salle-existante.md`](migration-salle-existante.md).

Pour modifier la configuration plus tard, clique sur « Reconfigurer la salle » (depuis l'accueil ou
l'écran Matériel).

> **Pas encore disponible** : le pilotage de la salle à distance depuis le backoffice, l'inscription
> des joueurs par QR code et les sessions programmées sont prévus mais n'existent pas encore.
