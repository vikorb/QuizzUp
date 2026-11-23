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
| PC de la salle     | Un PC Windows dédié, qui reste allumé                                                                                    | Un seul onglet QuizzUp par PC. Le kit d'installation automatique vise Windows 11 Pro et Home.              |
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
  réseau. C'est le seul élément à installer, et il est facultatif. Voir
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

**Ce que tu dois voir** : l'écran « Prêt à jouer » avec un bouton « Lancer la configuration de la
salle ». Tant que la salle n'est pas configurée, c'est ce bouton qui est proposé à la place de
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

Si tu vois « Impossible d’enregistrer. Vérifie la connexion et réessaie. », le backoffice n'a pas
reçu la configuration : vérifie le réseau puis réessaie.

### 5.4 Si tes buzzers sont une carte manette USB

Le parcours ci-dessus apprend les buzzers comme des **touches de clavier**. Si ta carte est lue comme
une manette, passe par l'écran Matériel :

1. Sur « Prêt à jouer », clique sur le bouton icône « Matériel de la salle ».
2. Ouvre l'onglet « Assistant », étape « Associer les buzzers ».
3. Dans la liste « Boîtier des buzzers », choisis « Carte manette (entrées USB) ». Le champ « Nom de
   la carte (facultatif) » aide à la reconnaître.
4. Appuie sur un buzzer : le navigateur ne voit la carte qu'**après un premier appui**.

> À vérifier sur le banc : le comportement exact de la carte manette (reconnaissance, numéros des
> entrées, rebonds) n'a jamais été essayé avec une vraie carte. Tests B du banc.

## 6. Configurer les lumières

Cette étape est facultative : sans interface DMX, les lumières restent **simulées** à l'écran et la
fumée reste **désactivée**.

Tu y arrives par « Régler les lumières » (fin de l'étape 5) ou par l'écran Matériel, onglet
« Assistant ». Les deux chemins mènent aux mêmes réglages. L'assistant du chemin court (« Passons
aux lumières ! ») ne règle **pas** la fumée : elle se règle à l'étape 7.

### 6.1 Trouver l'interface

**Chaîne A : interface USB**

1. Clique sur « Chercher une interface USB ».
2. Chrome ouvre une fenêtre de choix. Sélectionne ton interface et valide.

**Ce que tu dois voir** : la carte « Interface USB trouvée », puis le bouton « C’est bon ».

**Si ça ne marche pas** : « Ce navigateur ne gère pas l’USB : utilise Chrome ou Edge. » ; ou la fenêtre
de choix est vide (interface mal branchée, pilote absent, ou autre programme qui l'utilise : ferme-le).

**Chaîne B : pont Art-Net**

1. Installe et lance le pont sur le PC (voir ci-dessous). Il écoute en local sur le port 7654.
2. Dans l'écran Matériel, onglet « Lumières et fumée », clique sur « Connecter le pont ».
3. Dans l'onglet « Assistant », étape « Choisir l’interface DMX », choisis « Pont Art-Net local
   (boîtier réseau) ».
4. Clique sur « Chercher les nœuds » (environ 3 secondes) ou saisis l'« IP du nœud Art-Net » (une
   adresse de réseau local).

**Ce que tu dois voir** : la carte « Boîtier réseau … trouvé ».

**Installer le pont** : l'exécutable Windows n'a pas de canal de distribution officiel pour l'instant
(voir le [README du pont](../../game/artnet-bridge/README.md)). Il n'est pas signé.

- Copie `quizzup-artnet-bridge.exe` dans `C:\QuizzUp\`.
- Au premier lancement, Windows SmartScreen peut afficher un avertissement : clique sur
  « Informations complémentaires » puis « Exécuter quand même ».
- Autorise le trafic UDP sur le port 6454 dans le pare-feu, pour les réseaux de profil **Privé**.
- Si le PC a deux cartes réseau, la recherche automatique peut échouer : le README du pont décrit
  l'option `--poll-broadcast`.

> À vérifier sur le banc : le pont n'a jamais parlé à un vrai boîtier Art-Net. Le comportement de
> Windows (SmartScreen, Smart App Control, pare-feu, profil réseau) est décrit d'après la
> documentation, pas constaté. Test A du banc.

**Si tu n'as aucune interface** : clique sur « Continuer en simulation ».

### 6.2 Déclarer les appareils

L'assistant demande « Comment est équipée ta salle ? » :

- « Salle 6 pupitres » (« Le modèle QuizzUp ») : importe un modèle d'équipement type (lyres, rubans
  LED, adresses prédéfinies). Compare chaque adresse avec ce qui est réglé sur tes appareils.
- « Je garde mes appareils actuels » : tu déclares tes appareils un par un (type, nom, pupitre,
  univers, adresse). Si tu as un fichier de positions de lyres (`.txt`, `.cfg` ou `.ini`), « Reprendre
  les positions des lyres (fichier) » peut le lire.
- « Je configurerai plus tard » : tu passes cette étape.

Si deux appareils se chevauchent (même adresse), l'assistant le signale : corrige l'adresse.

### 6.3 Tester chaque appareil

L'assistant allume les appareils un par un : « Appareil 1 sur 8 », « Est-ce que ça s’allume ? ».
Réponds « Oui ! » ou « Non ». Après un « Non », l'aide rappelle de vérifier l'adresse DMX et le câble ;
tu peux « Réessayer » ou « Passer ».

Dans l'onglet « Assistant » de l'écran Matériel, les mêmes tests s'appellent « Allumer », « Éteindre »,
« Ça marche » et « Rien ne se passe ». Le bouton « Suivant » reste grisé tant que tous les appareils
ne sont pas testés, avec la liste des raisons.

Si tu as des lyres, l'étape « Viser les pupitres » te fait pointer chaque lyre vers son pupitre. Les
flèches du clavier déplacent la lyre ; Maj donne un pas fin ; Entrée valide.

**Ce que tu dois voir** : chaque appareil réagit comme annoncé, puis l'écran « Tes lumières sont
prêtes ! » avec le bilan « … appareil(s) OK, … à vérifier ». Clique sur « Terminer ».

> À vérifier sur le banc : tout le chapitre 6. Aucun appareil réel n'a été piloté. Tests D du banc.

<!-- capture : assistant-lumieres-test.png — écran « Est-ce que ça s’allume ? » -->

## 7. Sécuriser la machine à fumée (si tu en as une)

**Lis d'abord [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).** Le logiciel ne
remplace ni l'arrêt d'urgence physique, ni le relais temporisé, ni la détection incendie du site.

La fumée est **désactivée par défaut**. Pour l'utiliser :

1. Écran Matériel, onglet « Assistant », étape « Sécuriser la fumée ». Elle n'apparaît que si une
   machine est déclarée.
2. Coche « Utiliser la fumée dans cette salle ».
3. Règle « Durée max d’une émission (s) » et « Pause entre deux émissions (s) ». Le logiciel
   plafonne la durée à 10 secondes et impose au moins 5 secondes de pause, quoi que tu saisisses.
4. Coche chacune des « Vérifications obligatoires », **après les avoir réellement faites** : arrêt
   d'urgence physique, relais temporisé, détection incendie et consignes du site vérifiées avec le
   responsable.
5. Lance le test de coupure (« Lancer le plantage simulé ») et réponds « Elle s’est arrêtée » ou
   « Elle continue ». Si la fumée continue, clique sur « La fumée ne s’arrête pas : tout couper » et
   **coupe la machine à la main**.

Avant chaque ouverture, il faut ensuite cocher « Fumée autorisée pour cette session » dans l'onglet
« Lumières et fumée ». Ce geste humain n'est jamais fait pour toi.

> À vérifier sur le banc : toute la chaîne fumée (tests F du banc). **Ne branche jamais une vraie
> machine sans avoir testé l'arrêt d'urgence physique et le relais temporisé.**

## 8. Vérification finale

Fais ce contrôle avant d'accueillir du public.

1. Écran Matériel, onglet « Buzzers » : appuie sur chaque buzzer. Le pupitre concerné réagit.
2. Onglet « Lumières et fumée » : « Tester une scène » sur un pupitre, ou « Identifier » un appareil.
3. Onglet « Diagnostic » : « Commencer le diagnostic ». Tu peux tester les sorties une à une et
   « Tout éteindre ». Le diagnostic s'arrête seul après 10 minutes sans action. Clique sur « Terminer le
   diagnostic ».
4. Dans le backoffice, lance une partie de test (voir
   [`utilisation-quotidienne.md`](utilisation-quotidienne.md)) et joue-la jusqu'à la fin.

**Ce que tu dois voir** : le son sort des enceintes, les lumières suivent, et à la fin le bandeau
« Résultats enregistrés ». Dans le backoffice, la salle passe à « Configurée ».

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
