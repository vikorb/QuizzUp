# Guides d'exploitation QuizzUp

Ces guides s'adressent aux **centres clients** : ceux qui installent une salle, ceux qui la font
tourner au quotidien et ceux qui passent d'un autre système à QuizzUp. Ils sont écrits pour des
personnes qui ne connaissent pas le produit.

> **Statut.** Ces guides sont écrits d'après le code et la documentation du projet. **Rien n'a
> encore été validé sur du vrai matériel.** Chaque point incertain est marqué
> `> À vérifier sur le banc :` ; il sera confirmé ou corrigé après les essais décrits dans
> [`docs/recette/banc-materiel.md`](../recette/banc-materiel.md). Les emplacements de captures
> d'écran (`<!-- capture : … -->`) seront remplis à ce moment-là.

## Sommaire

| Guide                                                                   | Pour qui                                | Pour faire quoi                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Installer une salle](installation-salle.md)                            | Gérant, technicien, prestataire         | Passer de la boîte à la première partie : matériel, compte de salle, connexion du PC, buzzers, lumières, fumée, plein écran.         |
| [Utilisation quotidienne](utilisation-quotidienne.md)                   | Personnel du centre                     | Ouvrir la salle, inscrire les joueurs, lancer et arrêter une partie, enchaîner deux sessions, fermer.                                |
| [Dépannage](depannage.md)                                               | Personnel du centre, technicien         | Trouver la cause d'un symptôme (buzzer muet, pas de son, lumières, fumée, coupure d'internet, écran figé) et le geste à faire.       |
| [Passer une salle déjà équipée à QuizzUp](migration-salle-existante.md) | Gérant, technicien                      | Inventorier le matériel, savoir ce qui est repris tel quel et ce qui se reconfigure, migrer en une demi-journée, revenir en arrière. |
| [Sécurité : fumée et lumières](securite-fumee-et-lumieres.md)           | Gérant, responsable de site, technicien | Savoir ce que le logiciel garantit et ne garantit pas, et faire le contrôle avant chaque ouverture.                                  |

## Par où commencer

- **Tu installes une salle neuve** : [Installer une salle](installation-salle.md). Si elle comporte
  une machine à fumée, lis d'abord [Sécurité : fumée et lumières](securite-fumee-et-lumieres.md).
- **Tu travailles dans une salle déjà installée** : [Utilisation quotidienne](utilisation-quotidienne.md),
  puis [Dépannage](depannage.md) en cas de problème.
- **Tu as déjà une salle équipée d'un autre système** :
  [Passer une salle déjà équipée à QuizzUp](migration-salle-existante.md), puis
  [Installer une salle](installation-salle.md).

## Ce qui n'existe pas encore

Ces fonctions sont prévues, mais **ne sont pas disponibles** et ne sont pas décrites comme telles dans
les guides :

- le pilotage de la salle à distance depuis le backoffice ;
- l'inscription des joueurs par QR code ;
- les sessions programmées à l'avance ;
- la mise en pause d'une partie et « passer une question » (en cours de développement).

## Conventions des guides

- Les noms de boutons, d'onglets et de messages sont donnés **entre guillemets français**, tels qu'ils
  apparaissent à l'écran, jamais par leur position.
- Un bloc `> À vérifier sur le banc :` signale un point que le code ou la documentation ne suffisent pas à
  confirmer.
- Un commentaire `<!-- capture : nom.png — description -->` marque l'endroit d'une capture d'écran à
  ajouter.

## Documents liés

- [Banc d'essai matériel](../recette/banc-materiel.md) : les essais qui valideront ces guides.
- [Guide de test](../recette/guide-de-test.md) : tester l'ensemble en démonstration.
- [Kit d'installation du poste](../../deploy/poste-salle/README.md) : script d'installation du PC de
  la salle.
- [Pont Art-Net](../../game/artnet-bridge/README.md) : relais local vers un boîtier Art-Net.
- [Documentation du matériel](../../game/hardware/README.md) : détail technique des buzzers, du DMX et
  de la sécurité fumée.
