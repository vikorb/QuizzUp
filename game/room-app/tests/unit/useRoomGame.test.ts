import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'

import type { ExtractPlayer } from '@/audio/player'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  abortGame,
  closeGame,
  configureRoomGame,
  createSeed,
  getExtractPlayer,
  hasSavedGame,
  onGameEvents,
  pressBuzzer,
  resumeSavedGame,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

function fakePlayer(): ExtractPlayer {
  return {
    unlock: vi.fn(async () => undefined),
    preload: vi.fn(async () => ({ loaded: [], failed: [] })),
    play: vi.fn(async () => 'ended' as const),
    pause: vi.fn(() => 0),
    resume: vi.fn(),
    stop: vi.fn(),
  }
}

describe('useRoomGame', () => {
  let clock: ReturnType<typeof createManualClock>
  let storage: ReturnType<typeof createMemorySessionStorage>
  let player: ExtractPlayer

  beforeEach(() => {
    vi.useFakeTimers()
    clock = createManualClock()
    storage = createMemorySessionStorage()
    player = fakePlayer()
    configureRoomGame({ storage, player, now: clock.now })
  })

  afterEach(() => {
    closeGame()
    vi.useRealTimers()
  })

  it('génère une graine 32 bits', () => {
    const seed = createSeed()
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xff_ff_ff_ff)
  })

  it('lance une partie, fait avancer le temps et relaie les événements', () => {
    const listener = vi.fn()
    const off = onGameEvents(listener)
    const { state, now } = useRoomGame()

    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })

    expect(getExtractPlayer()).toBe(player)
    expect(state.value?.phase.name).toBe('round_intro')
    expect(state.value?.setup.participants.map((participant) => participant.displayName)).toEqual([
      'Léa',
      'Hugo',
      'Inès',
    ])
    expect(hasSavedGame()).toBe(true)

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)

    expect(state.value?.phase.name).toBe('theme_choice')
    expect(now.value).toBe(clock.value)
    expect(listener).toHaveBeenCalled()
    off()
  })

  it('transmet les appuis buzzers au moteur et l’audio suit', () => {
    const { state } = useRoomGame()
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)

    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', at: clock.value })

    expect(state.value?.phase.name).toBe('question')
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('arrête la partie puis la ferme sans laisser de sauvegarde', () => {
    const { state, session } = useRoomGame()
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })

    abortGame()
    expect(state.value?.phase.name).toBe('aborted')
    expect(player.stop).toHaveBeenCalled()

    closeGame()
    expect(session.value).toBeNull()
    expect(hasSavedGame()).toBe(false)
  })

  it('reprend une partie sauvegardée', () => {
    const { state } = useRoomGame()
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })
    const phase = state.value?.phase.name

    expect(resumeSavedGame()).toBe(true)
    expect(state.value?.phase.name).toBe(phase)

    closeGame()
    expect(resumeSavedGame()).toBe(false)
  })
})
