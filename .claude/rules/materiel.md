---
paths:
  - "game/hardware/**"
  - "game/artnet-bridge/**"
  - "game/room-app/src/hardware/**"
  - "deploy/poste-salle/**"
---

# Matériel de salle (buzzers, DMX, fumée, pont Art-Net)

**Rien n'a encore été validé sur du vrai matériel.** Un test vert en simulation ne prouve pas que ça
marche en salle : écris « à valider sur le banc » dans le rapport et ajoute le cas à
`docs/recette/banc-materiel.md` quand tu touches à un comportement physique.

## Sécurité : non négociable

- **Fumée** : ne retire ni n'assouplis aucun garde-fou (durée plafonnée, pause entre deux jets,
  armement par l'opérateur, arrêt d'urgence, relais temporisé ou test guidé de débranchement). Une
  interface DMX renvoie sans fin la dernière trame : tout code qui émet de la fumée doit prévoir ce
  qui se passe si la page plante au milieu.
- **Arrêt d'urgence** : son état survit à un redémarrage des lumières et de la page.
- **Stroboscope** : fréquence bornée. Pas d'effet clignotant sans limite.
- **Pont Art-Net** : une cible venue de l'écran de salle doit être une adresse IP locale, et la
  salle ne choisit jamais le port (seul `--target`, posé par l'opérateur du PC, y échappe). Ne pas
  élargir.
- Une PR qui touche à ces points le dit en première ligne et demande une relecture explicite.

## Conception

- **Toujours une simulation.** Chaque pilote réel (clavier, manette, USB DMX, Art-Net) a son
  équivalent simulé, utilisé par les tests et par le mode démo.
- **Le réel dérive** : une lyre n'a pas l'ordre de canaux de sa notice, un buzzer rebondit, une
  carte regroupe deux appuis. Laisse le réglage dans la configuration de la salle (`rooms.config` :
  profils, adresses, inversions, butées, calage) plutôt qu'une constante dans le code.
- **Apprendre plutôt que supposer** : l'ordre des entrées d'une carte ou des adresses d'une salle se
  découvre par un parcours guidé (« appuie sur le buzzer violet », « est-ce que ça s'allume ? »),
  il ne se devine pas. Une détection automatique propose, l'opérateur confirme.
- **Format de `rooms.config`** : toute évolution reste lisible par l'ancienne version (champ
  facultatif, valeur par défaut) ; la révision (`config_revision`) protège des écritures croisées.
- **Navigateur** : Chrome et Edge seulement (Web Serial, Gamepad). Horodatage des buzzs par
  `event.timeStamp`, touche physique par `event.code`, jamais `event.key`.
- **Salles d'un concurrent** : on reprend des valeurs d'installation (touches, adresses, canaux),
  jamais leur code, leurs fichiers, leurs contenus ni leurs noms.
- Couverture : 90 / 90 / 85 / 90 pour `game/hardware` et `game/artnet-bridge`.
