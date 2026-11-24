<#
.SYNOPSIS
  Relais lumières QuizzUp : écran de salle (navigateur) -> Art-Net (réseau), en Windows PowerShell 5.1.

.DESCRIPTION
  Équivalent du pont `quizzup-artnet-bridge` (game/artnet-bridge/src), sans rien installer : même
  protocole navigateur -> pont (messages hello v1 et v2, ack, error, trames de 515 octets, codes de
  fermeture 4000 à 4005), mêmes paquets ArtDMX, même chien de garde (noir si le navigateur se tait
  ou se déconnecte). Écoute sur 127.0.0.1 seulement, un seul écran de salle à la fois.

  Non repris du pont : -Map, --config, la recherche de nœuds (poll) et le gel (hold) ; l'ack annonce
  donc "features":[]. Fichier enregistré en UTF-8 AVEC BOM (PowerShell 5.1 en a besoin pour lire les
  accents) : ne pas retirer le BOM.

.PARAMETER Target
  IP du nœud Art-Net (ex. 192.168.1.50) ou de diffusion. Facultatif : sans lui, l'IP se règle dans
  l'écran Matériel de la salle (réseaux locaux uniquement). Donné ici, il est prioritaire.

.PARAMETER Origin
  Origine de l'écran de salle autorisée (ex. https://salle.quizzup.fr) ; plusieurs possibles, séparées
  par des virgules. À défaut : variable d'environnement QUIZZUP_BRIDGE_ORIGINS.

.PARAMETER Universe
  Univers Art-Net de sortie : NET.SUB.UNI (ex. 0.0.1) ou adresse 15 bits (ex. 1). 0 par défaut. Les
  univers 1 à 15 de l'écran de salle sortent sur Universe + 1, + 2...

.PARAMETER Port
  Port d'écoute WebSocket sur 127.0.0.1 (7654 par défaut).

.PARAMETER Bind
  IP locale d'où partent les paquets (PC à plusieurs cartes réseau).

.PARAMETER ArtnetPort
  Port UDP Art-Net (6454 par défaut, à ne changer que pour un test).

.PARAMETER Timeout
  Silence du navigateur avant le noir de sécurité, en ms (2500 par défaut, 200 à 10000).

.PARAMETER Blackout
  Durée des trames à zéro après une coupure, en ms (3000 par défaut, 500 à 60000).
#>
[CmdletBinding()]
param(
  [string]$Target,
  [string[]]$Origin,
  [string]$Universe = '0',
  [int]$Port = 7654,
  [string]$Bind,
  [int]$ArtnetPort = 6454,
  [int]$Timeout = 2500,
  [int]$Blackout = 3000
)

$ErrorActionPreference = 'Stop'

# --- Constantes (mêmes valeurs que le pont) ---------------------------------------------------
$ScriptVersion = '0.1.0-powershell'
$BridgeName = 'quizzup-artnet-bridge'
$FrameBytes = 515
$Channels = 512
$InternalUniverses = 16
$HelloTimeoutMs = 2000
$CloseGraceMs = 1000
$TickMs = 25
$MinIntervalMs = 22
$KeepAliveMs = 800
$BlackoutIntervalMs = 100
$BusyMessage = 'un autre onglet est déjà connecté au pont'
$TargetRanges = '10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, 127.x.x.x'
$CloseHelloExpected = 4000
$CloseProtocol = 4001
$CloseUniverse = 4002
$CloseBadFrame = 4003
$CloseBusy = 4004
$CloseTarget = 4005

$utf8 = New-Object System.Text.UTF8Encoding($false)
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$noToken = [System.Threading.CancellationToken]::None
$Octet = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
$Ipv4Pattern = "^$Octet(\.$Octet){3}\z"

function Get-Now { $clock.ElapsedMilliseconds }

function Write-Log([string]$message) {
  Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $message)
}

function Stop-WithError([string]$message) {
  Write-Host "Erreur : $message" -ForegroundColor Red
  exit 1
}

function Test-IPv4($text) { ($text -is [string]) -and ($text -match $Ipv4Pattern) }

# Réseaux locaux seulement : RFC 1918, lien local (169.254) et boucle locale (127).
function Test-LocalTarget([string]$ip) {
  $o = @($ip.Split('.') | ForEach-Object { [int]$_ })
  ($o[0] -eq 10) -or ($o[0] -eq 127) -or
    (($o[0] -eq 172) -and ($o[1] -ge 16) -and ($o[1] -le 31)) -or
    (($o[0] -eq 192) -and ($o[1] -eq 168)) -or
    (($o[0] -eq 169) -and ($o[1] -eq 254))
}

function Test-JsonNumber($v) { ($v -is [int]) -or ($v -is [long]) -or ($v -is [double]) -or ($v -is [decimal]) }
function Test-JsonInteger($v) { (Test-JsonNumber $v) -and ($v -eq [Math]::Floor([double]$v)) }

# Équivalent de String(valeur) en JavaScript, pour les messages d'erreur.
function Format-Value($v) {
  if ($null -eq $v) { return 'null' }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if (($v -is [string]) -or (Test-JsonNumber $v)) { return [string]$v }
  '[object Object]'
}

function ConvertTo-JsonText([string]$text) {
  $escaped = $text.Replace('\', '\\').Replace('"', '\"')
  $escaped = [regex]::Replace($escaped, '[\x00-\x1f]', [System.Text.RegularExpressions.MatchEvaluator] {
      param($m) '\u{0:x4}' -f [int][char]$m.Value
    })
  '"' + $escaped + '"'
}

function Get-ErrorJson([string]$code, [string]$message) {
  '{"type":"error","code":' + (ConvertTo-JsonText $code) + ',"message":' + (ConvertTo-JsonText $message) + '}'
}

# Origine normalisée (comme URL.origin), ou $null si ce n'est pas une origine http(s) valide.
function Get-NormalizedOrigin([string]$text) {
  $uri = $null
  if (-not [System.Uri]::TryCreate($text.Trim(), [System.UriKind]::Absolute, [ref]$uri)) { return $null }
  if (($uri.Scheme -ne 'http') -and ($uri.Scheme -ne 'https')) { return $null }
  $normalized = '{0}://{1}' -f $uri.Scheme, $uri.IdnHost.ToLowerInvariant()
  if (-not $uri.IsDefaultPort) { $normalized += ':' + $uri.Port }
  $normalized
}

function ConvertTo-PortAddress([string]$text) {
  $t = $text.Trim()
  $number = [long]0
  if ($t -match '^[0-9]+\z') {
    if (-not [long]::TryParse($t, [ref]$number) -or ($number -gt 32767)) { return $null }
    return @{ Net = [int](($number -shr 8) -band 0x7f); Sub = [int](($number -shr 4) -band 0x0f); Uni = [int]($number -band 0x0f) }
  }
  if ($t -match '^([0-9]+)\.([0-9]+)\.([0-9]+)\z') {
    $net = [long]0; $sub = [long]0; $uni = [long]0
    if (-not ([long]::TryParse($Matches[1], [ref]$net) -and [long]::TryParse($Matches[2], [ref]$sub) -and
        [long]::TryParse($Matches[3], [ref]$uni))) { return $null }
    if (($net -gt 127) -or ($sub -gt 15) -or ($uni -gt 15)) { return $null }
    return @{ Net = [int]$net; Sub = [int]$sub; Uni = [int]$uni }
  }
  $null
}

# Cible demandée par l'écran de salle : IPv4 d'un réseau local, sinon message lisible dans l'écran.
function Get-TargetCheck($requested) {
  if (-not (Test-IPv4 $requested)) {
    return @{ Ok = $false; Message = "cible Art-Net « $(Format-Value $requested) » : adresse IPv4 attendue" }
  }
  if (-not (Test-LocalTarget $requested)) {
    return @{ Ok = $false; Message = "cible Art-Net $requested refusée : seules les adresses du réseau local sont acceptées ($TargetRanges)" }
  }
  @{ Ok = $true; Target = $requested }
}

# --- Réglages ------------------------------------------------------------------------------------
if (($Port -lt 1) -or ($Port -gt 65535)) { Stop-WithError "-Port : « $Port » n'est pas un entier entre 1 et 65535" }
if (($ArtnetPort -lt 1) -or ($ArtnetPort -gt 65535)) { Stop-WithError "-ArtnetPort : « $ArtnetPort » n'est pas un entier entre 1 et 65535" }
if (($Timeout -lt 200) -or ($Timeout -gt 10000)) { Stop-WithError "-Timeout : « $Timeout » n'est pas un entier entre 200 et 10000" }
if (($Blackout -lt 500) -or ($Blackout -gt 60000)) { Stop-WithError "-Blackout : « $Blackout » n'est pas un entier entre 500 et 60000" }

$targetFromCli = -not [string]::IsNullOrWhiteSpace($Target)
$relayTarget = $null
if ($targetFromCli) {
  $relayTarget = $Target.Trim()
  if (-not (Test-IPv4 $relayTarget)) { Stop-WithError "-Target : « $Target » n'est pas une adresse IPv4" }
}
$bindAddress = [System.Net.IPAddress]::Any
if (-not [string]::IsNullOrWhiteSpace($Bind)) {
  if (-not (Test-IPv4 $Bind.Trim())) { Stop-WithError "-Bind : « $Bind » n'est pas une adresse IPv4" }
  $bindAddress = [System.Net.IPAddress]::Parse($Bind.Trim())
}

$originValues = @()
if ($Origin) { $originValues = @($Origin) } elseif ($env:QUIZZUP_BRIDGE_ORIGINS) { $originValues = @($env:QUIZZUP_BRIDGE_ORIGINS) }
$origins = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($value in $originValues) {
  foreach ($part in $value.Split(',')) {
    if ($part.Trim() -eq '') { continue }
    $normalized = Get-NormalizedOrigin $part
    if (-not $normalized) { Stop-WithError "-Origin : « $($part.Trim()) » n'est pas une origine http(s) valide" }
    [void]$origins.Add($normalized)
  }
}
if ($origins.Count -eq 0) {
  Stop-WithError "-Origin est obligatoire : adresse de l'écran de salle (ex. https://salle.quizzup.fr), ou variable QUIZZUP_BRIDGE_ORIGINS"
}

$base = ConvertTo-PortAddress $Universe
if ($null -eq $base) {
  Stop-WithError "-Universe : « $Universe » invalide (NET.SUB.UNI avec net 0-127, sub 0-15, univers 0-15, ou 0-32767)"
}
# Un univers de sortie par univers interne : le 0 sur -Universe, les suivants juste après.
$baseKey = ($base.Net -shl 8) -bor ($base.Sub -shl 4) -bor $base.Uni
$outputs = New-Object 'System.Collections.Generic.List[object]'
for ($internal = 0; $internal -lt $InternalUniverses; $internal++) {
  $key = $baseKey + $internal
  if ($key -gt 0x7fff) { continue }
  $outputs.Add([pscustomobject]@{
      Source = $internal; Key = $key; Net = ($key -shr 8) -band 0x7f; Sub = ($key -shr 4) -band 0x0f; Uni = $key -band 0x0f
    })
}

# --- Art-Net (UDP) -------------------------------------------------------------------------------
$udp = $null
try {
  $udp = New-Object System.Net.Sockets.UdpClient((New-Object System.Net.IPEndPoint($bindAddress, 0)))
  $udp.EnableBroadcast = $true
} catch {
  Stop-WithError "impossible d'ouvrir l'envoi Art-Net ($($_.Exception.Message)). L'adresse -Bind est-elle celle d'une carte réseau de ce PC ?"
}
$artnetId = [System.Text.Encoding]::ASCII.GetBytes("Art-Net`0")
$zeros = New-Object byte[] $Channels
$targetEndpoint = $null
$warnedNoTarget = $false
$lastUdpError = $null
$sequences = @{}

function Set-TargetEndpoint {
  if ($null -eq $script:relayTarget) { $script:targetEndpoint = $null; return }
  $script:targetEndpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($script:relayTarget), $ArtnetPort)
}
Set-TargetEndpoint

# Paquet ArtDMX (18 octets d'en-tête + 512 canaux), octet par octet comme artnet.ts.
function Send-Output($output, [byte[]]$data) {
  $next = 1
  if ($sequences.ContainsKey($output.Key) -and ($sequences[$output.Key] -lt 255)) { $next = $sequences[$output.Key] + 1 }
  $sequences[$output.Key] = $next
  $packet = New-Object byte[] (18 + $Channels)
  [Array]::Copy($artnetId, $packet, 8)
  $packet[9] = 0x50                                   # OpCode 0x5000, petit-boutiste
  $packet[11] = 14                                    # ProtVer 14, gros-boutiste
  $packet[12] = $next
  $packet[14] = (($output.Sub -band 0x0f) -shl 4) -bor ($output.Uni -band 0x0f)
  $packet[15] = $output.Net -band 0x7f
  $packet[16] = $Channels -shr 8
  $packet[17] = $Channels -band 0xff
  [Array]::Copy($data, 0, $packet, 18, $Channels)
  $script:packetsSent++
  if ($null -eq $script:targetEndpoint) {
    if (-not $script:warnedNoTarget) {
      $script:warnedNoTarget = $true
      Write-Log "Aucune cible Art-Net : rien n'est envoyé (IP du nœud à régler dans l'écran Matériel)"
    }
    return
  }
  try {
    [void]$udp.Send($packet, $packet.Length, $script:targetEndpoint)
    if ($null -ne $script:lastUdpError) {
      $script:lastUdpError = $null
      Write-Log 'Envoi Art-Net rétabli'
    }
  } catch {
    $code = if ($_.Exception -is [System.Net.Sockets.SocketException]) { [string]$_.Exception.SocketErrorCode } else { $_.Exception.Message }
    if ($code -ne $script:lastUdpError) {
      $script:lastUdpError = $code
      Write-Log "Envoi Art-Net impossible vers $($script:relayTarget) : $code. Câble réseau, IP du PC ou IP du nœud ?"
    }
  }
}

# --- Cœur : trames reçues -> paquets, chien de garde (miroir de bridge.ts) -------------------------
$sourceList = New-Object 'System.Collections.Generic.List[object]'
$sourceMap = @{}
function New-Source([bool]$stale) {
  [pscustomobject]@{ Data = $zeros; FrameAt = 0.0; SentAt = [double]::NegativeInfinity; Dirty = $false; Stale = $stale; Universe = 0 }
}
$first = New-Source $true
$sourceList.Add($first)
$sourceMap[0] = $first
$mode = 'waiting'
$lastSentAt = [double]::NegativeInfinity
$blackoutUntil = 0
$packetsSent = 0

function Send-Source([int]$universe, [byte[]]$data) {
  foreach ($output in $outputs) {
    if ($output.Source -eq $universe) { Send-Output $output $data }
  }
}

function Send-Zeros {
  foreach ($source in $sourceList) {
    Send-Source $source.Universe $zeros
    $source.SentAt = Get-Now
  }
  $script:lastSentAt = Get-Now
}

function Start-Blackout([string]$reason) {
  $was = $script:mode -eq 'blackout'
  $script:mode = 'blackout'
  $script:blackoutUntil = (Get-Now) + $Blackout
  foreach ($source in $sourceList) { $source.Data = $zeros; $source.Dirty = $false }
  if (-not $was) { Write-Log "Coupure de sécurité ($reason) : noir sur toutes les lumières" }
  Send-Zeros
}

function Invoke-Tick {
  $now = Get-Now
  if ($script:mode -eq 'live') {
    $allSilent = $true
    foreach ($source in $sourceList) {
      if (-not ($source.Stale -or (($now - $source.FrameAt) -gt $Timeout))) { $allSilent = $false; break }
    }
    if ($allSilent) { Start-Blackout 'plus aucune image de l''écran de salle'; return }
    foreach ($source in $sourceList) {
      if ((-not $source.Stale) -and (($now - $source.FrameAt) -gt $Timeout)) {
        Write-Log "Univers interne $($source.Universe) : plus de trame, remis à zéro"
        $source.Stale = $true
        $source.Data = $zeros
        $source.Dirty = $true
      }
      if (($source.Dirty -and (($now - $source.SentAt) -ge $MinIntervalMs)) -or (($now - $source.SentAt) -ge $KeepAliveMs)) {
        $source.Dirty = $false
        Send-Source $source.Universe $source.Data
        $source.SentAt = $now
      }
    }
    return
  }
  if ($script:mode -eq 'blackout') {
    if ($now -ge $script:blackoutUntil) {
      $script:mode = 'waiting'
      Write-Log 'Fin des trames à zéro, en attente de l''écran de salle'
      return
    }
    if (($now - $script:lastSentAt) -ge $BlackoutIntervalMs) { Send-Zeros }
  }
}

function Receive-Frame([int]$universe, [byte[]]$payload) {
  $now = Get-Now
  if ($script:mode -ne 'live') { Write-Log 'Trames reçues de l''écran de salle : envoi Art-Net en cours' }
  $script:mode = 'live'
  $source = $sourceMap[$universe]
  if ($null -eq $source) {
    $source = New-Source $false
    $source.Universe = $universe
    $sourceList.Add($source)
    $sourceMap[$universe] = $source
    if (-not ($outputs | Where-Object { $_.Source -eq $universe })) {
      Write-Log "Univers interne $universe reçu mais non mappé : ignoré"
    }
  }
  $data = New-Object byte[] $Channels
  [Array]::Copy($payload, 3, $data, 0, $Channels)
  $source.FrameAt = $now
  $source.Stale = $false
  $source.Data = $data
  $source.Dirty = $true
  if (($now - $source.SentAt) -ge $MinIntervalMs) {
    $source.Dirty = $false
    Send-Source $universe $data
    $source.SentAt = $now
  }
}

# Un changement de cible venu de l'écran de salle : l'UDP n'est pas garanti et un nœud garde sa
# dernière valeur (fumée comprise), donc 3 trames à zéro partent d'abord vers l'ancienne cible.
function Switch-Target($next) {
  if ($next -eq $script:relayTarget) { return }
  if ($null -ne $script:relayTarget) {
    for ($count = 0; $count -lt 3; $count++) { Send-Zeros }
  }
  $script:relayTarget = $next
  Set-TargetEndpoint
  $script:warnedNoTarget = $false
  if ($null -eq $next) { Write-Log 'Cible Art-Net : à régler dans l''écran de salle' }
  else { Write-Log "Cible Art-Net reçue de l'écran de salle : ${next}:$ArtnetPort" }
}

# --- Connexions WebSocket ---------------------------------------------------------------------------
$connections = New-Object 'System.Collections.Generic.List[object]'
$client = $null

function Add-Text($c, [string]$text) { $c.Out.Enqueue(@{ Kind = 'text'; Text = $text }) }

function Limit-CloseReason([string]$reason) {
  while ($utf8.GetByteCount($reason) -gt 123) { $reason = $reason.Substring(0, $reason.Length - 1) }
  $reason
}

function Add-Close($c, [int]$code, [string]$reason) {
  if ($c.Closing -or $c.Finished) { return }
  $c.Closing = $true
  $c.CloseCode = $code
  $c.CloseDeadline = (Get-Now) + $CloseGraceMs
  $c.Out.Enqueue(@{ Kind = 'close'; Code = $code; Reason = (Limit-CloseReason $reason) })
}

function Add-Refuse($c, [int]$code, [string]$kind, [string]$message) {
  Write-Log "Écran de salle refusé : $message"
  Add-Text $c (Get-ErrorJson $kind $message)
  Add-Close $c $code $message
}

# Fin de la connexion : le chien de garde passe au noir si l'écran de salle avait été accepté.
function Complete-Connection($c, [int]$code) {
  if ($c.Finished) { return }
  $c.Finished = $true
  $c.ReapAt = (Get-Now) + $CloseGraceMs
  if ($script:client -eq $c) {
    $script:client = $null
    if ($c.Ready) {
      Write-Log "Écran de salle déconnecté (code $code)"
      if ($script:mode -ne 'waiting') { Start-Blackout 'écran de salle déconnecté' }
    }
  }
}

function Read-Hello([string]$text) {
  try { $raw = ConvertFrom-Json -InputObject $text } catch { return $null }
  if ($raw -isnot [pscustomobject]) { return $null }
  if (-not (($raw.type -is [string]) -and ($raw.type -ceq 'hello') -and (Test-JsonNumber $raw.protocol))) { return $null }
  $version = 1
  if (Test-JsonNumber $raw.version) { $version = $raw.version }
  $universe = 0
  if (Test-JsonNumber $raw.universe) { $universe = $raw.universe }
  $artnet = $raw.artnet
  $hasTarget = $false
  $requested = $null
  if (($version -ge 2) -and ($artnet -is [pscustomobject]) -and ($artnet.PSObject.Properties.Name -contains 'target')) {
    $hasTarget = $true
    $requested = $artnet.target
  }
  @{ Protocol = $raw.protocol; Universe = $universe; HasTarget = $hasTarget; Target = $requested }
}

function Get-AckJson {
  $source = 'room'
  $shown = 'null'
  if ($null -eq $script:relayTarget) { $source = 'none' } else { $shown = '"' + $script:relayTarget + '"' }
  if (($null -ne $script:relayTarget) -and $targetFromCli) { $source = 'cli' }
  '{"type":"ack","protocol":1,"bridge":"' + $BridgeName + '","version":' + (ConvertTo-JsonText $ScriptVersion) +
    ',"universes":' + $InternalUniverses + ',"artnet":{"target":' + $shown + ',"port":' + $ArtnetPort +
    ',"source":"' + $source + '"},"features":[]}'
}

function Receive-Message($c, [string]$kind, [byte[]]$bytes) {
  if (-not $c.Ready) {
    $hello = $null
    if ($kind -eq 'text') { $hello = Read-Hello ($utf8.GetString($bytes)) }
    if ($null -eq $hello) { Add-Refuse $c $CloseHelloExpected 'hello' 'présentation (hello) attendue en premier'; return }
    $c.HelloDeadline = $null
    if ($hello.Protocol -ne 1) {
      Add-Refuse $c $CloseProtocol 'protocol' "protocole $($hello.Protocol) non géré (pont en protocole 1)"
      return
    }
    if (-not ((Test-JsonInteger $hello.Universe) -and ($hello.Universe -ge 0) -and ($hello.Universe -lt $InternalUniverses))) {
      Add-Refuse $c $CloseUniverse 'universe' "univers interne $($hello.Universe) non géré (univers 0 à $($InternalUniverses - 1))"
      return
    }
    if (-not $targetFromCli) {
      # Sans -Target, la cible est celle de ce hello : un hello v1 (ou sans artnet) l'efface, pour ne
      # jamais émettre vers l'IP d'une salle précédente.
      $next = $null
      if ($hello.HasTarget) {
        $check = Get-TargetCheck $hello.Target
        if (-not $check.Ok) { Add-Refuse $c $CloseTarget 'target' $check.Message; return }
        $next = $check.Target
      }
      Switch-Target $next
    }
    $c.Ready = $true
    Add-Text $c (Get-AckJson)
    Write-Log "Écran de salle connecté ($($c.Origin))"
    return
  }
  if ($kind -eq 'text') { return }
  if ($bytes.Length -ne $FrameBytes) {
    Add-Refuse $c $CloseBadFrame 'frame' "trame de $($bytes.Length) octets, attendu $FrameBytes"
    return
  }
  if ($bytes[0] -ne 1) {
    Add-Refuse $c $CloseBadFrame 'frame' "trame en version $($bytes[0]), attendu 1"
    return
  }
  $universe = ($bytes[1] -shl 8) -bor $bytes[2]
  if ($universe -ge $InternalUniverses) {
    Add-Refuse $c $CloseUniverse 'universe' "trame pour l'univers $universe (univers 0 à $($InternalUniverses - 1))"
    return
  }
  Receive-Frame $universe $bytes
}

function Send-Http($ctx, [int]$status, [string]$text) {
  try {
    $body = $utf8.GetBytes($text)
    $response = $ctx.Response
    $response.StatusCode = $status
    $response.ContentType = 'text/plain; charset=utf-8'
    $response.ContentLength64 = $body.Length
    $response.KeepAlive = $false
    $response.OutputStream.Write($body, 0, $body.Length)
    $response.Close()
  } catch {
    try { $ctx.Response.Abort() } catch { }
  }
}

function Invoke-Context($ctx) {
  $request = $ctx.Request
  if (-not $request.IsWebSocketRequest) {
    Send-Http $ctx 426 "Pont QuizzUp Art-Net actif : connexion WebSocket attendue.`n"
    return
  }
  # HTTP.sys peut accepter un nom d'hôte (localhost) sur toutes les cartes : on ne garde que la boucle locale.
  if (-not ([System.Net.IPAddress]::IsLoopback($request.RemoteEndPoint.Address) -and [System.Net.IPAddress]::IsLoopback($request.LocalEndPoint.Address))) {
    Write-Log 'Connexion refusée : elle ne vient pas de ce PC'
    Send-Http $ctx 403 "Hôte refusé`n"
    return
  }
  # Protection contre le « DNS rebinding » : seuls 127.0.0.1 et localhost sont acceptés comme hôte.
  $hostHeader = "$($request.Headers['Host'])".ToLowerInvariant()
  $allowedHosts = @("127.0.0.1:$Port", "localhost:$Port")
  if ($Port -eq 80) { $allowedHosts += @('127.0.0.1', 'localhost') }
  if ($allowedHosts -notcontains $hostHeader) {
    $shownHost = if ($hostHeader) { $hostHeader } else { '(absent)' }
    Write-Log "Connexion refusée : hôte inattendu « $shownHost »"
    Send-Http $ctx 403 "Hôte refusé`n"
    return
  }
  $rawOrigin = $request.Headers['Origin']
  $origin = $null
  if ($rawOrigin) { $origin = Get-NormalizedOrigin $rawOrigin }
  if ((-not $origin) -or (-not $origins.Contains($origin))) {
    $shown = if ($rawOrigin) { $rawOrigin } else { '(absente)' }
    Write-Log "Connexion refusée : origine « $shown » non autorisée (autorisées : $($origins -join ', '))"
    Send-Http $ctx 403 "Origine non autorisée`n"
    return
  }
  $now = Get-Now
  $c = [pscustomobject]@{
    Origin = $origin; Ws = $null; AcceptTask = $null; AcceptDeadline = $now + $HelloTimeoutMs; Recv = $null
    SendTask = $null; Out = (New-Object System.Collections.Queue); Buffer = (New-Object byte[] 1024)
    Segment = $null; Message = (New-Object System.IO.MemoryStream); MessageKind = $null; TooLong = $false
    Ready = $false; Closing = $false; Finished = $false; CloseCode = 1006; CloseDeadline = $null
    HelloDeadline = $null; ReapAt = $null
  }
  $c.Segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $c.Buffer)
  $c.AcceptTask = $ctx.AcceptWebSocketAsync([NullString]::Value)
  $connections.Add($c)
  if ($script:client) {
    # Connexion acceptée puis refusée par message : le navigateur affiche la raison.
    Write-Log "Connexion refusée depuis $origin : un écran de salle est déjà connecté"
    Add-Text $c (Get-ErrorJson 'busy' $BusyMessage)
    Add-Close $c $CloseBusy $BusyMessage
    return
  }
  $script:client = $c
  $c.HelloDeadline = $now + $HelloTimeoutMs
}

function Get-EchoCode([int]$code) {
  if ((($code -ge 1000) -and ($code -le 1003)) -or (($code -ge 1007) -and ($code -le 1014)) -or (($code -ge 3000) -and ($code -le 4999))) { return $code }
  1000
}

# Un tour de la connexion : jamais d'attente bloquante, tout est suivi par échéances.
function Step-Connection($c) {
  $now = Get-Now
  if ($c.AcceptTask) {
    if (-not $c.AcceptTask.IsCompleted) {
      if ($now -gt $c.AcceptDeadline) { $c.AcceptTask = $null; Complete-Connection $c 1006; $c.ReapAt = $now }
      return
    }
    $task = $c.AcceptTask
    $c.AcceptTask = $null
    if ($task.IsFaulted -or $task.IsCanceled) { Complete-Connection $c 1006; $c.ReapAt = $now; return }
    $c.Ws = $task.Result.WebSocket
    $c.Recv = $c.Ws.ReceiveAsync($c.Segment, $noToken)
  }
  if ($c.SendTask -and $c.SendTask.IsCompleted) {
    if ($c.SendTask.IsFaulted) { Complete-Connection $c 1006; $c.Out.Clear(); $c.ReapAt = $now }
    $c.SendTask = $null
  }
  if ((-not $c.SendTask) -and ($c.Out.Count -gt 0)) {
    $item = $c.Out.Dequeue()
    if ($item.Kind -eq 'text') {
      $bytes = $utf8.GetBytes($item.Text)
      $c.SendTask = $c.Ws.SendAsync((New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $noToken)
    } else {
      $c.SendTask = $c.Ws.CloseOutputAsync([enum]::ToObject([System.Net.WebSockets.WebSocketCloseStatus], [int]$item.Code), $item.Reason, $noToken)
    }
  }
  if ($c.Recv -and $c.Recv.IsCompleted -and -not $c.Finished) {
    $task = $c.Recv
    $c.Recv = $null
    if ($task.IsFaulted -or $task.IsCanceled) {
      Complete-Connection $c $c.CloseCode
    } else {
      $result = $task.Result
      if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
        $peerCode = 1005
        if ($null -ne $result.CloseStatus) { $peerCode = [int]$result.CloseStatus }
        if (-not $c.Closing) {
          # Écho de la fermeture, comme l'exige la RFC.
          $c.Closing = $true
          $c.CloseCode = $peerCode
          $c.Out.Enqueue(@{ Kind = 'close'; Code = (Get-EchoCode $peerCode); Reason = '' })
        }
        Complete-Connection $c $c.CloseCode
      } else {
        if ($c.Closing) {
          # Fermeture en cours : les données encore en route sont ignorées.
        } elseif (($c.Message.Length + $result.Count) -gt $FrameBytes) {
          Write-Log 'Message trop long refusé'
          Add-Close $c 1009 'Message trop long'
        } else {
          if ($null -eq $c.MessageKind) { $c.MessageKind = if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) { 'text' } else { 'binary' } }
          $c.Message.Write($c.Buffer, 0, $result.Count)
          if ($result.EndOfMessage) {
            $bytes = $c.Message.ToArray()
            $kind = $c.MessageKind
            $c.Message.SetLength(0)
            $c.MessageKind = $null
            $valid = $true
            if ($kind -eq 'text') { try { [void]$utf8Strict.GetString($bytes) } catch { $valid = $false } }
            if (-not $valid) { Add-Close $c 1007 'Texte UTF-8 invalide' } else { Receive-Message $c $kind $bytes }
          }
        }
        if (-not $c.Finished) {
          try { $c.Recv = $c.Ws.ReceiveAsync($c.Segment, $noToken) } catch { Complete-Connection $c $c.CloseCode }
        }
      }
    }
  }
  if ((-not $c.Finished) -and $c.HelloDeadline -and (-not $c.Closing) -and ($now -ge $c.HelloDeadline)) {
    $c.HelloDeadline = $null
    Add-Refuse $c $CloseHelloExpected 'hello' 'aucune présentation reçue'
  }
  if ((-not $c.Finished) -and $c.CloseDeadline -and ($now -ge $c.CloseDeadline)) {
    # Le navigateur n'a pas répondu à la fermeture : on coupe.
    Complete-Connection $c $c.CloseCode
    $c.Out.Clear()
    $c.ReapAt = $now
  }
}

function Remove-Connection($c) {
  try { if ($c.Ws) { $c.Ws.Abort(); $c.Ws.Dispose() } } catch { }
  [void]$connections.Remove($c)
}

# --- Démarrage -------------------------------------------------------------------------------------
$listener = New-Object System.Net.HttpListener
[void]$listener.Prefixes.Add("http://127.0.0.1:$Port/")
[void]$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  $udp.Close()
  $busyPort = ($_.Exception.InnerException -is [System.Net.HttpListenerException]) -and (@(32, 183) -contains $_.Exception.InnerException.ErrorCode)
  if ($busyPort) { Stop-WithError "le port $Port est déjà utilisé (un autre relais ou pont tourne-t-il déjà ?)" }
  Stop-WithError "démarrage impossible : $($_.Exception.Message)"
}

Write-Host ''
Write-Host "Relais lumières QuizzUp $ScriptVersion" -ForegroundColor Cyan
Write-Log "Prêt : ws://127.0.0.1:$Port. Laissez cette fenêtre ouverte, Ctrl+C pour arrêter."
Write-Log "Écran de salle autorisé : $($origins -join ', ')"
if ($null -eq $relayTarget) { Write-Log 'Cible Art-Net : à régler dans l''écran de salle (vue Matériel)' }
else { Write-Log "Cible Art-Net : ${relayTarget}:$ArtnetPort (imposée par ce script)" }

$acceptTask = $listener.GetContextAsync()
$lastTick = Get-Now
$lastError = $null
try {
  while ($true) {
    $waiting = New-Object 'System.Collections.Generic.List[System.Threading.Tasks.Task]'
    $waiting.Add($acceptTask)
    foreach ($c in $connections) {
      foreach ($task in @($c.AcceptTask, $c.Recv, $c.SendTask)) {
        if ($task -and -not $task.IsCompleted) { $waiting.Add($task) }
      }
    }
    [void][System.Threading.Tasks.Task]::WaitAny($waiting.ToArray(), 5)
    try {
      foreach ($c in $connections.ToArray()) {
        Step-Connection $c
        if ($c.Finished -and ($c.ReapAt -ne $null) -and (((Get-Now) -ge $c.ReapAt) -or ((-not $c.SendTask) -and ($c.Out.Count -eq 0)))) {
          Remove-Connection $c
        }
      }
      # Les connexions d'abord : une fermeture déjà reçue libère la place avant d'accepter la suivante.
      if ($acceptTask.IsCompleted) {
        if ($acceptTask.IsFaulted -or $acceptTask.IsCanceled) { throw 'Le relais n''écoute plus.' }
        $ctx = $acceptTask.Result
        $acceptTask = $listener.GetContextAsync()
        Invoke-Context $ctx
      }
      if (((Get-Now) - $lastTick) -ge $TickMs) {
        $lastTick = Get-Now
        Invoke-Tick
      }
    } catch {
      if ($_.Exception.Message -eq 'Le relais n''écoute plus.') { throw }
      if ($_.Exception.Message -ne $lastError) {
        $lastError = $_.Exception.Message
        Write-Log "Erreur : $lastError"
      }
    }
  }
} finally {
  # Arrêt (Ctrl+C) : du noir sur tous les univers avant de fermer.
  Write-Log 'Arrêt du relais : noir sur toutes les lumières'
  Send-Zeros
  foreach ($c in $connections.ToArray()) {
    try { if ($c.Ws -and ($c.Ws.State -eq 'Open')) { [void]$c.Ws.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]1001, 'Arrêt du pont', $noToken).Wait(200) } } catch { }
    Remove-Connection $c
  }
  try { $listener.Stop(); $listener.Close() } catch { }
  try { $udp.Close() } catch { }
}
