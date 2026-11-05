// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DMX_USB_VENDOR_IDS } from '@hardware/dmx/serialOutput'

/** Kit « poste de salle » Windows : `deploy/poste-salle/` (lot L6). */
const KIT_DIR = fileURLToPath(new URL('../../../deploy/poste-salle/', import.meta.url))

/** Lit un fichier du kit ; gère UTF-16 LE/BE avec BOM et UTF-8 avec ou sans BOM. */
function readKitFile(name: string): string {
  const bytes = readFileSync(KIT_DIR + name)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le')
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le')
  }
  const text = bytes.toString('utf8')
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

/** ASCII imprimable + tabulation et fins de ligne. */
function isPlainAscii(text: string): boolean {
  return [...text].every((char) => {
    const code = char.codePointAt(0) ?? 0
    return code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0x7e)
  })
}

const ROOT_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome'
const PLACEHOLDER = 'https://salle.exemple.fr'

type RegSection = Record<string, string | number>
type RegFile = Record<string, RegSection>

const unescapeRegString = (raw: string) => raw.replaceAll('\\"', '"').replaceAll('\\\\', '\\')

/** Parse strict d'un .reg (sections, chaînes, dword) : toute ligne inconnue lève une erreur. */
function parseReg(text: string): RegFile {
  const lines = text.split(/\r?\n/)
  expect(lines[0]).toBe('Windows Registry Editor Version 5.00')
  const result: RegFile = {}
  let current: RegSection | null = null
  for (const [index, line] of lines.slice(1).entries()) {
    if (line.trim() === '' || line.startsWith(';')) continue
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch?.[1]) {
      current = result[sectionMatch[1]] ??= {}
      continue
    }
    const valueMatch = /^"([^"]+)"=(?:"((?:[^"\\]|\\.)*)"|dword:([0-9a-f]{8}))$/.exec(line)
    if (!current || !valueMatch?.[1]) throw new Error(`ligne ${index + 2} invalide : ${line}`)
    const [, name, quoted, dword] = valueMatch
    current[name] =
      quoted === undefined ? Number.parseInt(dword ?? '', 16) : unescapeRegString(quoted)
  }
  return result
}

describe('kit poste de salle : politiques Chrome (.reg)', () => {
  const text = readKitFile('politiques-chrome.reg')
  const reg = parseReg(text)
  const chrome: RegSection = reg[ROOT_KEY] ?? {}

  it('est ASCII (importable quel que soit l’encodage) et bien formé', () => {
    expect(isPlainAscii(text)).toBe(true)
    expect(reg[ROOT_KEY]).toBeDefined()
    for (const section of Object.keys(reg)) {
      expect(section === ROOT_KEY || section.startsWith(`${ROOT_KEY}\\`)).toBe(true)
    }
  })

  it('pose les réglages de salle sur la clé de politiques Chrome', () => {
    expect(chrome).toMatchObject({
      RestoreOnStartup: 5,
      TranslateEnabled: 0,
      DefaultNotificationsSetting: 2,
      DefaultPopupsSetting: 2,
    })
  })

  it('autorise Web Serial pour exactement les fabricants de DMX_USB_VENDOR_IDS', () => {
    const policy = JSON.parse(String(chrome.SerialAllowUsbDevicesForUrls)) as {
      devices: { vendor_id: number; product_id?: number }[]
      urls: string[]
    }[]
    expect(policy).toHaveLength(1)
    expect(policy[0]?.urls).toEqual([PLACEHOLDER])
    const devices = policy[0]?.devices ?? []
    const byValue = (left: number, right: number) => left - right
    expect(devices.map((device) => device.vendor_id).sort(byValue)).toEqual(
      [...DMX_USB_VENDOR_IDS].sort(byValue)
    )
    for (const device of devices) {
      expect(Number.isInteger(device.vendor_id)).toBe(true)
      expect(device.vendor_id).toBeLessThanOrEqual(0xffff)
    }
  })

  it.each([
    'AutoplayAllowlist',
    'LocalNetworkAccessAllowedForUrls',
    'LocalNetworkAllowedForUrls',
    'LoopbackNetworkAllowedForUrls',
  ])('liste l’origine de la salle dans %s', (policy) => {
    expect(reg[`${ROOT_KEY}\\${policy}`]).toEqual({ '1': PLACEHOLDER })
  })
})

describe('kit poste de salle : scripts PowerShell', () => {
  const installer = readKitFile('installer-poste.ps1')
  const uninstaller = readKitFile('desinstaller-poste.ps1')

  it('sont ASCII (PowerShell 5.1 lit mal l’UTF-8 sans BOM) et en 5.1 administrateur', () => {
    for (const script of [installer, uninstaller]) {
      expect(isPlainAscii(script)).toBe(true)
      expect(script).toContain('#Requires -Version 5.1')
      expect(script).toContain('#Requires -RunAsAdministrator')
    }
  })

  it('remplace le marqueur d’origine du .reg et importe en 64 bits', () => {
    expect(installer).toContain(`$OriginPlaceholder = '${PLACEHOLDER}'`)
    expect(installer).toMatch(/\.Replace\(\$OriginPlaceholder, \$origin\)/)
    expect(installer).toContain('politiques-chrome.reg')
    expect(installer).toMatch(/cmd\.exe \/c "reg\.exe import .* \/reg:64 >nul 2>nul"/)
  })

  it('exige -RoomUrl et accepte -BridgeTarget facultatif', () => {
    expect(installer).toMatch(/\[Parameter\(Mandatory = \$true\)\]\[string\]\$RoomUrl/)
    expect(installer).toMatch(/\[string\]\$BridgeTarget/)
    expect(installer).toMatch(/\[string\]\$RoomUser/)
    expect(installer).not.toMatch(/Mandatory = \$true\)\]\[string\]\$RoomUser/)
    expect(installer).not.toMatch(/Mandatory = \$true\)\]\[string\]\$BridgeTarget/)
  })

  it('respecte le contrat du pont Art-Net (L11)', () => {
    expect(installer).toContain("$BridgeExe = 'C:\\QuizzUp\\quizzup-artnet-bridge.exe'")
    expect(installer).toContain('"--origin $origin"')
    expect(installer).toContain('" --target $BridgeTarget"')
    expect(installer).toMatch(/-RestartCount \d+/)
    expect(installer).toContain('Unblock-File')
    // Exe absent : avertissement, pas d'échec.
    expect(installer).toMatch(/Write-Warning[^\n]*\$BridgeExe/)
  })

  it('lance le pont en SYSTEM au démarrage (sans fenêtre), avec répétition chaque minute', () => {
    expect(installer).toContain(
      "New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest"
    )
    expect(installer).toContain('New-ScheduledTaskTrigger -AtStartup')
    expect(installer).not.toContain('-AtLogOn')
    expect(installer).not.toContain('-LogonType Interactive')
    expect(installer).toMatch(
      /\$taskTrigger\.Repetition = .*-RepetitionInterval \(New-TimeSpan -Minutes 1\)/
    )
    expect(installer).toContain('-MultipleInstances IgnoreNew')
  })

  it('verrouille C:\\QuizzUp (SYSTEM exécute l’exe) et ouvre UDP 6454 au pare-feu', () => {
    expect(installer).toContain("$BridgeDir = 'C:\\QuizzUp'")
    expect(installer).toContain('/inheritance:r')
    expect(installer).toContain("'*S-1-5-32-544:(OI)(CI)F'")
    expect(installer).toContain("'*S-1-5-18:(OI)(CI)F'")
    expect(installer).toContain("'*S-1-5-32-545:(OI)(CI)RX'")
    expect(installer).toContain('/setowner')
    expect(installer).toContain('$ArtNetPort = 6454')
    expect(installer).toContain('Remove-NetFirewallRule')
    expect(installer).toMatch(
      /New-NetFirewallRule -DisplayName \$FirewallRuleName -Program \$BridgeExe -Direction Inbound -Protocol UDP `\s+-LocalPort \$ArtNetPort -Profile Private, Domain -Action Allow/
    )
  })

  it('crée raccourci et profil Chrome pour le compte de la salle (LOCALAPPDATA)', () => {
    expect(installer).toContain('Win32_ComputerSystem')
    expect(installer).toContain('WindowsIdentity]::GetCurrent().Name')
    expect(installer).toContain('ProfileList')
    expect(installer).toContain("Join-Path $room.LocalAppData 'QuizzUp\\chrome-profile'")
    expect(installer).toContain('Join-Path $room.Startup $ShortcutName')
    expect(installer).not.toContain('C:\\QuizzUp\\chrome-profile')
    expect(installer).toContain('SmartActiveHoursState -Value 0')
  })

  it('crée un raccourci kiosque Chrome (jamais Edge) avec les replis', () => {
    expect(installer).toContain("'--kiosk'")
    expect(installer).toContain('"--app=$($uri.AbsoluteUri)"')
    expect(installer).toContain("'--autoplay-policy=no-user-gesture-required'")
    expect(installer).toContain('Google\\Chrome\\Application\\chrome.exe')
    expect(installer).toContain("GetFolderPath('Startup')")
    for (const script of [installer, uninstaller]) {
      expect(script.toLowerCase()).not.toContain('msedge')
    }
  })

  it('règle énergie et heures actives sans stratégie de groupe (valable sur Home)', () => {
    expect(installer).toContain('standby-timeout-ac')
    expect(installer).toContain('monitor-timeout-ac')
    // Sous-groupe USB / mise en veille sélective USB.
    expect(installer).toContain('2a737441-1930-4402-8d77-b2bebba308a3')
    expect(installer).toContain('48e6b7a6-50f5-4782-a5d4-53bb8f07e226')
    expect(installer).toContain('WindowsUpdate\\UX\\Settings')
    expect(installer).not.toContain('Policies\\Microsoft\\Windows\\WindowsUpdate')
  })

  it('le désinstalleur relit le .reg, supprime tâche, raccourci et réglages', () => {
    expect(uninstaller).toContain('politiques-chrome.reg')
    expect(uninstaller).toContain('Unregister-ScheduledTask')
    expect(uninstaller).toMatch(/ActiveHoursStart -Value 8 /)
    expect(uninstaller).toMatch(/ActiveHoursEnd -Value 17 /)
    expect(uninstaller).toContain('Remove-NetFirewallRule')
    expect(uninstaller).toContain('Stop-Process -Name')
    expect(uninstaller).toContain('hibernate-timeout-ac')
    expect(uninstaller).toContain('[string]$RoomUser')
    // Mêmes noms de tâche et de raccourci des deux côtés.
    for (const line of [
      "$TaskName = 'QuizzUp - Pont Art-Net'",
      "$ShortcutName = 'QuizzUp - Ecran de salle.lnk'",
    ]) {
      expect(installer).toContain(line)
      expect(uninstaller).toContain(line)
    }
  })

  it('le README du kit et le guide de recette se renvoient l’un à l’autre', () => {
    const readme = readKitFile('README.md')
    expect(readme).toContain('SmartScreen')
    expect(readme).toContain('Smart App Control')
    expect(readme).toContain('profil **Privé**')
    expect(readme).toContain('Exécuter quand même')
    expect(readme).toContain('installer-poste.ps1')
    const guide = readFileSync(
      fileURLToPath(new URL('../../../docs/recette/guide-de-test.md', import.meta.url)),
      'utf8'
    )
    expect(guide).toContain('deploy/poste-salle/')
  })
})
