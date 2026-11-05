#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installe le poste de salle QuizzUp (Windows 10/11 Pro ou Home, Chrome).

.DESCRIPTION
  Idempotent : peut etre relance sans risque (par exemple pour changer l'adresse de la salle).
  1. importe les politiques Chrome (politiques-chrome.reg, origine remplacee) ;
  2. cree le raccourci Chrome kiosque dans le dossier Demarrage de l'utilisateur courant ;
  3. desactive la veille, l'ecran eteint et la mise en veille selective USB (sur secteur) ;
  4. regle les heures actives de Windows Update ;
  5. cree la tache planifiee qui lance le pont Art-Net a l'ouverture de session.
  Fichier volontairement en ASCII (PowerShell 5.1 lit mal l'UTF-8 sans BOM).

.PARAMETER RoomUrl
  Adresse de l'ecran de salle, ex. https://salle.exemple.fr (l'origine en est deduite).

.PARAMETER BridgeTarget
  Adresse du noeud Art-Net (option --target du pont). Facultatif.

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
  [ValidateRange(0, 23)][int]$ActiveHoursStart = 9,
  [ValidateRange(0, 23)][int]$ActiveHoursEnd = 3
)

$ErrorActionPreference = 'Stop'

# Contrat avec le pont Art-Net (lot L11) : chemin et options ne changent pas sans accord.
$BridgeExe = 'C:\QuizzUp\quizzup-artnet-bridge.exe'
$TaskName = 'QuizzUp - Pont Art-Net'
$ProfileDir = 'C:\QuizzUp\chrome-profile'
$ShortcutName = 'QuizzUp - Ecran de salle.lnk'
# Marqueur de politiques-chrome.reg, remplace par l'origine reelle.
$OriginPlaceholder = 'https://salle.exemple.fr'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

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

# --- 1. Politiques Chrome ---------------------------------------------------------------------
Write-Step "Politiques Chrome pour l'origine $origin"
$template = Join-Path $PSScriptRoot 'politiques-chrome.reg'
$regText = (Get-Content -LiteralPath $template -Raw).Replace($OriginPlaceholder, $origin)
$regText = $regText -replace "\r?\n", "`r`n"
$tmpReg = Join-Path ([IO.Path]::GetTempPath()) 'quizzup-politiques-chrome.reg'
Set-Content -LiteralPath $tmpReg -Value $regText -Encoding Unicode
try {
  & reg.exe import $tmpReg /reg:64 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Import des politiques Chrome en echec (reg.exe code $LASTEXITCODE)." }
}
finally {
  Remove-Item -LiteralPath $tmpReg -Force -ErrorAction SilentlyContinue
}

# --- 2. Raccourci kiosque dans le dossier Demarrage ------------------------------------------
Write-Step 'Raccourci Chrome kiosque (dossier Demarrage)'
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
# Les drapeaux doublent les politiques que Chrome ignore sur un Windows non gere (Home).
$chromeArgs = @(
  '--kiosk',
  "--app=$($uri.AbsoluteUri)",
  "--user-data-dir=`"$ProfileDir`"",
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
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) $ShortcutName
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

# --- 5. Tache planifiee du pont Art-Net -------------------------------------------------------
Write-Step 'Tache planifiee du pont Art-Net (a l''ouverture de session)'
$bridgeArgs = "--origin $origin"
if ($BridgeTarget) { $bridgeArgs += " --target $BridgeTarget" }
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction = New-ScheduledTaskAction -Execute $BridgeExe -Argument $bridgeArgs -WorkingDirectory (Split-Path -Parent $BridgeExe)
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger `
  -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null

if (-not (Test-Path -LiteralPath $BridgeExe)) {
  Write-Warning "Pont Art-Net absent : $BridgeExe. La tache est creee ; copiez l'executable a cet emplacement (inutile avec une interface USB-DMX)."
}

Write-Host ''
Write-Host "Poste installe pour $origin. Redemarrez le PC, puis suivez 'Verifier' dans README.md." -ForegroundColor Green
