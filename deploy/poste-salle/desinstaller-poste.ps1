#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Defait ce que fait installer-poste.ps1.

.DESCRIPTION
  Retire les politiques Chrome posees par le kit (seulement celles de politiques-chrome.reg),
  le raccourci de demarrage, la regle de pare-feu, la tache planifiee (et arrete le pont) et
  remet les heures actives a 8 h - 17 h. Les reglages d'energie retrouvent des valeurs usuelles
  de Windows (ecran 10 min, veille 30 min, hibernation 180 min, disque 20 min, mise en veille
  selective USB activee), pas forcement celles d'avant l'installation.
  Conserve C:\QuizzUp (pont, droits verrouilles) et le profil Chrome de la salle.
  Chrome n'est pas ferme : fermez-le a la main. Fichier volontairement en ASCII.

.PARAMETER RoomUser
  Compte Windows de la salle (meme valeur que pour l'installation), pour retrouver son
  dossier Demarrage. Defaut : l'utilisateur de la session ouverte, sinon le compte courant.
#>
[CmdletBinding()]
param(
  [string]$RoomUser
)

$ErrorActionPreference = 'Stop'

$TaskName = 'QuizzUp - Pont Art-Net'
$FirewallRuleName = 'QuizzUp - Pont Art-Net (UDP 6454)'
$ShortcutName = 'QuizzUp - Ecran de salle.lnk'
$BridgeProcessName = 'quizzup-artnet-bridge'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# Meme resolution du compte de la salle que installer-poste.ps1 (dossier Demarrage).
function Resolve-RoomStartup([string]$Requested) {
  $elevated = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $name = $Requested
  if (-not $name) {
    $session = (Get-CimInstance Win32_ComputerSystem).UserName
    $name = if ($session) { $session } else { $elevated }
  }
  if ($name -ieq $elevated) { return [Environment]::GetFolderPath('Startup') }
  try {
    $sid = (New-Object Security.Principal.NTAccount($name)).Translate([Security.Principal.SecurityIdentifier]).Value
  }
  catch {
    throw "Compte Windows introuvable : '$name' (utilisez -RoomUser DOMAINE\utilisateur)."
  }
  $profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid"
  $profilePath = (Get-ItemProperty -LiteralPath $profileKey -ErrorAction SilentlyContinue).ProfileImagePath
  if (-not $profilePath) { throw "Profil Windows de '$name' introuvable (precisez -RoomUser)." }
  Join-Path ([Environment]::ExpandEnvironmentVariables($profilePath)) 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup'
}

if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  throw 'Lancez PowerShell 64 bits (pas la version x86).'
}

# --- 1. Politiques Chrome : on relit le modele pour ne retirer que nos valeurs ----------------
Write-Step 'Politiques Chrome'
$rootKey = $null
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot 'politiques-chrome.reg')) {
  if ($line -match '^\[(HKEY_LOCAL_MACHINE\\.+)\]\s*$') {
    $key = 'Registry::' + $Matches[1]
    if (-not $rootKey) { $rootKey = $key }
    else { Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue }
  }
  elseif ($rootKey -and $line -match '^"([^"]+)"=' -and $key -eq $rootKey) {
    Remove-ItemProperty -LiteralPath $rootKey -Name $Matches[1] -ErrorAction SilentlyContinue
  }
}

# --- 2. Raccourci -----------------------------------------------------------------------------
Write-Step 'Raccourci de demarrage'
$startup = Resolve-RoomStartup $RoomUser
Remove-Item -LiteralPath (Join-Path $startup $ShortcutName) -Force -ErrorAction SilentlyContinue

# --- 3. Tache planifiee, pont, pare-feu -------------------------------------------------------
Write-Step 'Tache planifiee, processus du pont et regle de pare-feu'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Stop-Process -Name $BridgeProcessName -Force -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# --- 4. Energie -------------------------------------------------------------------------------
Write-Step 'Energie : valeurs usuelles de Windows'
function Invoke-PowerCfg {
  & powercfg.exe @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "powercfg $args en echec (code $LASTEXITCODE)." }
}
Invoke-PowerCfg /change standby-timeout-ac 30
Invoke-PowerCfg /change monitor-timeout-ac 10
Invoke-PowerCfg /change hibernate-timeout-ac 180
Invoke-PowerCfg /change disk-timeout-ac 20
Invoke-PowerCfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1
Invoke-PowerCfg /setactive SCHEME_CURRENT

# --- 5. Heures actives : valeurs par defaut de Windows (8 h - 17 h), pas de suppression -------
Write-Step 'Windows Update : heures actives 8h - 17h'
$wuKey = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
if (Test-Path -LiteralPath $wuKey) {
  Set-ItemProperty -LiteralPath $wuKey -Name ActiveHoursStart -Value 8 -Type DWord
  Set-ItemProperty -LiteralPath $wuKey -Name ActiveHoursEnd -Value 17 -Type DWord
}

Write-Host ''
Write-Host 'Poste desinstalle. C:\QuizzUp et le profil Chrome de la salle sont conserves.' -ForegroundColor Green
Write-Warning 'Chrome n''est pas ferme : fermez la fenetre kiosque (Alt+F4) ou redemarrez le PC.'
