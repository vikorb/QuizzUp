import type { RoomHardwareConfig } from '@hardware/config'
import {
  defaultRoomHardwareConfig,
  exportRoomConfig,
  parseRoomConfigImport,
  parseRoomHardwareConfig,
  withoutSmokeEscalation,
  withoutUnknownKeys,
} from '@hardware/config'
import type { SmokeBoardConfig } from '@hardware/lighting/smoke'
import { normalizeSmokeSafety, parseSmokeBoard } from '@hardware/lighting/smoke'

const NOW = new Date('2026-11-24T10:00:00.000Z')
const BOARD: SmokeBoardConfig = { kind: 'uno-serial', usbVendorId: 0x2341, usbProductId: 0x0043 }
const FUMEE = { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }

/** Salle avec une carte de fumée et la fumée activée (profil à relais). */
function roomWith(board: unknown, smoke: Record<string, unknown> = {}): RoomHardwareConfig {
  return parseRoomHardwareConfig({
    lighting: {
      fixtures: [FUMEE],
      smoke: {
        enabled: true,
        maxDurationMs: 2_000,
        cooldownMs: 60_000,
        maxLevel: 200,
        ...smoke,
        ...(board === undefined ? {} : { board }),
      },
    },
  }).config
}

const imported = (text: string) => {
  const result = parseRoomConfigImport(text)
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result
}

describe('lighting.smoke.board : relecture tolérante', () => {
  it('relit une carte valide, telle quelle', () => {
    const room = roomWith(BOARD)
    expect(room.lighting.smoke.board).toEqual(BOARD)
    expect(room.lighting.smoke.enabled).toBe(true)
  })

  it('est facultatif : une config d’avant n’a pas de carte et reste inchangée', () => {
    expect(roomWith(undefined).lighting.smoke).not.toHaveProperty('board')
    expect(defaultRoomHardwareConfig().lighting.smoke).not.toHaveProperty('board')
    expect(normalizeSmokeSafety({})).not.toHaveProperty('board')
  })

  it('ne garde que les trois champs connus', () => {
    const room = roomWith({ ...BOARD, port: 'COM3', secret: 'x' })
    expect(room.lighting.smoke.board).toEqual(BOARD)
  })

  it.each([
    ['un autre type de carte', { ...BOARD, kind: 'mega' }],
    ['un identifiant négatif', { ...BOARD, usbVendorId: -1 }],
    ['un identifiant trop grand', { ...BOARD, usbProductId: 0x10000 }],
    ['un identifiant décimal', { ...BOARD, usbVendorId: 1.5 }],
    ['un identifiant texte', { ...BOARD, usbVendorId: '2341' }],
    ['un champ manquant', { kind: 'uno-serial', usbVendorId: 0x2341 }],
    ['un texte', 'COM3'],
    ['une liste', [BOARD]],
    ['null', null],
  ])(
    'carte illisible (%s) : fumée désactivée avec un problème, jamais le seul DMX',
    (_name, board) => {
      const parsed = parseRoomHardwareConfig({
        lighting: { fixtures: [FUMEE], smoke: { enabled: true, board } },
      })
      expect(parsed.config.lighting.smoke.enabled).toBe(false)
      expect(parsed.config.lighting.smoke).not.toHaveProperty('board')
      expect(parsed.problems.join(' ')).toMatch(/carte de la fumée est illisible/)
    }
  )

  it('parseSmokeBoard : rend undefined pour tout ce qui n’est pas une carte', () => {
    expect(parseSmokeBoard(BOARD)).toEqual(BOARD)
    expect(parseSmokeBoard(undefined)).toBeUndefined()
    expect(parseSmokeBoard({})).toBeUndefined()
  })

  it('aller-retour de relecture : relire une config relue ne change rien, carte comprise', () => {
    const room = roomWith(BOARD, { cutsOnSignalLoss: true })
    expect(parseRoomHardwareConfig(JSON.parse(JSON.stringify(room))).config).toEqual(room)
    expect(withoutUnknownKeys(room).lighting.smoke.board).toEqual(BOARD)
  })

  it('lisible par l’ancienne version : la clé est dans smoke, sans nouvelle clé de premier niveau', () => {
    const room = roomWith(BOARD)
    expect(Object.keys(room.lighting.smoke)).toContain('board')
    expect(Object.keys(room.lighting)).not.toContain('board')
  })
})

describe('lighting.smoke.board : export et import', () => {
  it('n’est jamais exportée, et le reste de la fumée est exporté comme avant', () => {
    const { content } = exportRoomConfig(roomWith(BOARD), { roomName: 'Salle', now: NOW })
    const { config } = JSON.parse(content)
    expect(config.lighting.smoke).not.toHaveProperty('board')
    expect(content).not.toMatch(/uno-serial|usbVendorId|usbProductId/)
    expect(config.lighting.smoke).toMatchObject({ enabled: false, maxDurationMs: 2_000 })
  })

  it('un fichier qui en contient une : écartée à l’import (la carte est celle de ce PC)', () => {
    const file = JSON.stringify({
      format: 'quizzup-room-config',
      schema: 1,
      exportedAt: NOW.toISOString(),
      config: roomWith(BOARD),
    })
    expect(imported(file).config.lighting.smoke).not.toHaveProperty('board')
  })

  it('aller-retour export, import : la carte de la salle en place survit à l’import', () => {
    const inPlace = roomWith(BOARD)
    const exported = exportRoomConfig(inPlace, { roomName: 'Salle', now: NOW }).content
    const saved = withoutSmokeEscalation(inPlace, imported(exported).config)
    expect(saved.lighting.smoke.board).toEqual(BOARD)
    // Un second aller-retour ne change plus rien.
    const again = imported(exportRoomConfig(saved, { roomName: 'Salle', now: NOW }).content)
    expect(withoutSmokeEscalation(saved, again.config)).toEqual(saved)
  })
})

describe('lighting.smoke.board : withoutSmokeEscalation', () => {
  const withSmoke = (config: RoomHardwareConfig, smoke: Record<string, unknown>) =>
    ({
      ...config,
      lighting: { ...config.lighting, smoke: { ...config.lighting.smoke, ...smoke } },
    }) as RoomHardwareConfig

  it('ne retire jamais la carte de la salle en place', () => {
    const inPlace = roomWith(BOARD)
    const without = withSmoke(inPlace, { board: undefined })
    expect(withoutSmokeEscalation(inPlace, without).lighting.smoke.board).toEqual(BOARD)
    const bare = {
      ...inPlace,
      lighting: { ...inPlace.lighting, smoke: { enabled: true } },
    } as RoomHardwareConfig
    expect(withoutSmokeEscalation(inPlace, bare).lighting.smoke.board).toEqual(BOARD)
    const empty = { ...inPlace, lighting: {} } as unknown as RoomHardwareConfig
    expect(withoutSmokeEscalation(inPlace, empty).lighting.smoke.board).toEqual(BOARD)
  })

  it('ne modifie jamais la carte de la salle en place', () => {
    const inPlace = roomWith(BOARD)
    const other = { kind: 'uno-serial', usbVendorId: 0x1a86, usbProductId: 0x7523 }
    expect(
      withoutSmokeEscalation(inPlace, withSmoke(inPlace, { board: other })).lighting.smoke.board
    ).toEqual(BOARD)
  })

  it('n’ajoute pas de carte à une salle qui n’en avait pas', () => {
    const inPlace = roomWith(undefined)
    const next = withSmoke(inPlace, { board: BOARD })
    expect(withoutSmokeEscalation(inPlace, next).lighting.smoke).not.toHaveProperty('board')
  })

  it('les autres garde-fous restent : jamais plus permissif que la salle en place', () => {
    const inPlace = roomWith(BOARD)
    const saved = withoutSmokeEscalation(
      inPlace,
      withSmoke(inPlace, { maxDurationMs: 9_000, cooldownMs: 5_000, requireConfirmation: false })
    ).lighting.smoke
    expect(saved).toMatchObject({
      board: BOARD,
      maxDurationMs: 2_000,
      cooldownMs: 60_000,
      requireConfirmation: true,
    })
  })
})
