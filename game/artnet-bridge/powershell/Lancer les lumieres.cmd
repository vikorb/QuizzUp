@echo off
rem Lance le relais lumieres QuizzUp (Windows PowerShell 5.1, rien a installer).
rem Adresse de l'ecran de salle autorisee : a modifier ci-dessous, ou definir QUIZZUP_BRIDGE_ORIGINS.
rem Options en plus (ex. -Target 192.168.1.50) : les ajouter apres le nom du fichier.
if not defined QUIZZUP_BRIDGE_ORIGINS set "QUIZZUP_BRIDGE_ORIGINS=https://salle.quizzup.fr"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0quizzup-lumieres.ps1" %*
if errorlevel 1 (
  echo.
  echo Le relais est arrete. Si ce n'est pas voulu, lisez le message ci-dessus.
  pause
)
