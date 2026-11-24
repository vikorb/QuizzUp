# Programme de la carte fumée (Uno R3)

**Sécurité : fumée.** Ce programme décide seul si la broche A0 de la carte, donc le relais de la
machine à fumée, est au niveau haut. Conception : `docs/cadrage/conception-fumee-carte-usb.md`
(issue #215). **Rien n'a été essayé sur une vraie carte** : tout ce qui touche au matériel est à
valider sur le banc (cas F11 à F20 de `docs/recette/banc-materiel.md`).

Le mode d'emploi de l'opérateur (installation, sauvegarde, restauration, dépannage) est dans
`docs/guides/fumee-carte-usb.md`. Le `fumee.hex` de ce dossier est versionné ; la CI le recompile,
le publie en artefact et échoue s'il diffère.

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

- Seule la ligne exacte `F` allume. Toute autre ligne coupe le jet en cours avec la cause `BAD` :
  `FF`, `f`, une ligne vide, une ligne avec `\r` ou un espace, une ligne de plus de 8 octets.
- `H` ne change rien : ni la sortie, ni le bail, ni la cause.
- La cause est la raison de la dernière coupure réelle d'un jet (`LEASE`, `MAX`, `CMD` pour une
  ligne `0`, `BAD` pour une ligne illisible), et `CMD` au démarrage. Un `0` ou une ligne illisible
  reçu hors jet ne la change pas : le `0` que la page envoie après une coupure par plafond ou par
  bail laisse `MAX` ou `LEASE`.
- **La carte démarre en pause.** Après la bannière, la première réponse `S` dit `COOL` pendant 5 s
  (`S 0 COOL CMD`), puis `READY`. La page attend `S … READY` avant d'envoyer un `F` (une ligne `H`
  suffit pour obtenir une réponse). Une bannière qui arrive alors que le lien était établi veut
  dire que la carte a été remise à zéro : la page la traite comme une perte de lien.
- Quand le bail et le plafond sont échus au même instant, la cause est `MAX`.
- Les fins de ligne `\r\n` ne sont pas acceptées : la page envoie `\n` seul.

## Sécurités portées par la carte

A0 n'est au niveau haut que si les trois conditions sont vraies ensemble :

1. le dernier `F` date de moins de 500 ms (bail, `WATCHDOG_STALL_MS`) ;
2. le jet a commencé il y a moins de 10 s (plafond, `SMOKE_HARD_LIMITS.maxDurationMs`) ;
3. au moins 5 s se sont écoulées depuis la fin du jet précédent (pause,
   `SMOKE_HARD_LIMITS.minCooldownMs`), ou depuis le démarrage de la carte.

Et aussi :

- Les durées sont comparées par soustraction non signée de `millis()` : le débordement du compteur
  (49 jours) est sans effet. Ne jamais comparer deux instants entre eux.
- La première instruction de `setup()` met A0 au niveau bas.
- Une remise à zéro (mise sous tension, RESET, ouverture du port, chien de garde) n'efface pas la
  pause : `setup()` appelle `fumee_init(&fumee, millis())`, la carte repart en `COOL` pour 5 s.
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
Les scénarios correspondants sont dans `vecteurs.txt` (« un flot de F commencé pendant la pause »,
« démarrage en pause », « remise à zéro en plein jet »).

**Pourquoi ce verrou.** Il limite une page figée sur `F` (elle renvoie `F` toutes les 100 ms sans
jamais envoyer `0`) à un seul jet : la carte coupe au plafond de 10 s, puis refuse les `F`
suivants, qui forment un flot sans silence. Sans verrou, la même page déclencherait un nouveau jet
de 10 s à chaque fin de pause, sans fin.

Après une coupure par bail, par plafond ou par ligne illisible, la pause de 5 s commence au moment
où la carte constate la coupure (au plus tard au tour de `loop()` suivant). Après une remise à
zéro de la carte (mise sous tension, RESET, ouverture du port, chien de garde), elle commence au
démarrage : la carte ne sait pas quand le dernier jet s'est arrêté, donc elle ne suppose rien.

### Contrat avec la page

La page tient les trois règles suivantes ; la carte ne les vérifie pas à sa place :

1. envoyer `0` à chaque fin de jet (cela lève aussi le verrou) ;
2. n'envoyer `F` que si la dernière réponse `S` dit `READY`, ou `FIRE` pour renouveler le bail ;
3. sinon refuser le jet côté page, sans envoyer de `F`.

La page et la carte ne comptent pas la pause depuis le même instant (la page depuis son ordre
d'arrêt, la carte depuis qu'elle constate la coupure ou qu'elle redémarre). Un `F` envoyé « à
peu près à la fin de la pause » est donc refusé, pose le verrou, et si la page continue d'envoyer,
un jet entier est perdu sans qu'aucun signal ne le dise.

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

1. compile `tests/test_fumee.c` avec `gcc -std=c99 -Wall -Wextra -Werror` et
   `-fsanitize=undefined,address -fno-sanitize-recover=all`, et le lance ;
2. installe `arduino-cli` et le cœur `arduino:avr` à des versions épinglées, compile `fumee.ino`
   pour `arduino:avr:uno` avec `--warnings all` et échoue sur le moindre avertissement venu de ce
   dossier (les avertissements du cœur Arduino ne comptent pas) ;
3. vérifie que le programme tient dans 32 256 octets et publie le `.hex` en artefact
   (`fumee-hex`, fichier `fumee.ino.hex`, sans chargeur) ;
4. si `fumee.hex` est versionné ici, échoue quand il diffère du résultat de la compilation.

## Lancer les tests C en local

Depuis ce dossier, avec gcc :

```bash
gcc -std=c99 -Wall -Wextra -Werror -fsanitize=undefined,address -fno-sanitize-recover=all \
  -o test_fumee tests/test_fumee.c fumee_logic.c
./test_fumee            # lit vecteurs.txt ; ./test_fumee autre.txt pour un autre fichier
```

Sortie attendue : `OK : <n> scenarios, <n> evenements`. Au premier écart, le programme nomme le
scénario et la ligne de `vecteurs.txt` et sort en erreur.
