import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  abortGame,
  closeGame,
  configureRoomGame,
  createSeed,
  discardSavedGame,
  getExtractPlayer,
  hasSavedGame,
  onGameEvents,
  preloadExtracts,
  pressBuzzer,
  resumeSavedGame,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'

import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

const BLIND_TEST_ONLY = [MINI_GAME_FLASH_BLIND_TEST]

function fakePlayer(): ExtractPlayer {
  return {
    unlock: vi.fn(async () => undefined),
    preload: vi.fn(async () => ({ loaded: [], failed: [] })),
    play: vi.fn(async () => 'ended' as const),
    pause: vi.fn(() => 0),
    resume: vi.fn(),
    stop: vi.fn(),
    isLoaded: vi.fn(() => true),
    release: vi.fn(),
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

    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 7,
      miniGames: BLIND_TEST_ONLY,
    })

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
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 7,
      miniGames: BLIND_TEST_ONLY,
    })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)

    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })

    expect(state.value?.phase.name).toBe('question')
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('arrête la partie puis la ferme sans laisser de sauvegarde', () => {
    const { state, session } = useRoomGame()
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 7,
      miniGames: BLIND_TEST_ONLY,
    })

    abortGame()
    expect(state.value?.phase.name).toBe('aborted')
    expect(player.stop).toHaveBeenCalled()

    closeGame()
    expect(session.value).toBeNull()
    expect(hasSavedGame()).toBe(false)
  })

  it('reprend une partie sauvegardée après avoir rechargé les extraits', async () => {
    const { state } = useRoomGame()
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 7,
      miniGames: BLIND_TEST_ONLY,
    })
    const phase = state.value?.phase.name

    expect(await resumeSavedGame()).toBe(true)
    expect(state.value?.phase.name).toBe(phase)
    // Les extraits de démo n'ont pas de fichier : rien à télécharger.
    expect(player.preload).not.toHaveBeenCalled()

    discardSavedGame()
    closeGame()
    expect(await resumeSavedGame()).toBe(false)
  })

  it('relance l’extrait du palier en cours à la reprise', async () => {
    const { state } = useRoomGame()
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 7,
      miniGames: BLIND_TEST_ONLY,
    })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
    clock.advance(300)
    vi.advanceTimersByTime(1000)
    vi.mocked(player.play).mockClear()

    expect(await resumeSavedGame()).toBe(true)
    expect(state.value?.phase.name).toBe('question')
    expect(player.play).toHaveBeenCalledTimes(1)
  })
})

describe('preloadExtracts', () => {
  const themes = [
    {
      id: 1,
      name: 'Thème',
      questions: [
        { mediaType: 'audio', mediaUrl: 'https://api/questions/1/media?v=2' },
        { mediaType: 'image', mediaUrl: 'https://img.test/2.png' },
        { mediaType: 'audio', mediaUrl: 'demo://1/1' },
        { mediaUrl: null },
      ],
    },
  ] as unknown as Parameters<typeof preloadExtracts>[0]

  afterEach(() => {
    configureRoomGame({ player: createSilentExtractPlayer() })
  })

  it('télécharge les extraits réels avec le fetch authentifié de la salle', async () => {
    const fetchMedia = vi.fn(async () => new Response())
    const player = fakePlayer()
    vi.mocked(player.preload).mockResolvedValue({
      loaded: [],
      failed: ['https://api/questions/1/media?v=2'],
    })
    configureRoomGame({ player, fetchMedia })

    await expect(preloadExtracts(themes)).resolves.toEqual(['https://api/questions/1/media?v=2'])
    expect(player.preload).toHaveBeenCalledWith(['https://api/questions/1/media?v=2'], {
      fetch: fetchMedia,
      onProgress: undefined,
    })
  })

  it('considère tout en échec si le lecteur plante', async () => {
    const player = fakePlayer()
    vi.mocked(player.preload).mockRejectedValue(new Error('boom'))
    configureRoomGame({ player })

    await expect(preloadExtracts(themes)).resolves.toEqual(['https://api/questions/1/media?v=2'])
  })
})
