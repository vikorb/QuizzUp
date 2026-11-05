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
- Une session Windows dédiée à la salle, ouverte avec le compte qui lancera le kit (le raccourci
  et la tâche du pont sont créés pour **ce** compte).
- Facultatif : `C:\QuizzUp\quizzup-artnet-bridge.exe` (pont Art-Net, uniquement si les lumières
  passent par un nœud Art-Net ; inutile avec une interface USB-DMX).

## Lancement

PowerShell **64 bits** ouvert **en administrateur**, dans ce dossier :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\installer-poste.ps1 -RoomUrl https://salle.exemple.fr
# avec un nœud Art-Net :
.\installer-poste.ps1 -RoomUrl https://salle.exemple.fr -BridgeTarget 192.168.1.50
```

Options : `-ActiveHoursStart 9 -ActiveHoursEnd 3` (heures actives de Windows Update, 18 h max).
Pour changer d'adresse de salle, relancer avec la nouvelle `-RoomUrl`. Retour arrière :
`.\desinstaller-poste.ps1`.

Le script :

1. remplace le marqueur `https://salle.exemple.fr` de `politiques-chrome.reg` par l'origine de
   `-RoomUrl` (schéma + hôte + port) et importe le résultat dans
   `HKLM\SOFTWARE\Policies\Google\Chrome` ;
2. crée `QuizzUp - Ecran de salle.lnk` dans le dossier Démarrage : `chrome.exe --kiosk
--app=<RoomUrl>` avec un profil dédié `C:\QuizzUp\chrome-profile` et les drapeaux de repli
   ci-dessous ;
3. sur secteur : veille, écran éteint, veille prolongée et arrêt des disques à « jamais », mise
   en veille sélective USB désactivée ;
4. règle les heures actives de Windows Update
   (`HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`, valables sur Home) ;
5. crée la tâche planifiée `QuizzUp - Pont Art-Net` à l'ouverture de session :
   `C:\QuizzUp\quizzup-artnet-bridge.exe --origin <origine> [--target <BridgeTarget>]`, relancée
   chaque minute en cas d'échec. Exécutable absent : avertissement, la tâche est quand même créée.

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
   l'autorisation (profil `C:\QuizzUp\chrome-profile`) : la reconnexion est ensuite automatique.
   Nécessaire seulement si la politique `SerialAllowUsbDevicesForUrls` n'a pas été prise en compte.
2. **Réseau local / pont `ws://127.0.0.1`** : si Chrome affiche une demande d'accès au réseau
   local ou à cet appareil, l'**autoriser** une fois. À faire avant la première vraie partie.
3. **Ouverture de session automatique** : le raccourci démarre avec la session. Pour que le PC
   démarre seul jusqu'à la salle, configurer l'ouverture automatique (`netplwiz`, ou Autologon de
   Sysinternals) et désactiver l'écran de verrouillage.
4. **Windows Update** : dans Paramètres, choisir les heures d'activité en **mode manuel**
   (le mode automatique peut les modifier).
5. **BIOS / UEFI** : « Restore on AC Power Loss » (ou équivalent) sur _Power On_, pour que le PC
   redémarre après une coupure de courant.
6. **Pont Art-Net** (si utilisé) : copier `quizzup-artnet-bridge.exe` dans `C:\QuizzUp\`.

## Avertissement SmartScreen

`quizzup-artnet-bridge.exe` n'est **pas signé** : au premier lancement (ou à la copie depuis un
téléchargement) Windows SmartScreen affiche « Windows a protégé votre ordinateur ». Cliquer sur
**Informations complémentaires** puis **Exécuter quand même**. Lancer l'exécutable une fois à la
main avec ce compte avant la tâche planifiée, sinon la tâche reste bloquée sur cet écran.

## Vérifier

1. `chrome://policy` dans un Chrome du poste : **Recharger les règles** ; les politiques du
   tableau doivent apparaître. Une règle « sensible » ignorée est affichée avec un avertissement
   (attendu pour `RestoreOnStartup` sur Home).
2. **Redémarrer** le PC. Attendu : ouverture de session, puis l'écran de salle en plein écran
   (sans barre d'adresse), sans popup ni bulle « Restaurer les pages ».
3. Écran **Matériel** : l'interface DMX est reconnectée seule, le test de lumières fonctionne.
4. Lancer un extrait audio de test : il démarre sans clic préalable.
5. Pont Art-Net : le Gestionnaire des tâches montre `quizzup-artnet-bridge.exe` après
   l'ouverture de session (ou `Get-ScheduledTask 'QuizzUp - Pont Art-Net' | Get-ScheduledTaskInfo`).
6. Laisser le PC inactif au-delà de 30 minutes : l'écran reste allumé.

Un test automatique (`game/hardware/tests/posteSalle.test.ts`) vérifie que le `.reg` est bien
formé, que ses identifiants USB suivent `DMX_USB_VENDOR_IDS` et que les scripts respectent le
contrat avec le pont. Il ne remplace pas la validation sur un vrai poste.
