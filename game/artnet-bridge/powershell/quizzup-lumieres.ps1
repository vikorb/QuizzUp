<#
.SYNOPSIS
  Relais lumières QuizzUp : écran de salle (navigateur) -> Art-Net (réseau), en Windows PowerShell 5.1.

.DESCRIPTION
  Équivalent du pont `quizzup-artnet-bridge` (game/artnet-bridge/src), sans rien installer : même
  protocole navigateur -> pont (messages hello v1 et v2, ack, error, trames de 515 octets, codes de
  fermeture 4000 à 4005), mêmes paquets ArtDMX, même chien de garde (noir si le navigateur se tait
  ou se déconnecte). Écoute sur 127.0.0.1 seulement (socket TCP à soi, pas HTTP.sys), un seul écran
  de salle à la fois. Cadence tenue : 4 univers à 40 Hz (cf. tests/powershellRelay.test.ts).

  Non repris du pont : -Map, --config, la recherche de nœuds (poll) et le gel (hold) ; l'ack annonce
  donc "features":[]. Fichier enregistré en UTF-8 AVEC BOM (PowerShell 5.1 en a besoin pour lire les
  accents) : ne pas retirer le BOM.

  Fermer la fenêtre : un gestionnaire de console (compilé à la volée par Add-Type) envoie du noir.
  Si le poste refuse la compilation, le script le dit au démarrage et continue : arrêter par Ctrl+C.

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
# Nombre d'univers annoncé dans l'ack : ce que le test de débit garantit à 40 Hz (le relais en accepte 16).
$AnnouncedUniverses = 4
$WsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
$HandshakeMaxBytes = 8192
# Octets lus au plus par connexion et par tour de boucle (soit 8 lectures pleines du tampon).
$ReadTurnMaxBytes = 65536
# Un envoi vers l'écran de salle qui n'avance plus pendant ce délai coupe la connexion.
$SendStallMs = 500
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
# Paquet ArtDMX (18 octets d'en-tête + 512 canaux), octet par octet comme artnet.ts ; l'en-tête est
# posé une fois, seuls la séquence (octet 12) et les canaux changent à chaque envoi.
function New-ArtDmxPacket([int]$net, [int]$sub, [int]$uni) {
  $packet = New-Object byte[] (18 + $Channels)
  [Array]::Copy([System.Text.Encoding]::ASCII.GetBytes("Art-Net`0"), $packet, 8)
  $packet[9] = 0x50                                   # OpCode 0x5000, petit-boutiste
  $packet[11] = 14                                    # ProtVer 14, gros-boutiste
  $packet[14] = (($sub -band 0x0f) -shl 4) -bor ($uni -band 0x0f)
  $packet[15] = $net -band 0x7f
  $packet[16] = $Channels -shr 8
  $packet[17] = $Channels -band 0xff
  , $packet
}
$outputs = New-Object 'System.Collections.Generic.List[object]'
$outputsBySource = @{}
for ($internal = 0; $internal -lt $InternalUniverses; $internal++) {
  $key = $baseKey + $internal
  if ($key -gt 0x7fff) { continue }
  $output = [pscustomobject]@{
    Source = $internal; Key = $key; Net = ($key -shr 8) -band 0x7f; Sub = ($key -shr 4) -band 0x0f; Uni = $key -band 0x0f
    Sequence = 0; Packet = $null
  }
  $output.Packet = New-ArtDmxPacket $output.Net $output.Sub $output.Uni
  $outputs.Add($output)
  $outputsBySource[$internal] = @($output)
}

# --- Art-Net (UDP) -------------------------------------------------------------------------------
$udp = $null
try {
  $udp = New-Object System.Net.Sockets.UdpClient((New-Object System.Net.IPEndPoint($bindAddress, 0)))
  $udp.EnableBroadcast = $true
} catch {
  Stop-WithError "impossible d'ouvrir l'envoi Art-Net ($($_.Exception.Message)). L'adresse -Bind est-elle celle d'une carte réseau de ce PC ?"
}
$zeros = New-Object byte[] $Channels
$targetEndpoint = $null
$warnedNoTarget = $false
$lastUdpError = $null
$closeHandlerOn = $false

function Set-TargetEndpoint {
  if ($null -eq $script:relayTarget) { $script:targetEndpoint = $null }
  else { $script:targetEndpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($script:relayTarget), $ArtnetPort) }
  if ($script:closeHandlerOn) { [QuizzUpBlack]::Target = $script:targetEndpoint }
}
Set-TargetEndpoint

# Un univers de sortie : séquence 1 à 255 (0 = désactivée en Art-Net), canaux copiés dans le paquet préparé.
function Send-Output($output, [byte[]]$data) {
  $next = 1
  if ($output.Sequence -lt 255) { $next = $output.Sequence + 1 }
  $output.Sequence = $next
  $packet = $output.Packet
  $packet[12] = $next
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
  [pscustomobject]@{
    Data = $zeros; Buffer = (New-Object byte[] $Channels); FrameAt = 0.0; SentAt = [double]::NegativeInfinity
    Dirty = $false; Stale = $stale; Universe = 0
  }
}
$first = New-Source $true
$sourceList.Add($first)
$sourceMap[0] = $first
$mode = 'waiting'
$lastSentAt = [double]::NegativeInfinity
$blackoutUntil = 0
$packetsSent = 0

function Send-Source([int]$universe, [byte[]]$data) {
  foreach ($output in $outputsBySource[$universe]) { Send-Output $output $data }
}

# Noir de la fermeture de fenêtre (cf. QuizzUpBlack) : mêmes sorties que Send-Zeros, c'est-à-dire
# celles des univers déjà reçus.
function Update-CloseBlack {
  if (-not $script:closeHandlerOn) { return }
  [QuizzUpBlack]::Clear()
  foreach ($source in $sourceList) {
    foreach ($output in $outputsBySource[$source.Universe]) { [QuizzUpBlack]::AddOutput($output.Net, $output.Sub, $output.Uni) }
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

# Trame du navigateur : on garde la dernière de chaque univers, l'émission se fait une fois par tour
# (Send-Dirty) et jamais plus vite que $MinIntervalMs.
function Receive-Frame([int]$universe, [byte[]]$payload) {
  if ($script:mode -ne 'live') { Write-Log 'Trames reçues de l''écran de salle : envoi Art-Net en cours' }
  $script:mode = 'live'
  $source = $sourceMap[$universe]
  if ($null -eq $source) {
    $source = New-Source $false
    $source.Universe = $universe
    $sourceList.Add($source)
    $sourceMap[$universe] = $source
    if (-not $outputsBySource.ContainsKey($universe)) {
      Write-Log "Univers interne $universe reçu mais non mappé : ignoré"
    }
    Update-CloseBlack
  }
  [Array]::Copy($payload, 3, $source.Buffer, 0, $Channels)
  $source.Data = $source.Buffer
  $source.FrameAt = $clock.ElapsedMilliseconds
  $source.Stale = $false
  $source.Dirty = $true
  $script:framesThisTurn = $true
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

# --- Noir à la fermeture de la fenêtre ----------------------------------------------------------------
# Fermer la console (croix, déconnexion, arrêt de Windows) tue le script sans exécuter `finally` : le
# nœud garderait la dernière trame, stroboscope compris. Ce gestionnaire, en C# compilé par Add-Type
# (PowerShell ne peut pas être appelé depuis le fil du système), envoie lui-même des trames à zéro en
# UDP (séquence 0) sur les sorties déjà utilisées. SendBlack est aussi lancé tel quel par les tests.
$blackSource = @'
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;

public static class QuizzUpBlack
{
    public static UdpClient Udp;
    public static IPEndPoint Target;
    static readonly object Gate = new object();
    static readonly List<byte[]> Packets = new List<byte[]>();
    delegate bool Handler(int type);
    static Handler handler;

    [DllImport("kernel32.dll")]
    static extern bool SetConsoleCtrlHandler(Handler callback, bool add);

    public static void Clear()
    {
        lock (Gate) { Packets.Clear(); }
    }

    public static void AddOutput(int net, int sub, int uni)
    {
        byte[] packet = new byte[530];
        System.Text.Encoding.ASCII.GetBytes("Art-Net").CopyTo(packet, 0);
        packet[9] = 0x50;
        packet[11] = 14;
        packet[14] = (byte)(((sub & 0x0f) << 4) | (uni & 0x0f));
        packet[15] = (byte)(net & 0x7f);
        packet[16] = 2;
        lock (Gate) { Packets.Add(packet); }
    }

    // Trois passes : l'UDP n'est pas garanti.
    public static void SendBlack()
    {
        UdpClient udp = Udp;
        IPEndPoint target = Target;
        if (udp == null || target == null) { return; }
        byte[][] packets;
        lock (Gate) { packets = Packets.ToArray(); }
        for (int pass = 0; pass < 3; pass++)
        {
            foreach (byte[] packet in packets)
            {
                try { udp.Send(packet, packet.Length, target); } catch (Exception) { }
            }
            if (pass < 2) { Thread.Sleep(30); }
        }
    }

    static bool OnEvent(int type)
    {
        // 2 = fenêtre fermée, 5 = fin de session, 6 = arrêt de Windows.
        if (type == 2 || type == 5 || type == 6) { SendBlack(); }
        return false;
    }

    public static bool Install()
    {
        handler = OnEvent;
        return SetConsoleCtrlHandler(handler, true);
    }
}
'@

# --- Connexions WebSocket (TCP écrit à la main, boucle locale seulement) ----------------------------
# Pas d'HttpListener : HTTP.sys écoute sur toutes les cartes réseau, et ses tâches asynchrones faisaient
# perdre un tour de boucle entier (15 ms) par message. Ici, un TcpListener lié à 127.0.0.1, des sockets
# non bloquants et Socket.Select : le script se réveille à l'arrivée des données.
$connections = New-Object 'System.Collections.Generic.List[object]'
$client = $null
$framesThisTurn = $false
$sha1 = [System.Security.Cryptography.SHA1]::Create()
$latin1 = [System.Text.Encoding]::GetEncoding(28591)

function New-Connection($socket) {
  [pscustomobject]@{
    Socket = $socket; Buf = (New-Object byte[] $HandshakeMaxBytes); Len = 0; Handshaken = $false; Origin = $null
    HandshakeDeadline = (Get-Now) + $HelloTimeoutMs; Message = (New-Object System.IO.MemoryStream); MessageKind = $null
    Ready = $false; Closing = $false; Finished = $false; Discard = $false; CloseCode = 1006
    CloseDeadline = $null; HelloDeadline = $null
  }
}

# Envoi complet : sur une socket non bloquante, Send peut n'écrire qu'une partie du tampon ou refuser
# (tampon plein). On reprend où l'envoi s'est arrêté ; sans progrès pendant $SendStallMs, ou si la
# connexion est fermée, elle est coupée (1006).
function Send-Bytes($c, [byte[]]$bytes) {
  $sent = 0
  $stallEnd = $null
  while ($sent -lt $bytes.Length) {
    $err = [System.Net.Sockets.SocketError]::Success
    try { $n = $c.Socket.Send($bytes, $sent, $bytes.Length - $sent, [System.Net.Sockets.SocketFlags]::None, [ref]$err) }
    catch { Complete-Connection $c 1006; return }
    if ($err -eq [System.Net.Sockets.SocketError]::WouldBlock) {
      if ($null -eq $stallEnd) { $stallEnd = (Get-Now) + $SendStallMs }
      if ((Get-Now) -ge $stallEnd) { Complete-Connection $c 1006; return }
      try { [void]$c.Socket.Poll(5000, [System.Net.Sockets.SelectMode]::SelectWrite) } catch { Complete-Connection $c 1006; return }
      continue
    }
    if (($err -ne [System.Net.Sockets.SocketError]::Success) -or ($n -le 0)) { Complete-Connection $c 1006; return }
    $sent += $n
    $stallEnd = $null
  }
}

# Trame serveur -> client (jamais masquée, messages de moins de 64 Kio).
function Send-WsFrame($c, [int]$opcode, [byte[]]$payload) {
  if ($c.Finished) { return }
  $n = $payload.Length
  $headLength = 2
  if ($n -ge 126) { $headLength = 4 }
  $frame = New-Object byte[] ($headLength + $n)
  $frame[0] = 0x80 -bor $opcode
  if ($n -lt 126) { $frame[1] = $n } else { $frame[1] = 126; $frame[2] = $n -shr 8; $frame[3] = $n -band 0xff }
  [Array]::Copy($payload, 0, $frame, $headLength, $n)
  Send-Bytes $c $frame
}

function Add-Text($c, [string]$text) { Send-WsFrame $c 1 $utf8.GetBytes($text) }

function Limit-CloseReason([string]$reason) {
  while ($utf8.GetByteCount($reason) -gt 123) { $reason = $reason.Substring(0, $reason.Length - 1) }
  $reason
}

function Add-Close($c, [int]$code, [string]$reason) {
  if ($c.Closing -or $c.Finished) { return }
  $c.Closing = $true
  $c.CloseCode = $code
  $c.CloseDeadline = (Get-Now) + $CloseGraceMs
  $text = $utf8.GetBytes((Limit-CloseReason $reason))
  $payload = New-Object byte[] (2 + $text.Length)
  $payload[0] = $code -shr 8
  $payload[1] = $code -band 0xff
  [Array]::Copy($text, 0, $payload, 2, $text.Length)
  Send-WsFrame $c 8 $payload
}

function Add-Refuse($c, [int]$code, [string]$kind, [string]$message) {
  Write-Log "Écran de salle refusé : $message"
  Add-Text $c (Get-ErrorJson $kind $message)
  Add-Close $c $code $message
}

# Erreur de protocole du navigateur : fermeture, et plus rien n'est lu (la fermeture du navigateur
# ou le délai de grâce finit la connexion).
function Stop-Protocol($c, [int]$code, [string]$reason) {
  Add-Close $c $code $reason
  $c.Discard = $true
}

# Fin de la connexion : le chien de garde passe au noir si l'écran de salle avait été accepté.
function Complete-Connection($c, [int]$code) {
  if ($c.Finished) { return }
  $c.Finished = $true
  if ($script:client -eq $c) {
    $script:client = $null
    if ($c.Ready) {
      Write-Log "Écran de salle déconnecté (code $code)"
      if ($script:mode -ne 'waiting') { Start-Blackout 'écran de salle déconnecté' }
    }
  }
}

function Remove-Connection($c) {
  try { $c.Socket.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch { }
  try { $c.Socket.Close() } catch { }
  [void]$connections.Remove($c)
}

# Une connexion est vivante tant que le navigateur n'a ni fermé ni coupé la sienne.
function Test-Alive($c) {
  if ($c.Finished) { return $false }
  try { -not ($c.Socket.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and ($c.Socket.Available -eq 0)) } catch { $false }
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
    ',"universes":' + $AnnouncedUniverses + ',"artnet":{"target":' + $shown + ',"port":' + $ArtnetPort +
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
  $universe = ([int]$bytes[1] -shl 8) -bor $bytes[2]
  if ($universe -ge $InternalUniverses) {
    Add-Refuse $c $CloseUniverse 'universe' "trame pour l'univers $universe (univers 0 à $($InternalUniverses - 1))"
    return
  }
  Receive-Frame $universe $bytes
}

function Get-EchoCode([int]$code) {
  if ((($code -ge 1000) -and ($code -le 1003)) -or (($code -ge 1007) -and ($code -le 1014)) -or (($code -ge 3000) -and ($code -le 4999))) { return $code }
  1000
}

# Réponse HTTP d'un refus, puis fin de la connexion (jamais acceptée comme écran de salle).
function Send-Http($c, [int]$status, [string]$reason, [string]$text) {
  $body = $utf8.GetBytes("$text`n")
  $head = $utf8.GetBytes("HTTP/1.1 $status $reason`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
  try { [void]$c.Socket.Send($head); [void]$c.Socket.Send($body) } catch { }
  $c.Finished = $true
}

# Poignée de main HTTP -> WebSocket. Mêmes contrôles et même ordre que le pont : hôte, origine, requête.
function Step-Handshake($c) {
  $text = $latin1.GetString($c.Buf, 0, $c.Len)
  $end = $text.IndexOf("`r`n`r`n")
  if ($end -lt 0) {
    if ($c.Len -ge $c.Buf.Length) { Send-Http $c 400 'Bad Request' 'Requête trop longue' }
    return
  }
  $rest = $c.Len - ($end + 4)
  if ($rest -gt 0) { [Array]::Copy($c.Buf, $end + 4, $c.Buf, 0, $rest) }
  $c.Len = $rest
  $lines = $text.Substring(0, $end) -split "`r`n"
  $headers = @{}
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    $colon = $line.IndexOf(':')
    if ($colon -gt 0) { $headers[$line.Substring(0, $colon).Trim().ToLowerInvariant()] = $line.Substring($colon + 1).Trim() }
  }
  $isUpgrade = ($lines[0] -match '^GET \S+ HTTP/1\.1$') -and ($headers['upgrade'] -ieq 'websocket') -and ($headers['connection'] -match '(?i)\bupgrade\b')
  if (-not $isUpgrade) {
    Send-Http $c 426 'Upgrade Required' 'Pont QuizzUp Art-Net actif : connexion WebSocket attendue.'
    return
  }
  # Protection contre le « DNS rebinding » : seuls 127.0.0.1 et localhost sont acceptés comme hôte.
  $hostHeader = "$($headers['host'])".ToLowerInvariant()
  $allowedHosts = @("127.0.0.1:$Port", "localhost:$Port")
  if ($Port -eq 80) { $allowedHosts += @('127.0.0.1', 'localhost') }
  if ($allowedHosts -notcontains $hostHeader) {
    $shownHost = if ($hostHeader) { $hostHeader } else { '(absent)' }
    Write-Log "Connexion refusée : hôte inattendu « $shownHost »"
    Send-Http $c 403 'Forbidden' 'Hôte refusé'
    return
  }
  $rawOrigin = $headers['origin']
  $origin = $null
  if ($rawOrigin) { $origin = Get-NormalizedOrigin $rawOrigin }
  if ((-not $origin) -or (-not $origins.Contains($origin))) {
    $shown = if ($rawOrigin) { $rawOrigin } else { '(absente)' }
    Write-Log "Connexion refusée : origine « $shown » non autorisée (autorisées : $($origins -join ', '))"
    Send-Http $c 403 'Forbidden' 'Origine non autorisée'
    return
  }
  $key = $headers['sec-websocket-key']
  $keyOk = $false
  try { $keyOk = ([Convert]::FromBase64String("$key").Length -eq 16) } catch { }
  if (($headers['sec-websocket-version'] -ne '13') -or (-not $keyOk)) {
    Send-Http $c 400 'Bad Request' 'Requête WebSocket invalide'
    return
  }
  $accept = [Convert]::ToBase64String($sha1.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($key + $WsGuid)))
  Send-Bytes $c ([System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 101 Switching Protocols`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Accept: $accept`r`n`r`n"))
  if ($c.Finished) { return }
  $c.Handshaken = $true
  $c.Origin = $origin
  # Une connexion en place qui n'est plus vivante (coupure nette) libère sa place avant le refus « busy ».
  if (($null -ne $script:client) -and (-not (Test-Alive $script:client))) {
    $dead = $script:client
    Complete-Connection $dead 1006
    Remove-Connection $dead
  }
  if ($script:client) {
    # Connexion acceptée puis refusée par message : le navigateur affiche la raison.
    Write-Log "Connexion refusée depuis $origin : un écran de salle est déjà connecté"
    Add-Text $c (Get-ErrorJson 'busy' $BusyMessage)
    Add-Close $c $CloseBusy $BusyMessage
    return
  }
  $script:client = $c
  $c.HelloDeadline = (Get-Now) + $HelloTimeoutMs
}

# Une trame complète reçue du navigateur (déjà démasquée).
function Receive-WsFrame($c, [int]$opcode, [bool]$fin, [byte[]]$payload) {
  if ($opcode -eq 9) {
    if (-not $c.Closing) { Send-WsFrame $c 10 $payload }
    return
  }
  if ($opcode -eq 10) { return }
  if ($opcode -eq 8) {
    $peerCode = 1005
    if ($payload.Length -ge 2) { $peerCode = ([int]$payload[0] -shl 8) -bor $payload[1] }
    if (-not $c.Closing) {
      # Écho de la fermeture, comme l'exige la RFC.
      $c.Closing = $true
      $c.CloseCode = $peerCode
      $echo = Get-EchoCode $peerCode
      Send-WsFrame $c 8 ([byte[]]@(($echo -shr 8), ($echo -band 0xff)))
    }
    Complete-Connection $c $c.CloseCode
    return
  }
  if ($c.Closing) { return }   # fermeture en cours : les données encore en route sont ignorées
  if (($opcode -eq 0) -and ($null -eq $c.MessageKind)) { Stop-Protocol $c 1002 'Fragment inattendu'; return }
  if (($opcode -ne 0) -and ($null -ne $c.MessageKind)) { Stop-Protocol $c 1002 'Message fragmenté interrompu'; return }
  if (($c.Message.Length + $payload.Length) -gt $FrameBytes) { Stop-Protocol $c 1009 'Message trop long'; return }
  $kind = $c.MessageKind
  if ($opcode -ne 0) { $kind = if ($opcode -eq 1) { 'text' } else { 'binary' } }
  if (-not $fin) {
    $c.MessageKind = $kind
    $c.Message.Write($payload, 0, $payload.Length)
    return
  }
  $bytes = $payload
  if ($null -ne $c.MessageKind) {
    $c.Message.Write($payload, 0, $payload.Length)
    $bytes = $c.Message.ToArray()
    $c.Message.SetLength(0)
    $c.MessageKind = $null
  }
  if ($kind -eq 'text') {
    try { [void]$utf8Strict.GetString($bytes) } catch { Stop-Protocol $c 1007 'Texte UTF-8 invalide'; return }
  }
  Receive-Message $c $kind $bytes
}

# Découpe le tampon en trames (le client les masque toujours) et les remet une à une.
function Step-Frames($c) {
  $buf = $c.Buf
  $pos = 0
  while ((-not $c.Finished) -and (-not $c.Discard)) {
    $avail = $c.Len - $pos
    if ($avail -lt 2) { break }
    $b0 = $buf[$pos]
    $b1 = $buf[$pos + 1]
    $opcode = $b0 -band 0x0f
    $length = $b1 -band 0x7f
    $headLength = 2
    if (($b0 -band 0x70) -ne 0) { Stop-Protocol $c 1002 'Extension non négociée'; break }
    if (($b1 -band 0x80) -eq 0) { Stop-Protocol $c 1002 'Trame client non masquée'; break }
    $fin = ($b0 -band 0x80) -ne 0
    if ($opcode -ge 8) {
      if (($opcode -gt 10) -or (-not $fin) -or ($length -gt 125)) { Stop-Protocol $c 1002 'Trame invalide'; break }
    } elseif ($opcode -gt 2) { Stop-Protocol $c 1002 'Trame invalide'; break }
    if ($length -eq 126) {
      if ($avail -lt 4) { break }
      $length = ([int]$buf[$pos + 2] -shl 8) -bor $buf[$pos + 3]
      $headLength = 4
    } elseif ($length -eq 127) {
      # Longueur sur 64 bits : toujours bien au-delà d'une trame de 515 octets.
      Stop-Protocol $c 1009 'Message trop long'
      break
    }
    if ($length -gt $FrameBytes) { Stop-Protocol $c 1009 'Message trop long'; break }
    if ($avail -lt ($headLength + 4 + $length)) { break }
    $m = $pos + $headLength
    $m0 = $buf[$m]; $m1 = $buf[$m + 1]; $m2 = $buf[$m + 2]; $m3 = $buf[$m + 3]
    $from = $m + 4
    $payload = [byte[]]::new($length)
    $i = 0
    $last = $length - 3
    while ($i -lt $last) {   # démasquage par groupes de 4 octets (le plus lourd du chemin chaud)
      $payload[$i] = $buf[$from + $i] -bxor $m0
      $payload[$i + 1] = $buf[$from + $i + 1] -bxor $m1
      $payload[$i + 2] = $buf[$from + $i + 2] -bxor $m2
      $payload[$i + 3] = $buf[$from + $i + 3] -bxor $m3
      $i += 4
    }
    for (; $i -lt $length; $i++) { $payload[$i] = $buf[$from + $i] -bxor $buf[$m + ($i -band 3)] }
    $pos += $headLength + 4 + $length
    Receive-WsFrame $c $opcode $fin $payload
  }
  if ($pos -gt 0) {
    $rest = $c.Len - $pos
    if ($rest -gt 0) { [Array]::Copy($buf, $pos, $buf, 0, $rest) }
    $c.Len = $rest
  }
}

# Lit tout ce qui est arrivé (toutes les trames d'un coup), sans jamais attendre.
function Read-Connection($c) {
  $total = 0
  do {
    try { $n = $c.Socket.Receive($c.Buf, $c.Len, $c.Buf.Length - $c.Len, [System.Net.Sockets.SocketFlags]::None) }
    catch { Complete-Connection $c 1006; return }
    if ($n -le 0) { Complete-Connection $c $c.CloseCode; return }
    $total += $n
    if ($c.Discard) {
      $c.Len = 0
    } else {
      $c.Len += $n
      if (-not $c.Handshaken) { Step-Handshake $c }
      if ($c.Handshaken -and (-not $c.Finished)) { Step-Frames $c }
    }
    # Borne par tour : un client qui envoie sans fin ne doit pas retenir la boucle (échéances, chien de
    # garde, autres connexions). Le reste est relu au tour suivant, Select le signale aussitôt.
  } while ((-not $c.Finished) -and ($total -lt $ReadTurnMaxBytes) -and ($c.Socket.Available -gt 0))
}

# Échéances d'une connexion : jamais d'attente bloquante, tout est suivi par dates.
function Step-Deadlines($c) {
  if ($c.Finished) { return }
  $now = Get-Now
  if ((-not $c.Handshaken) -and ($now -gt $c.HandshakeDeadline)) { $c.Finished = $true; return }
  if ($c.HelloDeadline -and (-not $c.Closing) -and ($now -ge $c.HelloDeadline)) {
    $c.HelloDeadline = $null
    Add-Refuse $c $CloseHelloExpected 'hello' 'aucune présentation reçue'
  }
  if ($c.CloseDeadline -and ($now -ge $c.CloseDeadline)) {
    # Le navigateur n'a pas répondu à la fermeture : on coupe.
    Complete-Connection $c $c.CloseCode
  }
}

# Dernière trame de chaque univers reçu pendant ce tour : une seule émission par univers, jamais
# plus d'une toutes les $MinIntervalMs. Ce qui reste en attente part au prochain tour de Invoke-Tick.
function Send-Dirty {
  $now = Get-Now
  foreach ($source in $sourceList) {
    if ($source.Dirty -and (($now - $source.SentAt) -ge $MinIntervalMs)) {
      $source.Dirty = $false
      Send-Source $source.Universe $source.Data
      $source.SentAt = $now
    }
  }
}

# --- Démarrage -------------------------------------------------------------------------------------
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.ExclusiveAddressUse = $true
try {
  $listener.Start()
} catch {
  $udp.Close()
  $inner = $_.Exception.InnerException
  $busyPort = ($inner -is [System.Net.Sockets.SocketException]) -and (@(10048, 10013) -contains $inner.ErrorCode)
  if ($busyPort) { Stop-WithError "le port $Port est déjà utilisé (un autre relais ou pont tourne-t-il déjà ?)" }
  Stop-WithError "démarrage impossible : $($_.Exception.Message)"
}
$listenSocket = $listener.Server

# Fermer la fenêtre tue le script sans passer par `finally` : un gestionnaire de console compilé à la
# volée envoie alors lui-même du noir. Sans compilation possible (poste verrouillé), le script continue.
$closeHandlerOn = $false
try {
  Add-Type -TypeDefinition $blackSource -ErrorAction Stop
  [QuizzUpBlack]::Udp = $udp
  $closeHandlerOn = [QuizzUpBlack]::Install()
} catch { }
if ($closeHandlerOn) {
  Set-TargetEndpoint
  Update-CloseBlack
  Write-Log 'La fermeture de la fenêtre envoie du noir aux lumières (Ctrl+C reste la bonne façon d''arrêter).'
} else {
  Write-Host 'Attention : la fermeture de la fenêtre ne passera PAS les lumières au noir sur ce poste.' -ForegroundColor Yellow
  Write-Host 'Ne fermez pas cette fenêtre pendant une partie : arrêtez le relais par Ctrl+C.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Relais lumières QuizzUp $ScriptVersion" -ForegroundColor Cyan
Write-Log "Prêt : ws://127.0.0.1:$Port. Laissez cette fenêtre ouverte, Ctrl+C pour arrêter."
Write-Log "Écran de salle autorisé : $($origins -join ', ')"
if ($null -eq $relayTarget) { Write-Log 'Cible Art-Net : à régler dans l''écran de salle (vue Matériel)' }
else { Write-Log "Cible Art-Net : ${relayTarget}:$ArtnetPort (imposée par ce script)" }

$readable = New-Object System.Collections.ArrayList
$lastTick = Get-Now
$lastError = $null
try {
  while ($true) {
    $readable.Clear()
    [void]$readable.Add($listenSocket)
    foreach ($c in $connections) { [void]$readable.Add($c.Socket) }
    # Réveil dès qu'une donnée arrive ; 5 ms au plus pour suivre les échéances.
    [System.Net.Sockets.Socket]::Select($readable, $null, $null, 5000)
    try {
      # Les connexions d'abord : une fermeture déjà reçue libère la place avant d'accepter la suivante.
      foreach ($c in $connections.ToArray()) {
        if ($readable.Contains($c.Socket)) { Read-Connection $c }
        Step-Deadlines $c
        if ($c.Finished) { Remove-Connection $c }
      }
      if ($readable.Contains($listenSocket)) {
        while ($listener.Pending()) {
          $socket = $listener.AcceptSocket()
          $socket.Blocking = $false
          $socket.NoDelay = $true
          $connections.Add((New-Connection $socket))
        }
      }
      if ($framesThisTurn) {
        $framesThisTurn = $false
        Send-Dirty
      }
      if (((Get-Now) - $lastTick) -ge $TickMs) {
        $lastTick = Get-Now
        Invoke-Tick
      }
    } catch {
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
    try { if ($c.Handshaken -and (-not $c.Finished)) { Add-Close $c 1001 'Arrêt du pont' } } catch { }
    Remove-Connection $c
  }
  try { $listener.Stop() } catch { }
  try { $udp.Close() } catch { }
}
