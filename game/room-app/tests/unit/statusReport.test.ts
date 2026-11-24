import { createGame, type GameState, reduceGame } from '@quizzup/game-engine'
import {
  defaultRoomHardwareConfig,
  DMX_DRIVERS,
  type DmxDriver,
  type DmxOutputStatus,
} from '@quizzup/hardware'
import {
  type BuzzerSourceKind,
  LIGHTING_DRIVERS,
  type LightingDriver,
  type LightingOutputStatus,
  MINI_GAME_FLASH_BLIND_TEST,
  ROOM_SCREENS,
} from '@quizzup/shared'

import {
  buildRoomDiagnostics,
  buildRoomStatusReport,
  type RoomDiagnosticsInput,
  type RoomStatusInput,
} from '@/live/statusReport'

import { baseSetup } from '../_helpers/fixtures'

const IDLE: RoomStatusInput = {
  routeName: 'launch',
  state: null,
  backofficeGame: null,
  paused: false,
  audioReady: false,
}

/** Partie du moteur avancée jusqu'à la première phase `phaseName`. */
function gameAt(phaseName: string): GameState {
  let state = reduceGame(createGame(baseSetup()), { type: 'start', at: 0 }).state

  for (let at = 0; state.phase.name !== phaseName && at < 100_000; at += 250) {
    state = reduceGame(state, { type: 'tick', at }).state
  }

  return state
}

describe('buildRoomStatusReport : écran', () => {
  it.each([
    ['launch', 'launch'],
    ['lobby', 'lobby'],
    ['play', 'play'],
    ['setup', 'setup'],
    ['setup-lights', 'setup'],
    ['hardware', 'other'],
    ['login', 'other'],
  ])('la route %s est l’écran %s', (routeName, screen) => {
    expect(buildRoomStatusReport({ ...IDLE, routeName }).screen).toBe(screen)
  })

  it('une route sans nom ou inconnue est « other », et reste un écran connu', () => {
    for (const routeName of [undefined, null, Symbol('anonyme'), 'nouvelle-route']) {
      const { screen } = buildRoomStatusReport({ ...IDLE, routeName })

      expect(screen).toBe('other')
      expect(ROOM_SCREENS).toContain(screen)
    }
  })
})

describe('buildRoomStatusReport : partie', () => {
  it('sans partie : rien d’une partie, la pause est ignorée', () => {
    expect(buildRoomStatusReport({ ...IDLE, paused: true, audioReady: true })).toEqual({
      screen: 'launch',
      gameId: null,
      phase: null,
      round: null,
      questionIndex: null,
      miniGame: null,
      paused: false,
      scores: [],
      audioReady: true,
    })
  })

  it('au lobby du moteur : phase connue, ni manche ni question', () => {
    const report = buildRoomStatusReport({
      ...IDLE,
      routeName: 'lobby',
      state: createGame(baseSetup()),
    })

    expect(report).toMatchObject({ phase: 'lobby', round: null, questionIndex: null })
    expect(report.scores).toEqual([
      { podium: 1, score: 0 },
      { podium: 2, score: 0 },
      { podium: 3, score: 0 },
    ])
  })

  it('partie en cours : identifiant du backoffice, phase, manche, question et mini-jeu', () => {
    const state = gameAt('question')

    expect(
      buildRoomStatusReport({
        ...IDLE,
        routeName: 'play',
        state,
        backofficeGame: { id: 12, seed: state.setup.seed },
      })
    ).toMatchObject({
      screen: 'play',
      gameId: 12,
      phase: 'question',
      round: 1,
      questionIndex: 0,
      miniGame: MINI_GAME_FLASH_BLIND_TEST,
      paused: false,
    })
  })

  it('hors question, pas d’index de question', () => {
    expect(
      buildRoomStatusReport({ ...IDLE, state: gameAt('round_intro') }).questionIndex
    ).toBeNull()
  })

  it('la pause de la partie est reportée', () => {
    const report = buildRoomStatusReport({ ...IDLE, state: gameAt('question'), paused: true })

    expect(report.paused).toBe(true)
  })

  it('la partie du backoffice retenue n’est publiée que si c’est la même graine', () => {
    const state = gameAt('question')

    for (const backofficeGame of [null, { id: 12, seed: null }, { id: 12, seed: 999 }]) {
      expect(buildRoomStatusReport({ ...IDLE, state, backofficeGame }).gameId).toBeNull()
    }
  })

  it('les scores sont rangés par pupitre, sans nom de joueur ni e-mail', () => {
    const state = gameAt('question')

    state.scores = [
      { participantId: 3, score: -5 },
      { participantId: 1, score: 40 },
      { participantId: 2, score: 10 },
      { participantId: 99, score: 7 },
    ]

    const report = buildRoomStatusReport({ ...IDLE, state })

    expect(report.scores).toEqual([
      { podium: 1, score: 40 },
      { podium: 2, score: 10 },
      { podium: 3, score: -5 },
    ])
    expect(JSON.stringify(report)).not.toMatch(/Léa|Hugo|Inès|@/)
  })
})

const DIAGNOSTICS: RoomDiagnosticsInput = {
  appVersion: '0.1.0',
  config: defaultRoomHardwareConfig(),
  lighting: null,
  gamepadCount: 0,
  lastErrorAt: null,
}

describe('buildRoomDiagnostics', () => {
  it('une salle neuve : clavier, simulation, lumières pas démarrées, fumée désactivée', () => {
    expect(buildRoomDiagnostics(DIAGNOSTICS)).toEqual({
      appVersion: '0.1.0',
      buzzerSource: 'keyboard',
      gamepadCount: 0,
      lightingDriver: 'simulation',
      lightingStatus: 'closed',
      smokeEnabled: false,
      smokeArmed: false,
      lastErrorAt: null,
    })
  })

  it('reprend la source des buzzers, le pilote, l’état de la sortie et la fumée armée', () => {
    const config = defaultRoomHardwareConfig()

    config.buzzers.source = { kind: 'gamepad', match: 'Carte 32' }
    config.lighting.driver = 'artnet-bridge'
    config.lighting.smoke.enabled = true

    expect(
      buildRoomDiagnostics({
        ...DIAGNOSTICS,
        config,
        gamepadCount: 2,
        lighting: { outputStatus: 'error', smoke: { armed: true } },
        lastErrorAt: '2026-11-24T09:30:00.000Z',
      })
    ).toEqual({
      appVersion: '0.1.0',
      buzzerSource: 'gamepad',
      gamepadCount: 2,
      lightingDriver: 'artnet-bridge',
      lightingStatus: 'error',
      smokeEnabled: true,
      smokeArmed: true,
      lastErrorAt: '2026-11-24T09:30:00.000Z',
    })
  })

  it('ne publie ni nom de carte ni nom de joueur', () => {
    const config = defaultRoomHardwareConfig()

    config.buzzers.source = { kind: 'gamepad', match: 'Carte 32' }

    expect(JSON.stringify(buildRoomDiagnostics({ ...DIAGNOSTICS, config }))).not.toContain(
      'Carte 32'
    )
  })

  it('le rapport porte le diagnostic quand on le lui donne, et sinon n’a pas le champ', () => {
    const diagnostics = buildRoomDiagnostics(DIAGNOSTICS)

    expect(buildRoomStatusReport({ ...IDLE, diagnostics }).diagnostics).toEqual(diagnostics)
    expect('diagnostics' in buildRoomStatusReport(IDLE)).toBe(false)
  })
})

describe('contrat avec @quizzup/hardware', () => {
  it('les pilotes de lumières et les états de sortie sont les mêmes que ceux du paquet matériel', () => {
    // Types vérifiés par `npm run type-check` : une valeur en plus ou en moins d'un côté ne compile pas.
    expectTypeOf<DmxDriver>().toEqualTypeOf<LightingDriver>()
    expectTypeOf<DmxOutputStatus>().toEqualTypeOf<LightingOutputStatus>()
    expectTypeOf<
      NonNullable<ReturnType<typeof defaultRoomHardwareConfig>['buzzers']['source']>['kind']
    >().toEqualTypeOf<BuzzerSourceKind>()
    expect([...LIGHTING_DRIVERS]).toEqual([...DMX_DRIVERS])
  })
})
