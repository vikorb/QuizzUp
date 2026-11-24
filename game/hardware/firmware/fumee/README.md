# Programme de la carte fumée (Uno R3)

**Sécurité : fumée.** Ce programme décide seul si la broche A0 de la carte, donc le relais de la
machine à fumée, est au niveau haut. Conception : `docs/cadrage/conception-fumee-carte-usb.md`
(issue #215). **Rien n'a été essayé sur une vraie carte** : tout ce qui touche au matériel est à
valider sur le banc (cas F11 à F20 de `docs/recette/banc-materiel.md`).

Ce dossier ne contient pas de mode d'emploi d'installation (lots suivants). Le `.hex` n'est pas
encore versionné : la CI le compile et le publie en artefact.

## Fichiers

| Fichier                | Rôle                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `fumee_logic.h` / `.c` | Toute la décision, en C99 pur (sans Arduino, sans allocation)          |
| `fumee.ino`            | Le minimum autour : broche, port série, chien de garde                 |
| `vecteurs.txt`         | Scénarios partagés avec la fausse carte TypeScript (format en en-tête) |
| `tests/test_fumee.c`   | Déroule `vecteurs.txt` sur la logique, avec gcc                        |

`test_fumee.c` est dans `tests/` et non à côté du `.ino` : `arduino-cli` compile tous les `.c` de
la racine d'un croquis, et ce programme a son propre `main()`.

## Protocole

Texte ASCII, une ligne par message terminée par `\n`, 9600 bauds 8N1.

| Sens         | Message                                               | Sens                                                               |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| carte → page | `QZF READY 1 1.0.0 10000 5000 500`                    | au démarrage : protocole, version, plafond, pause, bail (ms)       |
| page → carte | `F`                                                   | fumée pendant la durée du bail                                     |
| page → carte | `0`                                                   | coupure                                                            |
| page → carte | `H`                                                   | présence, sans effet sur la fumée                                  |
| carte → page | `S <0\|1> <READY\|FIRE\|COOL> <LEASE\|MAX\|CMD\|BAD>` | après chaque ligne reçue : sortie, état, dernière cause de coupure |

- Seule la ligne exacte `F` allume. Toute autre ligne coupe et donne la cause `BAD` : `FF`, `f`,
  une ligne vide, une ligne avec `\r` ou un espace, une ligne de plus de 8 octets.
- `H` ne change rien : ni la sortie, ni le bail, ni la cause.
- La cause vaut `CMD` au démarrage, tant que rien n'a coupé.
- Quand le bail et le plafond sont échus au même instant, la cause est `MAX`.
- Les fins de ligne `\r\n` ne sont pas acceptées : la page envoie `\n` seul.

## Sécurités portées par la carte

A0 n'est au niveau haut que si les trois conditions sont vraies ensemble :

1. le dernier `F` date de moins de 500 ms (bail, `WATCHDOG_STALL_MS`) ;
2. le jet a commencé il y a moins de 10 s (plafond, `SMOKE_HARD_LIMITS.maxDurationMs`) ;
3. au moins 5 s se sont écoulées depuis la fin du jet précédent (pause,
   `SMOKE_HARD_LIMITS.minCooldownMs`).

Et aussi :

- Les durées sont comparées par soustraction non signée de `millis()` : le débordement du compteur
  (49 jours) est sans effet. Ne jamais comparer deux instants entre eux.
- La première instruction du programme met A0 au niveau bas.
- Chien de garde matériel : `wdt_enable(WDTO_250MS)` à la fin de `setup()`, `wdt_reset()` seulement
  au début de `loop()`. Si `loop()` se fige, la carte redémarre et A0 repasse en entrée.
- Au plus une ligne lue par tour de `loop()` : une réponse bloquée par le débit ne retarde jamais
  l'écoulement du temps. Aucun `delay()`.
- Pas de verrou d'urgence dans la carte : l'arrêt d'urgence vit dans la page, le coup-de-poing de
  la salle coupe l'alimentation.

### Un `F` refusé n'allume jamais plus tard

Un `F` reçu pendant la pause (ou après un plafond) est refusé. Si la page continue d'envoyer des
`F` jusqu'après la fin de la pause, **le jet ne part pas** : choix le plus sûr, puisque la demande
d'origine a été refusée et qu'un flot continu ne dit pas si la page veut encore de la fumée.

Le jet repart seulement après un `F` précédé d'un silence d'au moins 500 ms de la page, ou d'une
ligne `0`. Une page qui veut un nouveau jet l'obtient donc en cessant d'envoyer, puis en redemandant.
Le scénario correspondant est dans `vecteurs.txt` (« un flot de F commencé pendant la pause »).

Après une coupure par bail, par plafond ou par ligne illisible, la pause de 5 s commence au moment
où la carte constate la coupure (au plus tard au tour de `loop()` suivant).

Une remise à zéro de la carte (RESET, chien de garde) oublie la pause : le premier `F` qui suit
est accepté. C'est à la page de ne pas redemander avant la fin de sa propre pause.

## Remise à zéro et A0 : à vérifier sur le banc

Après une remise à zéro, les broches sont des entrées en haute impédance et Optiboot ne touche
qu'à la LED et à la liaison série. A0 flotte donc environ une seconde à chaque remise à zéro
(ouverture du port, bouton RESET, chien de garde) et pendant toute une installation.

**À vérifier sur le banc : état de A0 pendant la remise à zéro.** Cela ne tient que si le module
relais reste ouvert quand son entrée est en l'air. À mesurer (A0 sous 0,8 V, relais éteint) avant
tout essai avec la machine branchée. Autre point : le chargeur doit éteindre le chien de garde
après une remise à zéro par celui-ci (c'est le cas d'Optiboot) ; sinon la carte bouclerait.

## Compilation en CI

Le job « Fumée (programme de la carte) » de `.github/workflows/ci.yml` :

1. compile `tests/test_fumee.c` avec `gcc -std=c99 -Wall -Wextra -Werror` et le lance ;
2. installe `arduino-cli` et le cœur `arduino:avr` à des versions épinglées, compile `fumee.ino`
   pour `arduino:avr:uno` avec `--warnings all` et échoue sur le moindre avertissement venu de ce
   dossier (les avertissements du cœur Arduino ne comptent pas) ;
3. vérifie que le programme tient dans 32 256 octets et publie le `.hex` en artefact
   (`fumee-hex`, fichier `fumee.ino.hex`, sans chargeur) ;
4. si `fumee.hex` est versionné ici, échoue quand il diffère du résultat de la compilation.

## Lancer les tests C en local

Depuis ce dossier, avec gcc :

```bash
gcc -std=c99 -Wall -Wextra -Werror -o test_fumee tests/test_fumee.c fumee_logic.c
./test_fumee            # lit vecteurs.txt ; ./test_fumee autre.txt pour un autre fichier
```

Sortie attendue : `OK : <n> scenarios, <n> evenements`. Au premier écart, le programme nomme le
scénario et la ligne de `vecteurs.txt` et sort en erreur.
