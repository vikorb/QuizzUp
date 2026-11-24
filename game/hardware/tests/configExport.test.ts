import type { RoomHardwareConfig } from '@hardware/config'
import {
  defaultRoomHardwareConfig,
  exportRoomConfig,
  parseRoomConfigImport,
  parseRoomHardwareConfig,
  ROOM_CONFIG_EXPORT_FORMAT,
  ROOM_CONFIG_IMPORT_MAX_BYTES,
  ROOM_HARDWARE_CONFIG_VERSION,
  withoutSmokeEscalation,
} from '@hardware/config'
import type { SmokeSafetyConfig } from '@hardware/lighting/smoke'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'

const NOW = new Date('2026-11-24T10:00:00.000Z')

/** Salle équipée, fumée armée sur un relais : le cas où un import ferait le plus de dégâts. */
function equippedRoom(smoke: Partial<SmokeSafetyConfig> = {}): RoomHardwareConfig {
  return parseRoomHardwareConfig({
    desksCount: 6,
    setupDone: true,
    buzzers: {
      keymap: { KeyQ: { desk: 1, button: 'A' } },
      source: { kind: 'gamepad', match: 'BU0836' },
    },
    lighting: {
      driver: 'artnet-bridge',
      artnet: { target: '192.168.1.50' },
      fixtures: [
        { id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 },
        { id: 'fond', name: 'PAR fond', profileId: 'par-rgb', address: 1, universe: 1 },
        { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 },
      ],
      bindings: { round_started: null },
      smoke: {
        enabled: true,
        maxDurationMs: 2_000,
        cooldownMs: 60_000,
        maxLevel: 200,
        requireConfirmation: true,
        ...smoke,
      },
    },
  }).config
}

const fileOf = (config: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: ROOM_CONFIG_EXPORT_FORMAT,
    schema: ROOM_HARDWARE_CONFIG_VERSION,
    exportedAt: NOW.toISOString(),
    config,
    ...extra,
  })

const imported = (text: string) => {
  const result = parseRoomConfigImport(text)
  if (!result.ok) {
    throw new Error(`import refusé : ${result.message}`)
  }
  return result
}

describe('export de la configuration d’une salle', () => {
  it('nomme le fichier avec la salle et la date, sans caractère douteux', () => {
    const named = (roomName: string) =>
      exportRoomConfig(defaultRoomHardwareConfig(), { roomName, now: NOW }).fileName
    expect(named('Escape Café n°1 !')).toBe('quizzup-salle-escape-cafe-n-1-2026-11-24.json')
    expect(named('../../etc/passwd')).toBe('quizzup-salle-etc-passwd-2026-11-24.json')
    expect(named('  ')).toBe('quizzup-salle-salle-2026-11-24.json')
    expect(named('a'.repeat(100))).toBe(`quizzup-salle-${'a'.repeat(40)}-2026-11-24.json`)
  })

  it('écrit l’enveloppe versionnée', () => {
    const { content } = exportRoomConfig(equippedRoom(), { roomName: 'Salle', now: NOW })
    const file = JSON.parse(content)
    expect(file).toMatchObject({
      format: 'quizzup-room-config',
      schema: ROOM_HARDWARE_CONFIG_VERSION,
      exportedAt: '2026-11-24T10:00:00.000Z',
    })
    expect(Object.keys(file).sort()).toEqual(['config', 'exportedAt', 'format', 'schema'])
  })

  it('n’exporte jamais la fumée activée, la dispense de relais ni l’assistant terminé', () => {
    const room = equippedRoom({ cutsOnSignalLoss: true })
    expect(room.lighting.smoke).toMatchObject({ enabled: true, cutsOnSignalLoss: true })
    expect(room.setupDone).toBe(true)

    const { config } = JSON.parse(exportRoomConfig(room, { roomName: 'S', now: NOW }).content)
    expect(config.lighting.smoke.enabled).toBe(false)
    expect(config.lighting.smoke).not.toHaveProperty('cutsOnSignalLoss')
    expect(config).not.toHaveProperty('setupDone')
    // Les autres réglages de fumée restent, pour que l'assistant les reprenne.
    expect(config.lighting.smoke).toMatchObject({ maxDurationMs: 2_000, cooldownMs: 60_000 })
  })

  it('n’exporte ni clé étrangère ni identifiant de compte', () => {
    const room = {
      ...equippedRoom(),
      accountId: 'compte-42',
      token: 'jeton-secret',
      lighting: { ...equippedRoom().lighting, apiKey: 'cle-secrete' },
    } as unknown as RoomHardwareConfig
    const { content } = exportRoomConfig(room, { roomName: 'S', now: NOW })
    expect(content).not.toMatch(/compte-42|jeton-secret|cle-secrete|accountId|token|apiKey/)
  })
})

describe('import de la configuration d’une salle', () => {
  it('aller-retour : l’import rend la config exportée, sauf les champs forcés', () => {
    const room = equippedRoom({ cutsOnSignalLoss: true })
    const { content } = exportRoomConfig(room, { roomName: 'Salle', now: NOW })
    const result = imported(content)

    const { setupDone: _setupDone, ...expected } = room
    const { cutsOnSignalLoss: _cuts, ...smoke } = room.lighting.smoke
    expect(result.config).toEqual({
      ...expected,
      lighting: { ...room.lighting, smoke: { ...smoke, enabled: false } },
    })
    expect(result.problems).toEqual([])
    expect(result.summary).toEqual({
      desks: 6,
      fixtures: 3,
      driver: 'artnet-bridge',
      universes: [0, 1],
    })
  })

  it('un second aller-retour ne change plus rien', () => {
    const first = imported(exportRoomConfig(equippedRoom(), { roomName: 'S', now: NOW }).content)
    const second = imported(exportRoomConfig(first.config, { roomName: 'S', now: NOW }).content)
    expect(second.config).toEqual(first.config)
  })

  it('reprend la cible Art-Net, les buzzers appris et les points du plan comme point de départ', () => {
    const room = equippedRoom()
    const { config } = imported(exportRoomConfig(room, { roomName: 'S', now: NOW }).content)
    expect(config.lighting.artnet).toEqual({ target: '192.168.1.50' })
    expect(config.buzzers.keymap).toEqual(room.buzzers.keymap)
    expect(config.plan).toEqual(room.plan)
  })

  it('désactive la fumée qu’un fichier active, même avec la dispense de relais', () => {
    const hostile = fileOf({
      ...equippedRoom(),
      lighting: {
        ...equippedRoom().lighting,
        smoke: { enabled: true, cutsOnSignalLoss: true, requireConfirmation: false },
      },
    })
    const result = imported(hostile)
    expect(result.config.lighting.smoke.enabled).toBe(false)
    expect(result.config.lighting.smoke).not.toHaveProperty('cutsOnSignalLoss')
    expect(result.smokeDisabled).toBe(true)
  })

  it('ne signale pas de faux problème de relais pour la fumée qu’il désactive', () => {
    const result = imported(
      fileOf({
        lighting: {
          fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 40 }],
          smoke: { enabled: true },
        },
      })
    )
    expect(result.smokeDisabled).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('signale seulement quand le fichier armait réellement la fumée', () => {
    const quiet = imported(exportRoomConfig(equippedRoom(), { roomName: 'S', now: NOW }).content)
    expect(quiet.smokeDisabled).toBe(false)
  })

  it('refait passer par l’assistant : `setupDone` d’un fichier est ignoré', () => {
    const result = imported(fileOf({ ...equippedRoom(), setupDone: true }))
    expect(result.config).not.toHaveProperty('setupDone')
  })

  it('écarte les champs en trop sans les garder', () => {
    const result = imported(
      fileOf(
        { ...equippedRoom(), secret: 'x', lighting: { ...equippedRoom().lighting, extra: 1 } },
        { accountId: 'compte-42' }
      )
    )
    expect(JSON.stringify(result.config)).not.toMatch(/secret|extra|compte-42/)
  })

  it('ne se laisse pas piéger par `__proto__` dans un fichier hostile', () => {
    const text = fileOf(equippedRoom()).replace(
      '"config":{',
      '"config":{"__proto__":{"polluted":true},'
    )
    const result = imported(text)
    expect(result.config).not.toHaveProperty('polluted')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('ramène les nombres hors bornes et écarte une IP non locale avec un problème', () => {
    const result = imported(
      fileOf({
        desksCount: 99,
        lighting: {
          refreshHz: 100_000,
          artnet: { target: '8.8.8.8' },
          smoke: { maxDurationMs: 9e9, cooldownMs: -5, maxLevel: 1e6 },
        },
      })
    )
    expect(result.config.desksCount).toBe(6)
    expect(result.config.lighting.refreshHz).toBe(40)
    expect(result.config.lighting).not.toHaveProperty('artnet')
    expect(result.config.lighting.smoke.maxDurationMs).toBe(SMOKE_HARD_LIMITS.maxDurationMs)
    expect(result.config.lighting.smoke.cooldownMs).toBe(SMOKE_HARD_LIMITS.minCooldownMs)
    expect(result.config.lighting.smoke.maxLevel).toBe(255)
    expect(result.problems.join('\n')).toContain('8.8.8.8')
  })

  describe('refus', () => {
    const refusal = (text: string) => {
      const result = parseRoomConfigImport(text)
      return result.ok ? null : result
    }

    it('JSON invalide', () => {
      expect(refusal('{ pas du json')).toMatchObject({ reason: 'invalid_json' })
      expect(refusal('')).toMatchObject({ reason: 'invalid_json' })
    })

    it('JSON valide mais pas un fichier d’export', () => {
      for (const text of ['null', '[]', '42', '"x"', '{}', '{"config":{}}']) {
        expect(refusal(text)).toMatchObject({ reason: 'wrong_format' })
      }
      expect(refusal(fileOf({}).replace('quizzup-room-config', 'autre'))).toMatchObject({
        reason: 'wrong_format',
      })
    })

    it('version plus récente, avec un message lisible', () => {
      const result = refusal(fileOf({}, { schema: ROOM_HARDWARE_CONFIG_VERSION + 1 }))
      expect(result).toMatchObject({ reason: 'newer_schema' })
      expect(result?.message).toContain('version plus récente')
    })

    it('version absente, non entière ou nulle', () => {
      for (const schema of [undefined, '1', 0, -1, 1.5, null]) {
        expect(refusal(fileOf({}, { schema }))).toMatchObject({ reason: 'invalid_schema' })
      }
    })

    it('configuration absente ou qui n’est pas un objet', () => {
      for (const config of [undefined, null, [], 'x', 3]) {
        expect(refusal(fileOf(config))).toMatchObject({ reason: 'invalid_config' })
      }
    })

    it('fichier trop gros, en octets et non en caractères', () => {
      const big = fileOf({ pad: 'x'.repeat(ROOM_CONFIG_IMPORT_MAX_BYTES) })
      expect(refusal(big)).toMatchObject({ reason: 'too_large' })
      // 40 000 caractères de 2 octets : sous la limite en caractères, au-dessus en octets.
      const accents = fileOf({}, { pad: 'é'.repeat(40_000) })
      expect(accents.length).toBeLessThan(ROOM_CONFIG_IMPORT_MAX_BYTES)
      expect(refusal(accents)).toMatchObject({ reason: 'too_large' })
    })

    it('un fichier juste sous la limite passe', () => {
      const text = fileOf({}, { pad: 'x'.repeat(ROOM_CONFIG_IMPORT_MAX_BYTES - 200) })
      expect(parseRoomConfigImport(text).ok).toBe(true)
    })

    it('ne lève jamais : imbrication extrême, entrée qui n’est pas une chaîne', () => {
      expect(refusal('['.repeat(60_000))).toMatchObject({ reason: 'invalid_json' })
      const deep = '{"a":'.repeat(5_000) + '1' + '}'.repeat(5_000)
      const text = fileOf({}).replace('"config":{}', `"config":{"lighting":{"smoke":${deep}}}`)
      expect(() => parseRoomConfigImport(text)).not.toThrow()
      expect(refusal(undefined as unknown as string)).toMatchObject({ reason: 'too_large' })
    })
  })
})

describe('garde-fou fumée : withoutSmokeEscalation', () => {
  const room = equippedRoom({ cutsOnSignalLoss: true })
  const withSmoke = (config: RoomHardwareConfig, smoke: Partial<SmokeSafetyConfig>) => ({
    ...config,
    lighting: { ...config.lighting, smoke: { ...config.lighting.smoke, ...smoke } },
  })
  const smokeAfter = (previous: RoomHardwareConfig, smoke: Partial<SmokeSafetyConfig>) =>
    withoutSmokeEscalation(previous, withSmoke(previous, smoke)).lighting.smoke

  const disarmed = withSmoke(room, { enabled: false })

  it('n’active jamais une fumée désactivée', () => {
    expect(smokeAfter(disarmed, { enabled: true }).enabled).toBe(false)
  })

  it('ne remet pas la dispense de relais quand la salle ne l’a pas', () => {
    const bare = withSmoke(room, { cutsOnSignalLoss: false })
    expect(smokeAfter(bare, { cutsOnSignalLoss: true })).not.toHaveProperty('cutsOnSignalLoss')
  })

  it('retire la dispense de relais quand le nouveau réglage ne la porte plus', () => {
    expect(smokeAfter(room, { cutsOnSignalLoss: false })).not.toHaveProperty('cutsOnSignalLoss')
  })

  it('ne retire jamais l’armement par l’opérateur', () => {
    expect(smokeAfter(room, { requireConfirmation: false }).requireConfirmation).toBe(true)
  })

  it('n’allonge jamais un jet', () => {
    expect(smokeAfter(room, { maxDurationMs: 9_000 }).maxDurationMs).toBe(2_000)
  })

  it('ne rapproche jamais deux jets', () => {
    expect(smokeAfter(room, { cooldownMs: 5_000 }).cooldownMs).toBe(60_000)
  })

  it('ne renforce jamais le niveau maximal', () => {
    expect(smokeAfter(room, { maxLevel: 255 }).maxLevel).toBe(200)
  })

  it('accepte ce qui restreint : désactivation, jet plus court, pause plus longue, niveau plus bas', () => {
    expect(
      smokeAfter(room, { enabled: false, maxDurationMs: 1_000, cooldownMs: 90_000, maxLevel: 100 })
    ).toMatchObject({ enabled: false, maxDurationMs: 1_000, cooldownMs: 90_000, maxLevel: 100 })
  })

  it('laisse la fumée telle quelle quand rien ne change, et ne touche à rien d’autre', () => {
    const next = { ...room, desksCount: 3 }
    expect(withoutSmokeEscalation(room, next)).toEqual(next)
  })

  it('l’import d’une salle plus permissive ne desserre rien, même sur une salle active', () => {
    const file = exportRoomConfig(
      equippedRoom({ maxDurationMs: 9_000, cooldownMs: 5_000, maxLevel: 255 }),
      { roomName: 'S', now: NOW }
    ).content
    const result = withoutSmokeEscalation(room, imported(file).config)
    expect(result.lighting.smoke).toEqual({
      enabled: false,
      maxDurationMs: 2_000,
      cooldownMs: 60_000,
      maxLevel: 200,
      requireConfirmation: true,
    })
  })
})
