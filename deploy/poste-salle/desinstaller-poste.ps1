#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Defait ce que fait installer-poste.ps1 (lancer avec le meme compte Windows).

.DESCRIPTION
  Retire les politiques Chrome posees par le kit (seulement celles de politiques-chrome.reg),
  le raccourci de demarrage, la tache planifiee du pont et les heures actives. Les reglages
  d'energie retrouvent des valeurs usuelles de Windows (ecran 10 min, veille 30 min, disque 20
  min, mise en veille selective USB activee), pas forcement celles d'avant l'installation.
  Conserve C:\QuizzUp (pont, profil Chrome). Fichier volontairement en ASCII.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$TaskName = 'QuizzUp - Pont Art-Net'
$ShortcutName = 'QuizzUp - Ecran de salle.lnk'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

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
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) $ShortcutName) -Force -ErrorAction SilentlyContinue

# --- 3. Tache planifiee -----------------------------------------------------------------------
Write-Step 'Tache planifiee du pont'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# --- 4. Energie -------------------------------------------------------------------------------
Write-Step 'Energie : valeurs usuelles de Windows'
function Invoke-PowerCfg {
  & powercfg.exe @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "powercfg $args en echec (code $LASTEXITCODE)." }
}
Invoke-PowerCfg /change standby-timeout-ac 30
Invoke-PowerCfg /change monitor-timeout-ac 10
Invoke-PowerCfg /change disk-timeout-ac 20
Invoke-PowerCfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1
Invoke-PowerCfg /setactive SCHEME_CURRENT

# --- 5. Heures actives ------------------------------------------------------------------------
Write-Step 'Windows Update : heures actives'
$wuKey = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
foreach ($name in 'ActiveHoursStart', 'ActiveHoursEnd') {
  Remove-ItemProperty -LiteralPath $wuKey -Name $name -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Poste desinstalle. C:\QuizzUp est conserve.' -ForegroundColor Green
