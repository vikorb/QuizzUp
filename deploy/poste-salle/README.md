# Kit « poste de salle » Windows

Prépare le PC d'une salle (Windows 10/11 **Pro ou Home**, **Google Chrome** uniquement) pour
qu'au redémarrage il ouvre l'écran de salle QuizzUp en plein écran, avec l'interface DMX
connectée et sans aucun popup. Pas de domaine ni d'Intune requis.

| Fichier                  | Rôle                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `installer-poste.ps1`    | Installe tout (idempotent, à relancer sans risque)                          |
| `desinstaller-poste.ps1` | Défait tout                                                                 |
| `politiques-chrome.reg`  | Modèle des politiques Chrome (l'origine y est un marqueur, voir ci-dessous) |

## Prérequis

- Chrome installé, **récent** (146 ou plus recommandé pour les politiques réseau local).
- Écran de salle servi en **HTTPS** (Web Serial l'exige hors `localhost`), ex. la recette
  `deploy/recette/`.
- Une session Windows dédiée à la salle, **ouverte au moins une fois**. Le raccourci kiosque et
  le profil Chrome sont créés pour ce compte : par défaut l'utilisateur de la session ouverte,
  même si le script est élevé par un autre administrateur ; sinon le forcer avec
  `-RoomUser PC\utilisateur`. Le script s'arrête avec un message si le profil est introuvable.
- Facultatif : `C:\QuizzUp\quizzup-artnet-bridge.exe` (pont Art-Net, uniquement si les lumières
  passent par un nœud Art-Net ; inutile avec une interface USB-DMX), copié **en administrateur**.
- Réseau du poste en profil **Privé** (Paramètres, Réseau et Internet, propriétés de la
  connexion) : la règle de pare-feu du pont n'ouvre le port qu'aux profils Privé et Domaine.

## Lancement

PowerShell **64 bits** ouvert **en administrateur**, dans ce dossier :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\installer-poste.ps1 -RoomUrl https://salle.exemple.fr
# avec un nœud Art-Net :
.\installer-poste.ps1 -RoomUrl https://salle.exemple.fr -BridgeTarget 192.168.1.50
```

Options : `-RoomUser PC\utilisateur` (compte de la salle), `-ActiveHoursStart 9 -ActiveHoursEnd 3`
(heures actives de Windows Update, 18 h max).
Pour changer d'adresse de salle, relancer avec la nouvelle `-RoomUrl`. Retour arrière :
`.\desinstaller-poste.ps1` (même `-RoomUser` si utilisé). **Chrome n'est pas relancé** par le
script, ni fermé par le désinstalleur : redémarrer le PC (ou ouvrir le raccourci) après l'installation,
fermer la fenêtre kiosque (Alt+F4) après la désinstallation.

Le script :

1. remplace le marqueur `https://salle.exemple.fr` de `politiques-chrome.reg` par l'origine de
   `-RoomUrl` (schéma + hôte + port) et importe le résultat dans
   `HKLM\SOFTWARE\Policies\Google\Chrome` ;
2. crée `QuizzUp - Ecran de salle.lnk` dans le dossier Démarrage du compte de la salle :
   `chrome.exe --kiosk --app=<RoomUrl>` avec un profil dédié
   `%LOCALAPPDATA%\QuizzUp\chrome-profile` (de ce compte) et les drapeaux de repli ci-dessous ;
3. sur secteur : veille, écran éteint, veille prolongée et arrêt des disques à « jamais », mise
   en veille sélective USB désactivée ;
4. règle les heures actives de Windows Update
   (`HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`, valables sur Home) ;
5. pont Art-Net (voir « Le pont Art-Net » plus bas) : verrouille les droits de `C:\QuizzUp`,
   ouvre UDP 6454 au pare-feu, crée la tâche planifiée SYSTEM. Exécutable absent : avertissement,
   la tâche et la règle sont quand même créées.

## Le pont Art-Net

Contrat avec le pont (lot L11) : l'exécutable est `C:\QuizzUp\quizzup-artnet-bridge.exe`, lancé
avec `--origin <origine de RoomUrl>` et `--target <BridgeTarget>` si fourni ; son fichier
`--config`, s'il en a un, se lit lui aussi dans `C:\QuizzUp` (lecture seule pour les utilisateurs).

- **Tâche `QuizzUp - Pont Art-Net`** : compte **SYSTEM**, déclencheur « au démarrage de la
  machine » : le pont tourne en session 0, donc **sans fenêtre console** par-dessus le kiosque, et
  avant même l'ouverture de session. Le déclencheur se **répète chaque minute sans fin** avec
  « ne pas lancer de nouvelle instance » : si le processus meurt en cours de route, la minute
  suivante le relance (le réglage de redémarrage sur échec seul ne le ferait pas).
- **Droits de `C:\QuizzUp`** : héritage coupé, Administrateurs et SYSTEM en contrôle total,
  Utilisateurs en lecture et exécution seulement, propriétaire Administrateurs. Indispensable :
  sinon un utilisateur remplaçant l'exe obtiendrait SYSTEM. Copier le pont et sa config **en
  administrateur**, puis relancer le script (il réapplique les droits).
- **Pare-feu** : règle entrante UDP 6454 pour cet exe, profils Privé et Domaine, supprimée puis
  recréée à chaque lancement ; retirée par le désinstalleur.

## Pro et Home : ce qui diffère

Chrome lit les politiques du registre sur tout Windows, mais **ignore** celles qu'il juge
« sensibles » (marquées `sensitive` dans sa définition) quand la machine n'est ni jointe à un
domaine, ni inscrite à un MDM/Intune, ni gérée par Chrome Browser Cloud Management. C'est le cas
d'un Windows Home isolé, et d'un Pro non géré. Sources : définitions des politiques Chromium
(`components/policy/resources/templates/policy_definitions`) et `ShouldFilterSensitivePolicies()`
dans `components/policy/core/common/async_policy_loader.cc` (Windows et macOS : filtrage tant que
l'autorité de gestion n'est pas « de confiance »). Liste officielle :
<https://chromeenterprise.google/policies/>.

| Politique (valeur)                                                           | Depuis Chrome | Appliquée sur Home non géré | Repli                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `SerialAllowUsbDevicesForUrls` (JSON : VID de `DMX_USB_VENDOR_IDS`, origine) | 94            | Oui (non sensible)          | Accorder le port une fois à la main (étape 1 ci-dessous) ; Chrome le mémorise                                                        |
| `AutoplayAllowlist` (origine)                                                | 86            | Oui (non sensible)          | Drapeau `--autoplay-policy=no-user-gesture-required` (toujours présent)                                                              |
| `LocalNetworkAccessAllowedForUrls` (origine)                                 | 139           | Oui (non sensible)          | Accepter une fois la demande « réseau local » (étape 2) ; Chrome la mémorise                                                         |
| `LocalNetworkAllowedForUrls`, `LoopbackNetworkAllowedForUrls`                | 146           | Oui (non sensible)          | idem ; noms inconnus d'un Chrome plus ancien : ignorés sans dommage                                                                  |
| `DefaultNotificationsSetting` = 2, `DefaultPopupsSetting` = 2                | 10            | Oui (non sensible)          | Drapeau `--disable-notifications` ; l'écran de salle n'ouvre pas de popup                                                            |
| `TranslateEnabled` = 0                                                       | 12            | Oui (non sensible)          | Drapeau `--disable-features=Translate`                                                                                               |
| `RestoreOnStartup` = 5 (page vide, pas de restauration)                      | 8             | **Non : sensible, ignorée** | Mode `--kiosk --app=` (l'adresse vient du raccourci) + `--disable-session-crashed-bubble --hide-crash-restore-bubble --noerrdialogs` |

« Non sensible » s'appuie sur l'absence du marqueur `sensitive: true` dans la définition de la
politique, lue dans le dépôt Chromium (hors ligne : à confirmer dans `chrome://policy`, voir plus
bas). Le raccourci utilise les drapeaux dans tous les cas : sur un poste Pro géré ils
doublent simplement les politiques.

L'énergie (`powercfg`), le raccourci et la tâche planifiée ne dépendent pas de Chrome : mêmes
commandes sur Pro et Home. Seule la stratégie de groupe `SetActiveHours` est réservée à Pro ; le
kit utilise les clés `UX\Settings`, valables partout.

Rien de ce kit ne requiert Edge, un domaine ou Intune.

## Étapes manuelles (une seule fois par poste)

1. **Interface DMX** : au premier lancement, ouvrir l'écran **Matériel** de la salle, onglet
   Lumières, bouton de connexion de l'interface USB-DMX, choisir le port. Chrome mémorise
   l'autorisation (profil `%LOCALAPPDATA%\QuizzUp\chrome-profile`) : la reconnexion est ensuite automatique.
   Nécessaire seulement si la politique `SerialAllowUsbDevicesForUrls` n'a pas été prise en compte.
2. **Réseau local / pont `ws://127.0.0.1`** : si Chrome affiche une demande d'accès au réseau
   local ou à cet appareil, l'**autoriser** une fois. À faire avant la première vraie partie.
3. **Ouverture de session automatique** : le raccourci démarre avec la session. Pour que le PC
   démarre seul jusqu'à la salle, configurer l'ouverture automatique (`netplwiz`, ou Autologon de
   Sysinternals) et désactiver l'écran de verrouillage.
4. **Windows Update** : dans Paramètres, choisir les heures d'activité en **mode manuel**
   (le mode automatique peut les modifier ; le script écrit déjà `SmartActiveHoursState=0`, à
   confirmer sur le poste).
5. **BIOS / UEFI** : « Restore on AC Power Loss » (ou équivalent) sur _Power On_, pour que le PC
   redémarre après une coupure de courant.
6. **Pont Art-Net** (si utilisé) : copier `quizzup-artnet-bridge.exe` dans `C:\QuizzUp\` en
   administrateur, relancer `installer-poste.ps1` (droits, déblocage du fichier).
7. **Réseau en profil Privé** (voir Prérequis).

## Exécutable non signé : SmartScreen et Smart App Control

`quizzup-artnet-bridge.exe` n'est **pas signé**.

- **SmartScreen** (« Windows a protégé votre ordinateur ») n'apparaît que si on lance l'exe à la
  main (double-clic) : cliquer sur **Informations complémentaires** puis **Exécuter quand même**.
  Il ne concerne **pas** la tâche planifiée SYSTEM, sans interface ; le script retire en plus la
  marque « fichier téléchargé » (`Unblock-File`).
- **Smart App Control** (Windows 11 neuf, installation propre) **bloque en silence** les
  exécutables non signés, y compris depuis une tâche : le pont ne démarre pas. Vérifier : Sécurité
  Windows, Contrôle des applications et du navigateur, Paramètres de Smart App Control (état
  _Activé_ ou _Évaluation_ = bloquant), ou le journal Observateur d'événements, Applications et
  services, Microsoft, Windows, CodeIntegrity, Operational (événements 3076/3077). Pour l'autoriser :
  passer Smart App Control sur **Désactivé** (irréversible sans réinitialiser Windows). Sans
  Smart App Control (Windows 10, ou Windows 11 mis à jour avec option désactivée), rien à faire.

## Vérifier

1. `chrome://policy` dans un Chrome du poste : **Recharger les règles** ; les politiques du
   tableau doivent apparaître. Une règle « sensible » ignorée est affichée avec un avertissement
   (attendu pour `RestoreOnStartup` sur Home).
2. **Redémarrer** le PC. Attendu : ouverture de session, puis l'écran de salle en plein écran
   (sans barre d'adresse), sans popup ni bulle « Restaurer les pages ».
3. Écran **Matériel** : l'interface DMX est reconnectée seule, le test de lumières fonctionne.
4. Lancer un extrait audio de test : il démarre sans clic préalable.
5. Pont Art-Net : le Gestionnaire des tâches (onglet Détails, utilisateur SYSTEM) montre
   `quizzup-artnet-bridge.exe` dès le démarrage, sans fenêtre (ou
   `Get-ScheduledTask 'QuizzUp - Pont Art-Net' | Get-ScheduledTaskInfo`). Le tuer : il revient en
   moins d'une minute.
6. Laisser le PC inactif au-delà de 30 minutes : l'écran reste allumé.

Un test automatique (`game/hardware/tests/posteSalle.test.ts`) vérifie que le `.reg` est bien
formé, que ses identifiants USB suivent `DMX_USB_VENDOR_IDS` et que les scripts respectent le
contrat avec le pont. Il ne remplace pas la validation sur un vrai poste.
