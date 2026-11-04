import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import {
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { rememberBackofficeGameId } from '@/game/backofficeGameMemory'
import { getDemoThemes } from '@/game/demoContent'
import { MINI_GAMES_STORAGE_KEY } from '@/game/miniGamesSetting'
import { createMemorySessionStorage, type SessionSnapshot } from '@/game/session'
import {
  abortGame,
  closeGame,
  configureRoomGame,
  createSeed,
  discardSavedGame,
  discardStaleSavedGame,
  getExtractPlayer,
  hasSavedGame,
  NoPlayableMiniGameError,
  onGameEvents,
  preloadExtracts,
  pressBuzzer,
  resumeSavedGame,
  startNewGame,
  useRoomGame,
  validateNewGame,
} from '@/game/useRoomGame'
import { setDemoMode, setRoomAccountId } from '@/utils/auth'

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
    // Une partie démo se reprend en mode démo ; les contextes sont testés plus bas.
    setDemoMode(true)
  })

  afterEach(() => {
    closeGame()
    setDemoMode(false)
    localStorage.clear()
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

  it('tire les mini-jeux du réglage de la salle, sinon tous', () => {
    const { state } = useRoomGame()
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })
    expect(state.value?.setup.miniGames.length).toBeGreaterThan(1)
    closeGame()

    localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify(BLIND_TEST_ONLY))
    try {
      startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 7 })
      expect(state.value?.setup.miniGames).toEqual(BLIND_TEST_ONLY)
    } finally {
      localStorage.removeItem(MINI_GAMES_STORAGE_KEY)
    }
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

describe('sauvegarde de partie et contexte courant', () => {
  const SEED = 99
  let storage: ReturnType<typeof createMemorySessionStorage>

  function startGame(seed = SEED): void {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed,
      miniGames: BLIND_TEST_ONLY,
    })
  }

  beforeEach(() => {
    localStorage.clear()
    setDemoMode(false)
    storage = createMemorySessionStorage()
    configureRoomGame({ storage, player: fakePlayer(), now: createManualClock().now })
  })

  afterEach(() => {
    closeGame()
    setDemoMode(false)
    localStorage.clear()
  })

  /** Simule la fermeture de la page : la sauvegarde reste, plus de partie en mémoire. */
  function leaveSaveBehind(): void {
    const saved = structuredClone(storage.current)
    closeGame()
    storage.save(saved as SessionSnapshot)
  }

  it('démo : reprend une partie démo', async () => {
    setDemoMode(true)
    startGame()
    expect(storage.current?.demo).toBe(true)
    leaveSaveBehind()

    expect(hasSavedGame()).toBe(true)
    expect(await resumeSavedGame()).toBe(true)
  })

  it('démo : ne propose pas la partie du backoffice mais la garde', async () => {
    startGame()
    rememberBackofficeGameId(5, SEED)
    expect(storage.current?.demo).toBe(false)
    leaveSaveBehind()
    setDemoMode(true)

    expect(hasSavedGame()).toBe(false)
    expect(await resumeSavedGame()).toBe(false)
    expect(storage.current).not.toBeNull()

    setDemoMode(false)
    expect(await resumeSavedGame()).toBe(true)
  })

  it('autre compte de salle : non proposée mais gardée ; mémoire ancienne sans compte : graine', () => {
    setRoomAccountId(10)
    startGame()
    rememberBackofficeGameId(5, SEED)
    leaveSaveBehind()
    expect(hasSavedGame()).toBe(true)

    setRoomAccountId(11)
    expect(hasSavedGame()).toBe(false)
    discardStaleSavedGame()
    expect(storage.current).not.toBeNull()

    setRoomAccountId(10)
    expect(hasSavedGame()).toBe(true)

    // Mémoire d'avant l'enregistrement du compte : seule la graine compte.
    localStorage.setItem('quizzup_room_backoffice_game', JSON.stringify({ id: 5, seed: SEED }))
    setRoomAccountId(11)
    expect(hasSavedGame()).toBe(true)
  })

  it('compte de salle : reprend la partie retenue du backoffice (même graine)', async () => {
    startGame()
    rememberBackofficeGameId(5, SEED)
    leaveSaveBehind()

    expect(hasSavedGame()).toBe(true)
    expect(await resumeSavedGame()).toBe(true)
  })

  it('compte de salle : ignore et efface la sauvegarde d’une autre graine', async () => {
    startGame()
    rememberBackofficeGameId(5, SEED + 1)
    leaveSaveBehind()

    expect(hasSavedGame()).toBe(false)
    expect(await resumeSavedGame()).toBe(false)
    expect(storage.current).toBeNull()
  })

  it('compte de salle : ignore une partie démo, même avec une partie retenue de même graine', () => {
    setDemoMode(true)
    startGame()
    leaveSaveBehind()
    setDemoMode(false)
    rememberBackofficeGameId(5, SEED)

    expect(hasSavedGame()).toBe(false)
    discardStaleSavedGame()
    expect(storage.current).toBeNull()
  })

  it('compte de salle : ignore la sauvegarde si plus aucune partie n’est retenue', () => {
    startGame()
    leaveSaveBehind()

    expect(hasSavedGame()).toBe(false)
    discardStaleSavedGame()
    expect(storage.current).toBeNull()
  })

  it('ancienne sauvegarde sans indicateur démo : reprise seulement si la graine est retenue', () => {
    startGame()
    leaveSaveBehind()
    const { demo: _demo, ...legacy } = storage.current as SessionSnapshot
    storage.save(legacy)

    rememberBackofficeGameId(5, SEED)
    expect(hasSavedGame()).toBe(true)

    rememberBackofficeGameId(5, SEED + 1)
    expect(hasSavedGame()).toBe(false)

    rememberBackofficeGameId(5, SEED)
    setDemoMode(true)
    expect(hasSavedGame()).toBe(false)
  })

  it('mémoire du backoffice sans graine (id seul) : ne permet pas de reprendre', () => {
    startGame()
    leaveSaveBehind()
    localStorage.setItem('quizzup_room_backoffice_game', '5')

    expect(hasSavedGame()).toBe(false)
  })

  it('ne touche pas à la sauvegarde d’une partie en cours', () => {
    startGame()
    // Contexte devenu incohérent pendant que la partie tourne : on ne perd pas sa progression.
    expect(hasSavedGame()).toBe(false)
    discardStaleSavedGame()

    expect(storage.current).not.toBeNull()
  })

  it('une sauvegarde reprise conserve son contexte', async () => {
    setDemoMode(true)
    startGame()
    leaveSaveBehind()

    expect(await resumeSavedGame()).toBe(true)
    expect(storage.current?.demo).toBe(true)
  })
})

describe('preloadExtracts', () => {
  const themes = [
    {
      id: 1,
      name: 'Thème',
      questions: [
        { mediaType: 'audio', mediaUrl: 'https://api/questions/1/media?v=2' },
        { mediaType: 'audio', mediaUrl: 'demo://1/1' },
        { mediaType: 'image', mediaUrl: 'https://cdn/x.png' },
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

describe('validateNewGame', () => {
  const soloRegistrations = [REGISTRATIONS[0]!]
  const textOnlyThemes = getPlayableThemes().map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({
      ...question,
      mediaType: QUESTION_MEDIA_TYPE_NONE,
      mediaUrl: null,
    })),
  }))

  afterEach(() => {
    localStorage.removeItem(MINI_GAMES_STORAGE_KEY)
  })

  it('accepte une partie dont un mini-jeu choisi est jouable', () => {
    expect(() =>
      validateNewGame({
        registrations: REGISTRATIONS,
        themes: getPlayableThemes(),
        seed: 7,
        miniGames: [MINI_GAME_POINT_STEAL],
      })
    ).not.toThrow()
  })

  it('refuse un mini-jeu qui exige plus de pupitres que de joueurs', () => {
    expect(() =>
      validateNewGame({
        registrations: soloRegistrations,
        themes: getPlayableThemes(),
        seed: 7,
        miniGames: [MINI_GAME_POINT_STEAL],
      })
    ).toThrow(NoPlayableMiniGameError)
  })

  it('refuse le blind test sans question audio éligible', () => {
    expect(() =>
      validateNewGame({
        registrations: REGISTRATIONS,
        themes: textOnlyThemes,
        seed: 7,
        miniGames: BLIND_TEST_ONLY,
      })
    ).toThrow(NoPlayableMiniGameError)
  })

  it('applique la même vérification au réglage local de la salle', () => {
    localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify([MINI_GAME_POINT_STEAL]))

    expect(() =>
      validateNewGame({ registrations: soloRegistrations, themes: getPlayableThemes(), seed: 7 })
    ).toThrow(NoPlayableMiniGameError)
  })

  it('laisse l’erreur du moteur prioritaire quand la configuration est invalide', () => {
    expect(() =>
      validateNewGame({
        registrations: REGISTRATIONS,
        themes: getPlayableThemes(),
        seed: -1,
        miniGames: BLIND_TEST_ONLY,
      })
    ).toThrow(expect.objectContaining({ code: 'seed_invalid' }))
  })
})
