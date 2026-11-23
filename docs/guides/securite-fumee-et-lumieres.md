# Sécurité : fumée et lumières

Ce guide s'adresse au **gérant**, au **responsable de site** et au **technicien**. Il dit ce que le
logiciel QuizzUp garantit, ce qu'il ne garantit **pas**, et ce que tu dois contrôler toi-même avant
chaque ouverture.

> **Lis ce guide avant de brancher une machine à fumée.**
>
> **Honnêteté d'abord.** Les garanties logicielles décrites ici sont lues dans le code
> (`game/hardware`) et couvertes par des tests automatiques. **Elles n'ont jamais été vérifiées sur du
> vrai matériel** (machine à fumée, relais, interface DMX). Chaque point à confirmer est marqué
> `> À vérifier sur le banc :`. Les essais prévus sont décrits dans
> [`docs/recette/banc-materiel.md`](../recette/banc-materiel.md) (tests F pour la fumée).

## En une phrase

**Le logiciel limite le risque ; il ne le supprime pas.** La sécurité de la salle repose d'abord sur
des dispositifs **physiques** (arrêt d'urgence, relais temporisé, ventilation, détection incendie),
installés et contrôlés par des personnes compétentes.

## 1. Ce que le logiciel garantit

### 1.1 La fumée est désactivée par défaut

Une salle neuve n'utilise pas la fumée. Pour l'activer, il faut passer par l'étape « Sécuriser la
fumée » de l'assistant d'installation (voir [`installation-salle.md`](installation-salle.md),
étape 7). Cette étape n'apparaît que si une machine à fumée est déclarée.

### 1.2 Des limites que tu ne peux pas dépasser

| Réglage                         | Valeur par défaut | Limite imposée par le logiciel                      |
| ------------------------------- | ----------------- | --------------------------------------------------- |
| Durée maximale d'une émission   | 3 secondes        | De 0,2 seconde à **10 secondes**                    |
| Pause entre deux émissions      | 30 secondes       | De **5 secondes** à 10 minutes                      |
| Niveau maximal envoyé au relais | 255 (plein)       | Modifiable seulement dans « Configuration avancée » |

Quoi que tu saisisses dans l'assistant, le logiciel **ramène** la valeur dans ces bornes. Une émission
plus longue que la durée maximale est coupée.

Dans le jeu, la fumée ne part qu'à la scène « Victoire » de fin de partie, pendant 3 secondes, et
seulement si elle est armée.

### 1.3 Un humain arme la fumée, à chaque session

Même une fois configurée, la fumée **ne part pas** tant qu'une personne n'a pas coché « Fumée
autorisée pour cette session » dans Matériel, onglet « Lumières et fumée ». Le logiciel ne le fait
jamais à ta place. Après « Rallumer les lumières », la fumée **reste désarmée**.

### 1.4 Quatre vérifications humaines obligatoires

L'assistant enregistre la fumée **désactivée** tant que tu n'as pas confirmé, case par case
(« Vérifications obligatoires ») :

1. un **arrêt d'urgence physique** existe et a été essayé ;
2. un **relais temporisé** de **10 secondes maximum** coupe la fumée même si le PC plante ;
3. le **test de coupure** a réussi (« Lancer le plantage simulé », réponse « Elle s’est arrêtée ») ;
4. la **détection incendie** et les **consignes du site** ont été vérifiées avec le responsable.

La troisième case se coche automatiquement quand le test réussit. Si la fumée ne s'arrête pas pendant le
test, clique sur « La fumée ne s’arrête pas : tout couper » et coupe la machine à la main.

Une machine **sans relais temporisé** : la fumée reste désactivée, sauf si tu coches « Je confirme que
la machine coupe toute seule sur perte de signal DMX (vérifié dans la notice et par le test de
plantage simulé). » **et** que tu as réussi le test guidé de vraie perte de signal (« Lancer le test de
perte de signal »), où tu débranches toi-même le câble DMX.

### 1.5 Des gardes automatiques

Le logiciel **coupe la fumée** dans ces cas :

| Situation                                                                             | Ce qui se passe                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| La page se fige plus d'une demi-seconde                                               | Fumée coupée (« La page a gelé : fumée coupée par sécurité. ») |
| La fenêtre est masquée (autre fenêtre devant, écran éteint)                           | Fumée coupée, aucune nouvelle émission (« Onglet masqué : … ») |
| L'interface DMX ne répond plus, ou une écriture reste bloquée plus d'une demi-seconde | Fumée coupée (« L’interface DMX ne répond plus. »)             |
| Le pont Art-Net n'est plus joignable                                                  | Lumières simulées, fumée coupée                                |
| L'arrêt d'urgence est actif                                                           | Lumières éteintes, fumée verrouillée                           |

L'envoi se fait en continu (environ 30 fois par seconde) : une rupture est vue en une fraction de
seconde.

### 1.6 L'arrêt d'urgence à l'écran

Le bouton « Arrêt d'urgence » éteint les lumières et **verrouille la fumée**. Le verrou est **retenu** :
il survit au rechargement de la page et au redémarrage du PC. Seul « Rallumer les lumières » (avec la
confirmation « Vérifie d’abord que la salle est sûre. La fumée restera désarmée. ») l'efface.

L'écran rappelle : « Le bouton logiciel ne remplace pas l’arrêt d’urgence physique, obligatoire en
salle. »

### 1.7 Le test de coupure du diagnostic

Dans Matériel, onglet « Diagnostic », un test de coupure de la fumée est proposé, avec double
confirmation (« Lancer le test »). Le gel de la sortie pendant ce test est limité à **15 secondes**. Le
diagnostic s'arrête seul après 10 minutes sans action. La durée de maintien du pont Art-Net est elle
aussi plafonnée à 15 secondes.

> À vérifier sur le banc : tout le chapitre 1, avec une vraie machine et de vrais relais (tests F du
> banc). Les valeurs ci-dessus sont celles du code ; la machine réelle peut réagir autrement
> (temps de chauffe, fuite résiduelle après la coupure du relais).

### 1.8 Les scènes lumineuses livrées

Les scènes de jeu fournies avec QuizzUp ne commandent pas le stroboscope : sa valeur est à zéro. Elles
modulent la couleur et l'intensité.

> À vérifier sur le banc : **cette absence de stroboscope n'est pas une garantie.** Un appareil dont le
> canal stroboscope est mal cartographié, ou un canal qui ferme le faisceau à zéro, peut se comporter
> autrement. Contrôle visuel obligatoire sur chaque appareil. Aucune limite de fréquence de clignotement
> n'est documentée à ce jour.

## 2. Ce que le logiciel ne garantit pas

Le logiciel **ne remplace pas**, et ne peut pas remplacer :

| Ce que QuizzUp ne garantit pas            | Ce qui en répond                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| **L'installation électrique** de la salle | Un électricien qualifié : protections, câbles, mises à la terre, alimentation des relais.     |
| **La détection incendie** et les alarmes  | Le système du site. La fumée de scène peut **déclencher** une détection : à étudier.          |
| **La ventilation** et le désenfumage      | Le responsable du site. Prévois l'aération entre deux sessions.                               |
| **La coupure matérielle de la fumée**     | L'**arrêt d'urgence physique** et le **relais temporisé**. Sans eux, la fumée n'est pas sûre. |
| **Le comportement d'une machine à fumée** | La notice de la machine : liquide homologué, temps de chauffe, quantité maximale.             |
| **Les personnes sensibles**               | Toi. Voir ci-dessous.                                                                         |
| **L'évacuation du public**                | Les consignes du site, l'éclairage de secours, les issues dégagées.                           |
| **Un plantage complet du PC**             | Le relais temporisé. Voir ci-dessous.                                                         |

### 2.1 Pourquoi le relais temporisé est obligatoire

Une interface DMX USB, ou le pont Art-Net, **répète la dernière image reçue** si le PC plante. Si le
PC se fige pendant une émission de fumée, **le logiciel ne peut plus rien faire**, et le relais reste
fermé. Seul un **relais temporisé** réglé à **10 secondes maximum**, monté en série, coupe alors la
fumée. L'arrêt d'urgence physique agit même PC éteint.

### 2.2 Personnes sensibles

Le logiciel ne connaît pas ton public. Avant toute session, pense aux personnes :

- sensibles aux **lumières clignotantes** (épilepsie photosensible), aux **changements brusques** ou
  aux **lumières intenses** ;
- sensibles à la **fumée de scène** (asthme, allergies, femmes enceintes, jeunes enfants) ;
- à **mobilité réduite**, malvoyantes ou malentendantes, pour qui un changement soudain de lumière ou
  de son peut être dangereux.

Prévois d'**informer** les joueurs à l'entrée (affichage, annonce), de leur proposer une session **sans
fumée**, et de pouvoir **couper** la fumée ou les lumières à tout moment. Les règles applicables à ton
public relèvent de **ta responsabilité** et de la réglementation qui s'applique à ton site.

## 3. Contrôle avant chaque ouverture

À faire **chaque jour**, par une personne formée, **avant** d'accueillir du public. Coche chaque ligne.

### Le matériel

- [ ] La salle est ventilée et les issues sont dégagées.
- [ ] La machine à fumée est branchée, le liquide est au niveau, la machine a chauffé.
- [ ] Aucune fuite ni dépôt de liquide au sol (risque de glissade).
- [ ] L'**arrêt d'urgence physique** fonctionne : appuie dessus, vérifie que la machine s'arrête.
- [ ] Le **relais temporisé** est en place, réglé à **10 secondes maximum** (contrôle visuel du
      réglage).
- [ ] Aucune **minuterie autonome** n'envoie de fumée en dehors du jeu.
- [ ] La détection incendie est opérationnelle et non masquée.

### Le logiciel

- [ ] L'écran de salle est ouvert, en plein écran, au premier plan (pas de fenêtre cachée).
- [ ] Dans Matériel, onglet « Lumières et fumée » : l'interface est « connectée » (et non en
      simulation), et aucun avertissement n'est affiché.
- [ ] L'**arrêt d'urgence logiciel n'est pas actif**. S'il l'est, vérifie la salle puis « Rallumer les
      lumières ».
- [ ] Un test court de lumières (« Tester une scène » sur un pupitre) donne le résultat attendu.
- [ ] Si tu veux de la fumée : coche « Fumée autorisée pour cette session » **seulement** si tous les
      points du matériel sont validés, puis fais un essai court (« Tester 2 s ») **hors public**.
- [ ] Si tu ne veux **pas** de fumée ce jour-là : laisse la case décochée.

### À la fermeture

- [ ] Coupe la machine à fumée à l'interrupteur d'alimentation.
- [ ] Laisse la salle s'aérer.
- [ ] Note toute anomalie vue dans la journée (carnet de salle).

## 4. En cas d'incident

1. **Arrêt d'urgence physique** : appuie dessus.
2. Fais évacuer ou éloigne le public si nécessaire.
3. Ventile. Ne rallume rien tant que la cause n'est pas comprise.
4. En cas de malaise ou de danger : appelle les **secours**, puis le responsable du site.
5. Une fois la situation maîtrisée : [`depannage.md`](depannage.md), puis préviens l'éditeur.

## 5. À retenir

- La fumée est **désactivée par défaut** et **armée à la main** à chaque session.
- Elle est **plafonnée** (10 secondes, 5 secondes de pause au minimum) et **coupée** si la page gèle, si
  la fenêtre est masquée ou si l'interface ne répond plus.
- **Tout cela ne vaut rien sans l'arrêt d'urgence physique et le relais temporisé.**
- Le logiciel n'a **jamais été testé sur du vrai matériel** : fais ton propre essai, hors public.
