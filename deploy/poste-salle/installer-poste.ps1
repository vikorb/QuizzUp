#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installe le poste de salle QuizzUp (Windows 10/11 Pro ou Home, Chrome).

.DESCRIPTION
  Idempotent : peut etre relance sans risque (par exemple pour changer l'adresse de la salle).
  1. importe les politiques Chrome (politiques-chrome.reg, origine remplacee) ;
  2. cree le raccourci Chrome kiosque dans le dossier Demarrage de l'utilisateur de la salle ;
  3. desactive la veille, l'ecran eteint et la mise en veille selective USB (sur secteur) ;
  4. regle les heures actives de Windows Update ;
  5. verrouille les droits de C:\QuizzUp, ouvre UDP 6454 au pare-feu pour le pont Art-Net et
     cree la tache planifiee SYSTEM qui le lance au demarrage de la machine (sans fenetre).
  Fichier volontairement en ASCII (PowerShell 5.1 lit mal l'UTF-8 sans BOM).

.PARAMETER RoomUrl
  Adresse de l'ecran de salle, ex. https://salle.exemple.fr (l'origine en est deduite).

.PARAMETER BridgeTarget
  Adresse du noeud Art-Net (option --target du pont). Facultatif.

.PARAMETER RoomUser
  Compte Windows de la salle (DOMAINE\utilisateur ou PC\utilisateur) qui recoit le raccourci
  et le profil Chrome. Defaut : l'utilisateur de la session ouverte, sinon le compte courant.

.PARAMETER ActiveHoursStart
  Debut des heures actives de Windows Update (0-23). Defaut 9.

.PARAMETER ActiveHoursEnd
  Fin des heures actives (0-23). Plage de 18 h maximum. Defaut 3.

.EXAMPLE
  .\installer-poste.ps1 -RoomUrl https://salle.exemple.fr -BridgeTarget 192.168.1.50
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RoomUrl,
  [string]$BridgeTarget,
  [string]$RoomUser,
  [ValidateRange(0, 23)][int]$ActiveHoursStart = 9,
  [ValidateRange(0, 23)][int]$ActiveHoursEnd = 3
)

$ErrorActionPreference = 'Stop'

# Contrat avec le pont Art-Net (lot L11) : chemin et options ne changent pas sans accord.
$BridgeDir = 'C:\QuizzUp'
$BridgeExe = 'C:\QuizzUp\quizzup-artnet-bridge.exe'
$ArtNetPort = 6454
$TaskName = 'QuizzUp - Pont Art-Net'
$FirewallRuleName = 'QuizzUp - Pont Art-Net (UDP 6454)'
$ShortcutName = 'QuizzUp - Ecran de salle.lnk'
# Marqueur de politiques-chrome.reg, remplace par l'origine reelle.
$OriginPlaceholder = 'https://salle.exemple.fr'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# Compte de la salle : Startup et LOCALAPPDATA de CE compte, meme si un autre admin eleve le script.
function Resolve-RoomAccount([string]$Requested) {
  $elevated = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $name = $Requested
  if (-not $name) {
    $session = (Get-CimInstance Win32_ComputerSystem).UserName
    $name = if ($session) { $session } else { $elevated }
  }
  try {
    $sid = (New-Object Security.Principal.NTAccount($name)).Translate([Security.Principal.SecurityIdentifier]).Value
  }
  catch {
    throw "Compte Windows introuvable : '$name' (utilisez -RoomUser DOMAINE\utilisateur)."
  }
  $profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid"
  $profilePath = (Get-ItemProperty -LiteralPath $profileKey -ErrorAction SilentlyContinue).ProfileImagePath
  if ($profilePath) { $profilePath = [Environment]::ExpandEnvironmentVariables($profilePath) }
  if (-not $profilePath -or -not (Test-Path -LiteralPath $profilePath)) {
    throw "Profil Windows de '$name' introuvable : ce compte doit avoir ouvert une session au moins une fois (ou precisez -RoomUser)."
  }
  if ($name -ieq $elevated) {
    $startup = [Environment]::GetFolderPath('Startup')
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  }
  else {
    Write-Host "Compte de la salle : $name (le script est eleve par $elevated)." -ForegroundColor Yellow
    $startup = Join-Path $profilePath 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup'
    $localAppData = Join-Path $profilePath 'AppData\Local'
  }
  [pscustomobject]@{ Name = $name; Startup = $startup; LocalAppData = $localAppData }
}

if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  throw 'Lancez PowerShell 64 bits (pas la version x86).'
}

# --- Parametres -------------------------------------------------------------------------------
$uri = $null
if (-not [Uri]::TryCreate($RoomUrl, [UriKind]::Absolute, [ref]$uri) -or
    $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo) {
  throw "RoomUrl invalide : '$RoomUrl' (attendu : https://salle.exemple.fr)."
}
$origin = $uri.GetLeftPart([UriPartial]::Authority)

if ($BridgeTarget -and $BridgeTarget -notmatch '^[A-Za-z0-9.\-:\[\]]+$') {
  throw "BridgeTarget invalide : '$BridgeTarget' (adresse IP ou nom d'hote attendu)."
}

$activeSpan = ($ActiveHoursEnd - $ActiveHoursStart + 24) % 24
if ($activeSpan -lt 1 -or $activeSpan -gt 18) {
  throw 'Les heures actives de Windows Update doivent couvrir de 1 a 18 heures.'
}

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome est introuvable : installez-le puis relancez ce script.' }

$room = Resolve-RoomAccount $RoomUser
$profileDir = Join-Path $room.LocalAppData 'QuizzUp\chrome-profile'

# --- 1. Politiques Chrome ---------------------------------------------------------------------
Write-Step "Politiques Chrome pour l'origine $origin"
$template = Join-Path $PSScriptRoot 'politiques-chrome.reg'
$regText = (Get-Content -LiteralPath $template -Raw).Replace($OriginPlaceholder, $origin)
$regText = $regText -replace "\r?\n", "`r`n"
$tmpReg = Join-Path ([IO.Path]::GetTempPath()) 'quizzup-politiques-chrome.reg'
Set-Content -LiteralPath $tmpReg -Value $regText -Encoding Unicode
try {
  # Via cmd : evite qu'un message sur stderr devienne une erreur terminante (PowerShell ISE).
  & cmd.exe /c "reg.exe import `"$tmpReg`" /reg:64 >nul 2>nul"
  if ($LASTEXITCODE -ne 0) { throw "Import des politiques Chrome en echec (reg.exe code $LASTEXITCODE)." }
}
finally {
  Remove-Item -LiteralPath $tmpReg -Force -ErrorAction SilentlyContinue
}

# --- 2. Raccourci kiosque dans le dossier Demarrage ------------------------------------------
Write-Step "Raccourci Chrome kiosque (Demarrage de $($room.Name))"
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
New-Item -ItemType Directory -Path $room.Startup -Force | Out-Null
# Les drapeaux doublent les politiques que Chrome ignore sur un Windows non gere (Home).
$chromeArgs = @(
  '--kiosk',
  "--app=$($uri.AbsoluteUri)",
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-session-crashed-bubble',
  '--hide-crash-restore-bubble',
  '--noerrdialogs',
  '--disable-infobars',
  '--disable-notifications',
  '--disable-features=Translate'
)
$shortcutPath = Join-Path $room.Startup $ShortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $chrome
$shortcut.Arguments = $chromeArgs -join ' '
$shortcut.WorkingDirectory = Split-Path -Parent $chrome
$shortcut.Description = 'Ecran de salle QuizzUp'
$shortcut.Save()

# --- 3. Energie (sur secteur) -----------------------------------------------------------------
Write-Step 'Energie : pas de veille, ecran toujours allume, pas de veille selective USB'
function Invoke-PowerCfg {
  & powercfg.exe @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "powercfg $args en echec (code $LASTEXITCODE)." }
}
foreach ($setting in 'standby-timeout-ac', 'monitor-timeout-ac', 'hibernate-timeout-ac', 'disk-timeout-ac') {
  Invoke-PowerCfg /change $setting 0
}
# Sous-groupe USB / "USB selective suspend setting" = 0 (desactive).
Invoke-PowerCfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
Invoke-PowerCfg /setactive SCHEME_CURRENT

# --- 4. Heures actives de Windows Update (cles valables sur Home) ----------------------------
Write-Step "Windows Update : heures actives ${ActiveHoursStart}h - ${ActiveHoursEnd}h"
$wuKey = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
if (-not (Test-Path -LiteralPath $wuKey)) { New-Item -Path $wuKey -Force | Out-Null }
Set-ItemProperty -LiteralPath $wuKey -Name ActiveHoursStart -Value $ActiveHoursStart -Type DWord
Set-ItemProperty -LiteralPath $wuKey -Name ActiveHoursEnd -Value $ActiveHoursEnd -Type DWord
Set-ItemProperty -LiteralPath $wuKey -Name SmartActiveHoursState -Value 0 -Type DWord

# --- 5. Pont Art-Net : droits, pare-feu, tache SYSTEM -----------------------------------------
# Le pont tourne en SYSTEM : un utilisateur qui pourrait remplacer l'exe obtiendrait SYSTEM.
# SID : S-1-5-32-544 Administrateurs, S-1-5-18 SYSTEM, S-1-5-32-545 Utilisateurs (lecture seule).
Write-Step "Droits de $BridgeDir (Administrateurs et SYSTEM : controle total ; Utilisateurs : lecture)"
New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null
& icacls.exe $BridgeDir /setowner '*S-1-5-32-544' /T /C | Out-Null
& icacls.exe $BridgeDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls en echec sur $BridgeDir (code $LASTEXITCODE)." }

Write-Step "Pare-feu : UDP $ArtNetPort entrant pour le pont (profils Prive et Domaine)"
Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $FirewallRuleName -Program $BridgeExe -Direction Inbound -Protocol UDP `
  -LocalPort $ArtNetPort -Profile Private, Domain -Action Allow | Out-Null

Write-Step 'Tache planifiee du pont Art-Net (SYSTEM, au demarrage de la machine)'
$bridgeArgs = "--origin $origin"
if ($BridgeTarget) { $bridgeArgs += " --target $BridgeTarget" }
$taskAction = New-ScheduledTaskAction -Execute $BridgeExe -Argument $bridgeArgs -WorkingDirectory $BridgeDir
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
# Repetition chaque minute, sans fin : relance le pont s'il meurt en cours de route
# (MultipleInstances IgnoreNew : rien ne se passe tant qu'il tourne). -AtStartup n'accepte pas
# -RepetitionInterval, on copie donc la repetition d'un declencheur ponctuel.
$taskTrigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)).Repetition
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger `
  -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null

if (Test-Path -LiteralPath $BridgeExe) {
  Unblock-File -LiteralPath $BridgeExe
}
else {
  Write-Warning "Pont Art-Net absent : $BridgeExe. La tache est creee ; copiez l'executable a cet emplacement EN ADMINISTRATEUR puis relancez ce script (inutile avec une interface USB-DMX)."
}

Write-Host ''
Write-Host "Poste installe pour $origin (compte de la salle : $($room.Name))." -ForegroundColor Green
Write-Host "Chrome n'est pas relance par ce script : redemarrez le PC (ou ouvrez le raccourci). Voir 'Verifier' dans README.md." -ForegroundColor Green
Write-Host 'Le reseau du poste doit etre en profil Prive (regle pare-feu Art-Net).' -ForegroundColor Yellow
