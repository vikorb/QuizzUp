# Passer une salle déjà équipée à QuizzUp

Ce guide s'adresse au **gérant** et au **technicien** d'un centre qui possède déjà une salle de quiz
équipée (pupitres avec buzzers, lumières DMX, éventuellement une machine à fumée) et qui veut la
faire fonctionner avec QuizzUp. L'idée est de **garder le matériel en place** et de ne changer que
ce qui doit l'être.

> **Honnêteté d'abord.** Ce guide est construit sur la documentation technique du projet et sur le
> code. **Rien n'a encore été validé sur du vrai matériel** : aucune migration réelle n'a été faite.
> Chaque point incertain est marqué `> À vérifier sur le banc :`. Prévois une salle fermée au public
> et un moyen de revenir à ton installation actuelle (voir [Retour arrière](#6-retour-arrière)).

> **Engagements contractuels.** QuizzUp ne se branche pas sur le logiciel de ton fournisseur actuel et
> ne reprend rien de lui. **Vérifie toi-même, avec ton fournisseur précédent, tes engagements**
> (durée de la licence, exclusivité, préavis, propriété du matériel et des contenus) **avant de
> migrer.** L'éditeur de QuizzUp ne peut pas le faire à ta place et ce guide n'est pas un avis
> juridique.

## Sommaire

1. [Ce que QuizzUp attend d'une salle](#1-ce-que-quizzup-attend-dune-salle)
2. [Faire l'inventaire avant](#2-faire-linventaire-avant)
3. [Ce qui est repris tel quel, ce qui se reconfigure](#3-ce-qui-est-repris-tel-quel-ce-qui-se-reconfigure)
4. [Déroulé en une demi-journée](#4-déroulé-en-une-demi-journée)
5. [Vérifications finales](#5-vérifications-finales)
6. [Retour arrière](#6-retour-arrière)
7. [Ce qui n'existe pas dans QuizzUp](#7-ce-qui-nexiste-pas-dans-quizzup)

## 1. Ce que QuizzUp attend d'une salle

- Un **PC Windows** avec Chrome (ou Edge), qui fait tourner l'écran de salle dans le navigateur.
- De **1 à 6 pupitres**, avec **4 buzzers** (A, B, C, D) par pupitre.
- Des buzzers lus soit comme un **clavier**, soit comme une **manette USB** (carte d'entrées vue par
  Windows comme une manette).
- Facultatif : un système **DMX** (lyres, projecteurs, rubans LED) piloté par une interface **USB** ou
  par un boîtier **Art-Net** (via le pont QuizzUp).
- Facultatif : une machine à fumée, **avec un relais DMX, un relais temporisé de 10 secondes maximum
  et un arrêt d'urgence physique**. Sans cela, la fumée reste désactivée. Voir
  [`securite-fumee-et-lumieres.md`](securite-fumee-et-lumieres.md).

## 2. Faire l'inventaire avant

Avant le jour de la migration, remplis cette liste. Prends des **photos** de chaque câblage.

| À relever                                          | Pourquoi                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Nombre de pupitres et de buzzers par pupitre       | QuizzUp gère 1 à 6 pupitres et 4 buzzers par pupitre.                                   |
| Le boîtier des buzzers (marque, modèle)            | Clavier ou manette ? Combien d'entrées ?                                                |
| Un utilitaire convertit-il la manette en clavier ? | Inutile avec QuizzUp si la carte est lue en manette ; à ne plus lancer.                 |
| L'interface DMX actuelle                           | USB ? Boîtier réseau Art-Net ? Dans ce cas : son adresse IP et ses univers.             |
| La liste des appareils DMX                         | Type, adresse DMX, nombre de canaux (mode), pupitre associé.                            |
| Le **mode** de chaque lyre (nombre de canaux)      | Un profil de lyre dépend de ce mode.                                                    |
| Les réglages de visée des lyres                    | Le fichier de calage (positions pan/tilt) peut être repris.                             |
| La machine à fumée                                 | Modèle, télécommande, **ce qui la pilote aujourd'hui** (minuterie autonome ? relais ?). |
| La sécurité fumée existante                        | Arrêt d'urgence physique ? Relais temporisé ? Détection incendie ?                      |
| Le PC actuel                                       | Windows ? Version ? Deux cartes réseau ? Navigateur installé ?                          |
| Le son et la vidéo                                 | Sortie du PC, table de mixage, vidéoprojecteur.                                         |
| Les contenus utilisés                              | Questions, extraits audio, droits associés.                                             |
| Ton contrat actuel                                 | À relire avant de décider (voir l'encadré en haut).                                     |

> À vérifier sur le banc : un modèle d'équipement type « 6 pupitres » est fourni avec QuizzUp (adresses
> de lyres, rubans LED, relais de fumée). Il correspond à une salle courante, pas forcément à la tienne.
> **La notice de chaque appareil fait foi**, en particulier l'ordre des canaux des lyres.

## 3. Ce qui est repris tel quel, ce qui se reconfigure

### 3.1 Repris tel quel

| Élément                       | Ce qui se passe                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Pupitres, câblage des buzzers | Aucun recâblage. Les LED des buzzers ne sont pas pilotées par le PC et restent comme avant. |
| Carte d'entrées (manette)     | Lue directement par le navigateur, sans rien installer (Chrome ou Edge).                    |
| Lyres et rubans LED           | Ils gardent leurs **adresses DMX** et leur câblage.                                         |
| Son                           | Sortie audio du PC vers tes enceintes, sans changement.                                     |
| Vidéo                         | Écran ou vidéoprojecteur en HDMI : l'écran de salle s'affiche en plein écran.               |
| Caméras ou autres logiciels   | Hors périmètre de QuizzUp : ils continuent à côté.                                          |
| Calage des lyres              | Un fichier de positions (`.txt`, `.cfg`, `.ini`) peut être relu par l'assistant.            |

### 3.2 Se reconfigure

| Élément                 | Ce qu'il faut faire                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Association des buzzers | **À refaire** dans l'assistant : l'ordre des entrées de la carte dépend de ton câblage.                                                                                                   |
| Interface DMX           | USB : branche une interface compatible. Art-Net : installe le pont QuizzUp sur le PC.                                                                                                     |
| Appareils lumineux      | À déclarer dans l'assistant (modèle « Salle 6 pupitres » ou saisie à la main).                                                                                                            |
| Univers DMX             | Le modèle met tout sur l'**univers 0**. Si ton boîtier Art-Net attend d'autres univers, place les appareils sur les univers 1 ou 2 dans l'assistant, ou utilise l'option `--map` du pont. |
| Machine à fumée         | À adapter : relais DMX, relais temporisé, arrêt d'urgence physique, et **retrait de toute minuterie autonome**.                                                                           |
| Questions et contenus   | À recréer dans le backoffice (voir ci-dessous).                                                                                                                                           |
| Comptes                 | Compagnie, salle et compte de salle à créer au backoffice.                                                                                                                                |
| Logiciel du PC          | Ne plus lancer l'ancien logiciel ni son utilitaire de conversion.                                                                                                                         |

**Les questions.** QuizzUp ne reprend aucun questionnaire, média ni texte d'un autre système, et il
n'a **pas d'outil d'importation**. Tu crées tes thèmes et tes questions dans le backoffice. Chaque
extrait audio (mp3 ou ogg, 10 Mo maximum) demande de cocher « J'atteste avoir le droit de diffuser ce
fichier ». Le centre est responsable des droits des extraits qu'il ajoute.

> À vérifier sur le banc : l'ordre des canaux des lyres, la valeur du canal « strobe » qui laisse le
> faisceau ouvert et le sens des couleurs des rubans (RGB) dépendent de **tes modèles**. Tests D du
> banc.

## 4. Déroulé en une demi-journée

Prévois **4 heures** avec la salle fermée, une personne qui connaît le câblage, et l'accès au
backoffice.

### Avant la demi-journée (à distance)

1. Fais l'inventaire (chapitre 2).
2. Crée, au backoffice, la compagnie si besoin, la salle et son compte de salle. Voir
   [`installation-salle.md`](installation-salle.md), étape 2.
3. Crée au moins un thème avec quelques questions audio et prépare une partie de test.
4. Si ta salle est en Art-Net, prépare le pont (voir l'étape 6 de
   [`installation-salle.md`](installation-salle.md)).

### Le jour J

| Durée  | Étape                   | Détail                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15 min | Sauvegarder l'existant  | Photos des câblages. Copie de la configuration de l'ancien système (fichiers de calage, listes d'adresses). Note les réglages.                                                                                                                                                                            |
| 15 min | **Couper la fumée**     | **Débranche le dispositif qui la déclenche tout seul.** Une minuterie autonome enverrait de la fumée hors de tout contrôle du jeu.                                                                                                                                                                        |
| 30 min | Préparer le PC          | Chrome ou Edge, kit du poste ou installation à la main ([`installation-salle.md`](installation-salle.md), chapitre 3). Ne plus lancer l'ancien logiciel.                                                                                                                                                  |
| 15 min | Connecter la salle      | « Connexion de la salle » avec le compte de salle.                                                                                                                                                                                                                                                        |
| 45 min | Buzzers                 | Assistant. Pour une carte manette : Matériel, onglet « Assistant », étape « Associer les buzzers », « Carte manette (entrées USB) ». Renseigne « Nom de la carte (facultatif) » si une autre manette est branchée sur le PC. Appuie une première fois pour réveiller la carte. Puis « Test des buzzers ». |
| 45 min | Lumières                | Interface USB ou pont Art-Net. « Salle 6 pupitres » ou « Je garde mes appareils actuels ». « Reprendre les positions des lyres (fichier) » pour le calage. Test appareil par appareil, puis « Viser les pupitres ».                                                                                       |
| 45 min | Fumée (si tu en as une) | Relais DMX, relais temporisé, arrêt d'urgence physique, puis l'étape « Sécuriser la fumée » de l'assistant. Test hors public.                                                                                                                                                                             |
| 30 min | Partie d'essai          | Une partie complète lancée depuis le backoffice : buzzers, son, lumières, résultats.                                                                                                                                                                                                                      |

> À vérifier sur le banc : ces durées sont des **estimations**, pas des mesures. Aucune migration n'a
> été chronométrée.

### Le chemin de l'USB ou du réseau, en bref

- **Tu passes à une interface USB** : débranche le boîtier Art-Net, branche l'interface USB sur le
  PC, sa sortie DMX sur la chaîne qui alimentait tes appareils. Lyres et rubans gardent leurs adresses.
  Aucun logiciel à installer.
- **Tu gardes ton boîtier Art-Net** : installe le pont QuizzUp sur le PC. Il lit l'IP de ton boîtier
  dans l'assistant (champ « IP du nœud Art-Net »). Le réseau du boîtier peut être un réseau dédié :
  vérifie que le PC y a une carte réseau et que le pare-feu laisse passer UDP 6454.

> À vérifier sur le banc : les deux chemins, sur du vrai matériel (tests D et A du banc).

## 5. Vérifications finales

À faire avant de rouvrir au public.

- [ ] Chaque buzzer de chaque pupitre déclenche le bon pupitre à l'écran (onglet « Buzzers »,
      « Test des buzzers »).
- [ ] Chaque appareil lumineux réagit (« Tester une scène », « Identifier »).
- [ ] Les lyres visent bien chaque pupitre.
- [ ] La fumée **ne part pas toute seule** à la mise sous tension.
- [ ] L'arrêt d'urgence physique coupe la fumée.
- [ ] Le relais temporisé coupe la fumée au bout de 10 secondes maximum.
- [ ] Une partie complète se termine, et les résultats apparaissent au backoffice.
- [ ] Le son sort des enceintes.
- [ ] Le PC redémarre et retrouve « Prêt à jouer ».

## 6. Retour arrière

Tant que tu as gardé le matériel et les réglages d'origine, tu peux revenir en arrière :

1. Ferme l'écran de salle QuizzUp.
2. Rebranche l'**interface DMX d'origine** (ou remets le câblage tel que sur tes photos).
3. Rétablis la fumée **comme elle était, avec ses sécurités d'origine**. Si le dispositif d'origine
   était une minuterie autonome, c'est ton choix : relis ses risques avant de le rebrancher.
4. Relance l'ancien logiciel et son utilitaire de conversion.

Dans QuizzUp, rien n'est détruit : tu peux désactiver la salle (« Désactiver la salle ») ou supprimer
son compte (« Supprimer le compte de salle »), et recommencer plus tard.

Garde l'ancien matériel et les anciens fichiers pendant **au moins une semaine** de fonctionnement.

## 7. Ce qui n'existe pas dans QuizzUp

À connaître avant de migrer, si tu les utilises aujourd'hui :

- **Inscription des joueurs par QR code** depuis un téléphone : **à venir**. Aujourd'hui, le personnel
  inscrit les joueurs au backoffice.
- **Pilotage de la salle à distance** depuis le backoffice : **à venir**.
- **Sessions programmées** à l'avance : **à venir**.
- **Feuille de résultats imprimable** : non disponible.
- **Délai de sortie** (lumières maintenues quelques minutes après la fin pour faire sortir les
  joueurs) : pas de réglage dédié aujourd'hui.
- **Importation de questions** depuis un autre système : non disponible.
- **Fonctionnement sans internet au rechargement de la page** : une partie en cours continue sans
  internet, mais une page rechargée sans internet reste blanche.

Si l'une de ces fonctions est indispensable à ton exploitation, **attends** de l'avoir avant de migrer.
