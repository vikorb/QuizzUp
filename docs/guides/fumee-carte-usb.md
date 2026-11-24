# La machine à fumée commandée par une carte USB

Ce guide s'adresse à la personne qui installe ou fait tourner la salle. Il couvre le cas des salles
dont la machine à fumée est commandée par une **carte compatible Arduino Uno** et un module relais,
reliés au PC par un câble USB. Les autres montages (relais DMX) sont dans
[`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).

> **Honnêteté d'abord.** **Rien de ce guide n'a été essayé sur une vraie carte.** Il est écrit à partir
> du code et de la conception
> ([`conception-fumee-carte-usb.md`](../cadrage/conception-fumee-carte-usb.md)). Chaque point physique
> est marqué « à valider sur le banc » : cas F11 à F20 de
> [`banc-materiel.md`](../recette/banc-materiel.md). Tant que le banc n'est pas passé, ne branche pas
> une vraie machine.

## Sommaire

1. [Ce que fait la carte](#1-ce-que-fait-la-carte)
2. [Avant de commencer](#2-avant-de-commencer)
3. [Pas à pas](#3-pas-à-pas)
4. [Restaurer le programme d'origine](#4-restaurer-le-programme-dorigine)
5. [Messages de l'écran et gestes](#5-messages-de-lécran-et-gestes)
6. [Garder l'autorisation du port série (Chrome, Edge)](#6-garder-lautorisation-du-port-série-chrome-edge)
7. [Compatibilité](#7-compatibilité)

## 1. Ce que fait la carte

Avec le programme QuizzUp, la carte n'envoie de la fumée que **tant que la page lui redit de le
faire** (un ordre toutes les 100 ms, valable 500 ms). Si la page plante, se ferme ou si le câble est
débranché, la carte coupe en 0,5 s environ. Trois limites sont écrites dans la carte et la page ne
peut pas les changer :

| Limite                       | Valeur                                               |
| ---------------------------- | ---------------------------------------------------- |
| Durée d'un jet               | 10 secondes au plus                                  |
| Pause entre deux jets        | 5 secondes au moins                                  |
| Carte figée (chien de garde) | la carte redémarre au bout de 250 ms, relais retombé |

**La carte démarre toujours en pause de 5 secondes** : après la mise sous tension, une ouverture du
port ou un appui sur RESET, aucun jet n'est possible pendant 5 secondes.

Le programme d'origine de la carte (la minuterie autonome) est remplacé. Il n'est pas dans le dépôt :
c'est **ta sauvegarde**, téléchargée avant l'installation, qui sert de retour arrière (chapitre 4).

> À valider sur le banc : tout ce chapitre (F11 à F18). En particulier, le relais doit rester ouvert
> quand l'entrée de la carte « flotte » pendant environ une seconde à chaque remise à zéro et pendant
> toute l'installation (F11, F12, F13, F14). Si le relais colle, même un instant : n'installe rien et
> préviens l'éditeur.

### Ce que la carte ne remplace pas

L'arrêt d'urgence physique, le relais temporisé de 10 secondes au plus, la détection incendie et la
ventilation restent obligatoires : voir [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).
Les sécurités de la carte s'ajoutent à celles-là, elles ne les remplacent pas.

## 2. Avant de commencer

- Un PC avec **Chrome ou Edge** (Web Serial). Firefox et Safari ne conviennent pas.
- L'écran de salle servi en **HTTPS** (ou ouvert en `localhost`).
- La carte reliée au PC par **USB**. Par défaut, la conception prévoit que l'USB alimente la carte et
  le relais, sans le bloc secteur d'origine. Le câble de 5 mètres au plus est une hypothèse.
  À valider sur le banc : F15.
- **La machine à fumée éteinte** (interrupteur d'alimentation) pendant tout ce qui suit, jusqu'au test
  de coupure. Le programme d'origine de la carte déclenche la fumée tout seul dès qu'elle est sous
  tension.
- Pas d'autre onglet ni d'autre programme qui utilise le port de la carte.
- Un dossier de téléchargement où le navigateur peut enregistrer un fichier sans te le refuser.

## 3. Pas à pas

L'écran se trouve dans Matériel, onglet « Lumières et fumée », bloc « Carte USB de la fumée ». Si tu
vois « Ce navigateur ne pilote pas l’USB : utilise Chrome ou Edge. », ce n'est pas le bon navigateur.

### 3.1 Brancher et choisir la carte

1. Éteins la machine à fumée.
2. Branche le câble USB de la carte au PC.
3. Clique sur « Choisir la carte de la fumée ». Chrome ouvre une fenêtre de choix : sélectionne la
   carte et valide.

**Ce que tu dois voir** : « Prête (programme 1.0.0). » si le programme QuizzUp est déjà installé.
Sinon, passe à l'étape 3.2.

Si la liste du navigateur est vide, ou si le message « Aucune carte choisie. Si la liste reste vide,
vérifie le câble USB et le pilote de la carte. » reste affiché : vérifie le câble, essaie un autre
port USB, puis lis le [chapitre 7](#7-compatibilité) (pilote, fabricant de la puce).

Un choix refusé avec « C’est l’interface DMX de la salle : choisis la carte de la fumée. » : tu as
choisi l'interface DMX. Recommence et prends la carte.

Si tu vois « Cette carte ne répond pas avec le programme QuizzUp. Installe le programme ci-dessous. »,
c'est normal sur une carte neuve : installe le programme (étape 3.2).

### 3.2 Installer le programme

1. Vérifie que la machine à fumée est **éteinte**.
2. Coche « La machine à fumée est éteinte ». Sans cette case, « Installer le programme » reste grisé.
   La case se décoche à chaque essai : coche-la de nouveau si tu recommences.
3. Clique sur « Installer le programme ».
4. **Sauvegarde.** La page lit le programme en place sur la carte et le télécharge dans un fichier
   `quizzup-fumee-sauvegarde-carte.hex`. Rien n'est écrit tant que tu n'as pas répondu à la question
   « Le programme actuel de la carte est téléchargé (…). Le fichier est-il bien enregistré sur ce PC ? ».
   - Vérifie dans le dossier de téléchargement que le fichier existe et qu'il n'est pas vide.
   - **Copie-le ailleurs** que sur le PC de la salle (clé USB, dossier de l'exploitant). Le fichier
     porte toujours le même nom : une deuxième sauvegarde, d'une autre carte ou d'une carte déjà
     programmée par QuizzUp, écrase la première dans le dossier de téléchargement.
   - Si le fichier est là, clique sur « Oui, la sauvegarde est enregistrée ».
   - S'il n'est pas là, clique sur « Non, annuler ». L'installation s'arrête et rien n'est écrit.
5. **Écriture et relecture.** Une barre de progression passe par « Synchronisation avec la carte »,
   « Sauvegarde du programme en place », « Écriture », « Relecture » puis « Lancement du programme ».
   Compte une dizaine de secondes. Ne débranche rien.

**Ce que tu dois voir** : « Programme installé. La carte repart en pause de sécurité, fumée désarmée. »
puis, après quelques secondes, « Prête (programme 1.0.0). ».

Si la barre s'arrête sur une erreur, lis le [chapitre 5](#5-messages-de-lécran-et-gestes). Une
installation ratée se recommence : le chargeur de la carte n'est pas touché.

> À valider sur le banc : F14 (état du relais pendant toute l'installation, y compris un échec),
> l'impulsion qui remet la carte à zéro depuis la page (sinon appuie sur RESET au départ de la barre),
> et le téléchargement de la sauvegarde sur le PC de la salle.

### 3.3 Test de coupure

Le test de coupure se fait dans l'assistant Matériel, étape « Sécuriser la fumée », comme pour une
salle à relais DMX : voir [`installation-salle.md`](installation-salle.md), étape 7. Les vérifications
obligatoires et le bouton « Lancer le plantage simulé » sont les mêmes. Pendant le test, plus aucune
trame n'est envoyée : la page ne redit donc plus rien à la carte, qui doit couper d'elle-même.

- La fumée part vraiment. Machine allumée, salle vide, arrêt d'urgence physique à portée de main.
- Si la fumée ne s'arrête pas : « La fumée ne s’arrête pas : tout couper » **et** l'arrêt d'urgence
  physique.
- Réponds « Elle s’est arrêtée » ou « Elle continue » à la question affichée.

Deux points ne sont pas réglés dans l'écran, à valider sur le banc :

- **Les textes de l'assistant parlent du relais temporisé** (« 10 secondes au plus »). Avec la carte,
  la coupure attendue est bien plus rapide (moins d'une seconde, d'après la conception). Les textes
  propres à la carte prévus par la conception n'existent pas encore dans l'écran.
- Le bouton « Lancer le plantage simulé » exige une vraie interface DMX connectée
  (« Connecte d’abord la vraie interface DMX : en simulation, aucune fumée ne sortirait et le test ne
  prouverait rien. »). Pour une salle qui n'a que la carte, il est **à vérifier** si le test est
  accepté. Si ce n'est pas le cas, ne contourne pas la sécurité : préviens l'éditeur.

Le relais temporisé et l'arrêt d'urgence physique restent exigés, avec la carte comme sans elle.

### 3.4 Armer la fumée

1. Après un redémarrage, un rechargement ou un rebranchement, la carte est prête mais la fumée est
   **désarmée**. Attends « Prête (programme 1.0.0). ».
2. Le contrôle d'ouverture est le même que d'habitude
   ([`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md), chapitre 3).
3. Quand tout est vérifié, coche « Fumée autorisée pour cette session ». Fais un essai court avec
   « Tester 2 s », **hors public**.

Un jet est refusé avec « Carte de la fumée absente, muette ou en pause de démarrage : fumée refusée. »
tant que la carte n'est pas prête, y compris pendant les 5 secondes de pause qui suivent chaque remise
à zéro. Attends, puis recommence.

Avec une carte et un relais DMX en même temps, les deux reçoivent le même ordre.

> À valider sur le banc : F16 à F20 (remise à zéro en plein jet, navigateur tué, USB débranché,
> rechargement, reconnexion, carte et DMX USB ensemble, télécommande de la machine).

## 4. Restaurer le programme d'origine

À utiliser pour revenir à l'ancien fonctionnement (minuterie autonome) avec **ta sauvegarde**.

> **Avertissement.** Le programme restauré est celui d'origine. **Il n'a aucune des sécurités de
> QuizzUp** et il peut déclencher la fumée tout seul. **Laisse la machine à fumée éteinte** après une
> restauration, jusqu'à ce que quelqu'un d'autre que le PC la contrôle (minuterie, interrupteur,
> télécommande).

1. Éteins la machine à fumée.
2. Coche « La machine à fumée est éteinte ».
3. Avec « Fichier .hex à restaurer », choisis le fichier de sauvegarde
   (`quizzup-fumee-sauvegarde-carte.hex`).
4. Clique sur « Restaurer ». Le bouton reste grisé tant que la case n'est pas cochée et qu'un fichier
   n'est pas choisi.

**Ce que tu dois voir** : « Programme restauré. C’est le programme d’origine : il ne suit pas les
sécurités de QuizzUp et peut déclencher la fumée tout seul. Laisse la machine à fumée éteinte. »

Si le fichier est refusé avec « Ce fichier n’est pas un programme .hex lisible : rien n’a été écrit. »,
ne l'écrase pas : reprends la copie de sauvegarde gardée ailleurs.

Après une restauration, l'écran ne voit plus le programme QuizzUp : « Programme QuizzUp absent sur
cette carte. » est le message attendu.

> À valider sur le banc : F20 (l'ancien comportement est bien revenu).

## 5. Messages de l'écran et gestes

### État de la carte

| Message                                                             | Ce que ça veut dire                                              | Geste                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| « Aucune carte connectée. »                                         | Aucune carte n'a été choisie ou reprise                          | « Choisir la carte de la fumée »                                                             |
| « Connexion à la carte… »                                           | La page attend le message de démarrage de la carte (3 s au plus) | Attends                                                                                      |
| « Prête (programme 1.0.0). »                                        | Carte prête                                                      | Rien                                                                                         |
| « Programme 1.0.0 à mettre à jour. »                                | La carte a un autre programme QuizzUp que celui livré            | « Installer le programme »                                                                   |
| « Programme QuizzUp absent sur cette carte. »                       | La carte ne répond pas avec le programme QuizzUp                 | Installe le programme (3.2)                                                                  |
| « La carte ne répond plus. »                                        | La carte est restée muette plus d'une seconde. Fumée coupée      | Vérifie le câble. Recharge la page. Si ça se répète, débranche puis rebranche la carte       |
| « Carte débranchée ou port perdu. »                                 | Le port a disparu                                                | Rebranche. La carte est reprise toute seule, **fumée désarmée**                              |
| « La carte a redémarré ou se contredit : fumée coupée. »            | Remise à zéro en cours de partie, ou réponse incohérente         | Attends la fin de la pause de 5 s. Réarme à la main. Si ça se répète, signale-le à l'éditeur |
| « La carte de la fumée ne répond plus : fumée coupée et désarmée. » | Avertissement du contrôleur de lumières                          | Même geste que « La carte ne répond plus. »                                                  |

### Choix de la carte

| Message                                                                                                       | Geste                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| « Plusieurs cartes du même modèle sont branchées : aucune n’est reprise, débranche-en une. »                  | Débranche l'autre carte (par exemple celle des buzzers)     |
| « C’est l’interface DMX de la salle : choisis la carte de la fumée. »                                         | Choisis l'autre appareil                                    |
| « La carte répond, mais la configuration de la salle n’a pas pu être enregistrée : réessaie. »                | Vérifie le réseau, puis recommence le choix                 |
| « Web Serial est indisponible : utilise Chrome ou Edge sur le PC de la salle. »                               | Change de navigateur                                        |
| « L’interface choisie est la carte de la fumée : elle n’est jamais ouverte en DMX. Choisis l’interface DMX. » | Voir le chapitre 7, interface DMX qui partage l'identifiant |

### Installation et restauration

| Message                                                                                                                | Geste                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| « La carte ne répond pas au chargeur : appuie sur RESET au départ de la barre. »                                       | Recommence l'installation et appuie sur RESET sur la carte au moment où la barre démarre                           |
| « Ce n’est pas une carte Uno (signature inattendue) : rien n’a été écrit. »                                            | Ce n'est pas la bonne carte. Ne force pas : cette carte n'est pas prise en charge                                  |
| « Le programme est trop gros pour cette carte : rien n’a été écrit. »                                                  | Carte à chargeur ancien. Signale-le à l'éditeur                                                                    |
| « La relecture diffère de ce qui a été écrit : recommence l’installation. »                                            | Recommence. Si ça se répète, change de câble, de port USB, puis de carte                                           |
| « Carte débranchée ou port perdu : recommence l’installation. »                                                        | Rebranche, recommence                                                                                              |
| « Port occupé : ferme l’autre onglet ou le programme qui l’utilise. »                                                  | Ferme l'autre onglet QuizzUp ou le programme qui tient le port, puis recommence                                    |
| « La carte ne répond plus : recommence l’installation. »                                                               | Recommence                                                                                                         |
| « Opération annulée. »                                                                                                 | Recommence si besoin                                                                                               |
| « La sauvegarde du programme en place n’est pas confirmée ou a échoué : rien n’a été écrit. »                          | Vérifie le téléchargement de ton navigateur, puis recommence                                                       |
| « Coche d’abord « La machine à fumée est éteinte ». »                                                                  | Éteins la machine, puis coche la case                                                                              |
| « Choisis d’abord la carte de la fumée. »                                                                              | Étape 3.1                                                                                                          |
| « Ce fichier n’est pas un programme .hex lisible : rien n’a été écrit. »                                               | Choisis un autre fichier                                                                                           |
| « Une installation est déjà en cours. »                                                                                | Attends la fin de l'opération en cours                                                                             |
| « Le programme de la carte est peut-être faux : ne rebranche pas la machine avant une nouvelle installation réussie. » | **Laisse la machine éteinte et débranchée de la carte.** Recommence l'installation jusqu'à « Programme installé. » |

Ce dernier message (« peut-être faux ») veut dire qu'une écriture a échoué en cours de route et que la
remise en état de la carte a échoué aussi. Tant qu'il est là, la carte peut faire n'importe quoi,
y compris fermer le relais.

### Si rien ne répond

1. Arrêt d'urgence physique si de la fumée sort sans que tu l'aies demandée.
2. Éteins la machine, débranche l'USB de la carte.
3. Rebranche, attends « Prête (programme 1.0.0). », recommence à l'étape 3.1.
4. Si ça ne passe pas, garde la machine éteinte et préviens l'éditeur.

## 6. Garder l'autorisation du port série (Chrome, Edge)

Web Serial n'ouvre un port que si l'utilisateur l'a autorisé. Deux façons de garder l'autorisation sur
le PC de la salle.

**A. L'autorisation retenue par Chrome (rien à régler).** Au premier choix, tu choisis la carte dans la
fenêtre du navigateur. Chrome retient l'autorisation dans le profil du navigateur. Au rechargement et
au rebranchement, l'écran de salle retrouve la carte tout seul, parmi les ports déjà autorisés, grâce
à l'identifiant USB enregistré dans la configuration de la salle. Elle repart **désarmée**.
Conditions : le même profil de navigateur, et un seul appareil de ce modèle branché (sinon « Plusieurs
cartes du même modèle sont branchées : aucune n’est reprise, débranche-en une. »). Un autre profil, un
navigateur réinitialisé ou un autre PC demandent de refaire le choix.

**B. La stratégie `SerialAllowUsbDevicesForUrls` du kit du poste.** Le kit
[`deploy/poste-salle/`](../../deploy/poste-salle/README.md) importe dans le registre une stratégie
Chrome qui autorise, pour l'origine de l'écran de salle, les ports de ces fabricants :

| Fabricant (puce USB) | Identifiant | Valeur décimale du registre |
| -------------------- | ----------- | --------------------------- |
| Arduino              | `0x2341`    | 9025                        |
| Arduino (ancien)     | `0x2A03`    | 10755                       |
| CH340                | `0x1A86`    | 6790                        |
| FTDI                 | `0x0403`    | 1027                        |
| Silicon Labs CP210x  | `0x10C4`    | 4292                        |

Les trois premiers fabricants sont ceux que l'écran propose pour la carte de la fumée. Les deux autres
servent aux interfaces DMX. La stratégie vaut pour tout appareil de ces fabricants, la carte comprise :
elle n'est donc pas propre à la carte.

Ce qui est sûr, d'après le kit :

- le modèle de la stratégie est `deploy/poste-salle/politiques-chrome.reg` ; le script
  `installer-poste.ps1` y remplace l'origine par celle de l'écran de salle ;
- cette stratégie est lue sur Windows Home comme sur Pro d'après le README du kit (elle n'est pas
  marquée « sensible » dans les définitions de Chrome) ;
- le contrôle se fait dans `chrome://policy`, bouton « Recharger les règles ».

À vérifier sur le poste :

- que la stratégie apparaît bien dans `chrome://policy` et sans avertissement ;
- que, avec la stratégie, le chargement de la page retrouve la carte sans nouveau choix ;
- que la fenêtre de choix de « Choisir la carte de la fumée » s'ouvre encore (le premier choix reste
  nécessaire pour enregistrer l'identifiant de la carte dans la salle) ;
- **Edge** : le kit ne configure que Chrome. Le nom et le chemin de la stratégie équivalente pour
  Edge ne sont pas donnés par la conception : **à vérifier sur le poste** avant d'utiliser Edge. À
  défaut, utilise l'autorisation retenue par le navigateur (A).

Ne modifie pas la liste des fabricants à la main : un test du dépôt vérifie qu'elle suit la liste des
interfaces DMX connues.

## 7. Compatibilité

### Cartes

| Carte ou puce USB                                                 | Fabricant (identifiant) | Proposée dans « Choisir la carte de la fumée » | Installation du programme                                                                                   |
| ----------------------------------------------------------------- | ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Arduino Uno R3, puce 16U2 (carte d'origine)                       | Arduino `0x2341`        | Oui                                            | Prévue. Pilote série de Windows 10 et 11 (supposé). À valider sur le banc                                   |
| Carte Arduino d'une autre époque (même puce, autre fabricant USB) | Arduino `0x2A03`        | Oui                                            | Prévue. À valider sur le banc                                                                               |
| Clone Uno à puce CH340                                            | CH340 `0x1A86`          | Oui                                            | Prévue. Il faut le pilote du fabricant, en général posé par Windows Update (supposé). À valider sur le banc |
| Carte à puce FTDI                                                 | FTDI `0x0403`           | **Non** (absente de la liste)                  | Non prise en charge                                                                                         |
| Carte à puce Silicon Labs CP210x                                  | `0x10C4`                | **Non** (absente de la liste)                  | Non prise en charge                                                                                         |
| Carte qui n'est pas un ATmega328P (Mega, Leonardo, etc.)          | selon la carte          | selon le fabricant                             | **Refusée** : « Ce n’est pas une carte Uno (signature inattendue) : rien n’a été écrit. »                   |

Ce que l'installation exige de la carte :

- un **ATmega328P** avec le chargeur **Optiboot** de l'Uno (115200 bauds ; un ancien chargeur à
  57600 bauds est essayé une fois) ;
- un programme de **32 256 octets** au plus (30 720 avec un ancien chargeur) ;
- une impulsion de remise à zéro par le signal DTR, ou un appui sur RESET au bon moment.

Le fabricant seul filtre la fenêtre de choix : une carte d'un fabricant de la liste qui n'est pas un
Uno est proposée, puis refusée à l'installation. Une carte qui n'est pas proposée par la fenêtre n'est
pas acceptée par l'écran de salle.

Si la carte est absente de la fenêtre de choix : câble USB (certains câbles ne portent que
l'alimentation), autre port USB, pilote dans le Gestionnaire de périphériques de Windows. Pour une
puce CH340 sans pilote, l'installation du pilote du fabricant est une **exception** à faire valider
avant, car rien n'est censé s'installer sur le PC de la salle.

> À valider sur le banc : F19 (pilote Windows et identifiant USB relevés sur la vraie carte).

### Navigateurs

| Navigateur              | Carte de la fumée (Web Serial) | Remarque                                                                        |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Google Chrome (récent)  | Oui                            | Le kit du poste le configure                                                    |
| Microsoft Edge (récent) | Oui, d'après la norme          | Stratégie du port à vérifier sur le poste (chapitre 6). Jamais essayé           |
| Firefox, Safari         | **Non**                        | « Web Serial est indisponible : utilise Chrome ou Edge sur le PC de la salle. » |

La page doit être servie en HTTPS, ou ouverte en `localhost`. Un seul onglet QuizzUp par PC : un autre
onglet qui tient le port donne « Port occupé : ferme l’autre onglet ou le programme qui l’utilise. ».

### Carte de la fumée et interface DMX sur le même PC

Les cartes de la fumée et les interfaces DMX USB partagent des fabricants (`0x2341`, `0x2A03`, `0x1A86`).
L'écran les distingue par le **modèle** USB (fabricant et produit), sans numéro de série. Conséquences :

- **Une interface DMX qui a le même identifiant USB que la carte** (par exemple une interface à puce
  CH340 et un clone de carte à puce CH340 du même modèle) n'est **pas utilisable comme interface DMX**.
  Si tu la choisis avec « Connecter l’interface DMX », elle n'est jamais ouverte et l'écran affiche
  « L’interface choisie est la carte de la fumée : elle n’est jamais ouverte en DMX. Choisis
  l’interface DMX. ». Au rechargement, le choix automatique de l'interface DMX écarte aussi tout port de
  ce modèle.
- Dans l'autre sens, une carte du même modèle que l'interface DMX déjà enregistrée est refusée avec
  « C’est l’interface DMX de la salle : choisis la carte de la fumée. ». Le premier appareil enregistré
  garde l'identifiant.
- Deux cartes du même modèle branchées en même temps : aucune n'est reprise
  (« Plusieurs cartes du même modèle sont branchées : aucune n’est reprise, débranche-en une. »).
- Remède : utilise des appareils de **modèles différents** (une interface DMX d'un autre fabricant ou
  d'un autre produit USB), ou la fumée par un relais DMX sans carte.
- Les cartes Arduino (`0x2341`, `0x2A03`) ne sont jamais prises automatiquement pour l'interface DMX,
  même sans carte de fumée enregistrée : seul un choix de l'opérateur peut en désigner une.

> À valider sur le banc : F19 (carte et interface DMX ensemble, rechargements et redémarrage du PC,
> chaque port retrouvé sur le bon appareil).
