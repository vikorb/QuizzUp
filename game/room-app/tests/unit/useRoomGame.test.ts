import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import {
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { flushRoomErrors } from '@/diagnostics/errorReporter'
import { rememberBackofficeGameId } from '@/game/backofficeGameMemory'
import { getDemoThemes } from '@/game/demoContent'
import { getMediaCredit } from '@/game/mediaCredits'
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
import { setDemoMode, setRoomAccountId, setRoomToken } from '@/utils/auth'

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

describe('reprise d’un extrait avec effet', () => {
  let clock: ReturnType<typeof createManualClock>
  let player: ExtractPlayer

  beforeEach(() => {
    vi.useFakeTimers()
    clock = createManualClock()
    player = fakePlayer()
    configureRoomGame({ storage: createMemorySessionStorage(), player, now: clock.now })
    setDemoMode(true)
  })

  afterEach(() => {
    closeGame()
    setDemoMode(false)
    localStorage.clear()
    vi.useRealTimers()
  })

  it.each([
    ['short', 500],
    ['reverse', 1000],
  ] as const)('relance le palier %s avec sa durée et son effet', async (audioEffect, extractMs) => {
    const themes = getPlayableThemes().map((theme) => ({
      ...theme,
      questions: theme.questions.map((question) => ({ ...question, audioEffect })),
    }))
    const { state } = useRoomGame()
    startNewGame({ registrations: REGISTRATIONS, themes, seed: 7, miniGames: BLIND_TEST_ONLY })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
    clock.advance(100)
    vi.advanceTimersByTime(100)
    vi.mocked(player.play).mockClear()

    expect(await resumeSavedGame()).toBe(true)

    expect(player.play).toHaveBeenCalledTimes(1)
    const [, , durationMs, options] = vi.mocked(player.play).mock.calls[0] ?? []
    expect(durationMs).toBe(extractMs)
    expect(options).toMatchObject({ effect: audioEffect })
    expect(options?.elapsedMs).toBeGreaterThanOrEqual(0)
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

const DEEZER_OLD = 'https://cdnt-preview.dzcdn.net/api/1/1/a/'
const DEEZER_NEW = 'https://cdnt-preview.dzcdn.net/api/1/2/b/'
/** Première question jouable des contenus de test. */
const CREDITED_ID = getPlayableThemes()[0]?.questions.find((question) => question.mediaUrl)?.id ?? 0

/** Contenu jouable dont chaque extrait est un lien Deezer (`base` + identifiant) et un crédit. */
function deezerThemes(base: string, artist: string) {
  return getPlayableThemes().map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({
      ...question,
      mediaUrl: question.mediaUrl ? `${base}${question.id}.mp3` : null,
      mediaCredit: question.mediaUrl
        ? { provider: 'deezer', title: 'Titre', artist, coverUrl: null, link: 'https://dz.test/1' }
        : null,
    })),
  }))
}

/** Identifiants des questions de la sauvegarde qui ont un crédit de fournisseur. */
function creditedIds(snapshot: SessionSnapshot | null): number[] {
  return (snapshot?.setup.themes ?? []).flatMap((theme) =>
    theme.questions
      .filter((question) => 'mediaCredit' in question && question.mediaCredit)
      .map((question) => question.id)
  )
}

function respondWith(themes: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ themes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

const PLAYLIST_THEME_ID = 9000
const PLAYLIST_IDS = Array.from({ length: 10 }, (_item, index) => -(1001 + index))

const CREDIT = { provider: 'deezer', title: 'Titre', coverUrl: null, link: 'https://dz.test/1' }

/** Thème de playlist : questions d'identifiant négatif (`-idDuTitre`), extrait Deezer et crédit. */
function playlistTheme(base: string, artist: string) {
  const template = deezerThemes(base, artist)[0]?.questions.find((question) => question.mediaUrl)
  return {
    id: PLAYLIST_THEME_ID,
    name: 'Playlist',
    questions: PLAYLIST_IDS.map((id) => ({
      ...template,
      id,
      mediaUrl: `${base}${-id}.mp3`,
      mediaCredit: { ...CREDIT, artist },
    })),
  } as unknown as ReturnType<typeof deezerThemes>[number]
}

/** Réponse de `GET /room/games/current/tracks` : un titre par question de la playlist. */
function tracksBody(base: string, artist: string) {
  return {
    items: PLAYLIST_IDS.map((id) => ({
      ref: String(-id),
      mediaUrl: `${base}${-id}.mp3`,
      mediaCredit: { ...CREDIT, artist },
    })),
  }
}

function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Réponses de `content` et de `tracks` ; l'envoi des journaux (`/room/logs`) est accepté. */
function routeFetch(routes: { content?: Response | Error; tracks?: Response | Error }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/room/logs')) {
      return new Response(null, { status: 204 })
    }
    const reply = url.includes('/tracks') ? routes.tracks : routes.content
    if (reply === undefined) {
      throw new Error(`appel inattendu : ${url}`)
    }
    if (reply instanceof Error) {
      throw reply
    }
    return reply.clone()
  })
}

function calledUrls(fetchMock: ReturnType<typeof routeFetch>): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => !url.includes('/logs'))
}

function playlistQuestions(snapshot: SessionSnapshot | null) {
  return (snapshot?.setup.themes ?? [])
    .flatMap((theme) => theme.questions)
    .filter((question) => question.id < 0)
}

/** Entrées envoyées au journal de la salle (`POST /room/logs`) depuis le début du test. */
async function sentLogEntries(fetchMock: ReturnType<typeof routeFetch>) {
  await flushRoomErrors()
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/room/logs'))
  return call ? (JSON.parse(String(call[1]?.body)) as { entries: unknown[] }).entries : []
}

describe('extraits fournis par un tiers', () => {
  const SEED = 99
  let storage: ReturnType<typeof createMemorySessionStorage>
  let player: ExtractPlayer
  let clock: ReturnType<typeof createManualClock>

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setDemoMode(false)
    clock = createManualClock()
    storage = createMemorySessionStorage()
    player = fakePlayer()
    configureRoomGame({ storage, player, now: clock.now })
  })

  afterEach(() => {
    closeGame()
    vi.restoreAllMocks()
    vi.useRealTimers()
    localStorage.clear()
  })

  function startGame(
    themes: Parameters<typeof startNewGame>[0]['themes'] = deezerThemes(DEEZER_OLD, 'Ancien')
  ): void {
    startNewGame({ registrations: REGISTRATIONS, themes, seed: SEED, miniGames: BLIND_TEST_ONLY })
    rememberBackofficeGameId(5, SEED)
  }

  /** Simule la fermeture de la page : la sauvegarde reste, plus de partie en mémoire. */
  function leaveSaveBehind(): void {
    const saved = structuredClone(storage.current)
    closeGame()
    storage.save(saved as SessionSnapshot)
  }

  it('précharge et joue le même lien, sans le préfixer', async () => {
    const themes = deezerThemes(DEEZER_OLD, 'Ancien')
    const { state } = useRoomGame()

    await preloadExtracts(themes)
    startGame(themes)
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })

    const [preloaded] = vi.mocked(player.preload).mock.calls[0] ?? []
    const [played] = vi.mocked(player.play).mock.calls[0] ?? []
    expect(played?.startsWith(DEEZER_OLD)).toBe(true)
    expect(preloaded).toContain(played)
    expect(player.isLoaded).toHaveBeenCalledWith(played)
  })

  it('range les crédits par question dès le lancement', () => {
    startGame()

    expect(getMediaCredit(CREDITED_ID)?.artist).toBe('Ancien')
  })

  describe('reprise après un rechargement', () => {
    beforeEach(() => setRoomToken('tok'))

    it('redemande le contenu : les liens neufs servent au préchargement et à la sauvegarde', async () => {
      startGame()
      leaveSaveBehind()
      const fetchMock = respondWith(deezerThemes(DEEZER_NEW, 'Nouveau'))

      expect(await resumeSavedGame()).toBe(true)

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `http://localhost:3001/room/games/current/content?ids=${creditedIds(storage.current).join(',')}`
      )
      const [preloaded] = vi.mocked(player.preload).mock.calls[0] ?? []
      expect(preloaded?.length).toBeGreaterThan(0)
      expect(preloaded?.every((url) => url.startsWith(DEEZER_NEW))).toBe(true)
      expect(
        storage.current?.setup.themes.every((theme) =>
          theme.questions.every((question) => !question.mediaUrl?.startsWith(DEEZER_OLD))
        )
      ).toBe(true)
      expect(getMediaCredit(CREDITED_ID)?.artist).toBe('Nouveau')
    })

    it('contenu injoignable : reprend avec la sauvegarde, crédits compris', async () => {
      startGame()
      leaveSaveBehind()
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))

      expect(await resumeSavedGame()).toBe(true)

      const [preloaded] = vi.mocked(player.preload).mock.calls[0] ?? []
      expect(preloaded?.every((url) => url.startsWith(DEEZER_OLD))).toBe(true)
      expect(getMediaCredit(CREDITED_ID)?.artist).toBe('Ancien')
    })

    it('garde le lien d’une question que le serveur n’a plus en extrait (le tirage ne bouge pas)', async () => {
      startGame()
      leaveSaveBehind()
      const withoutAudio = deezerThemes(DEEZER_NEW, 'Nouveau').map((theme) => ({
        ...theme,
        questions: theme.questions.map((question) => ({ ...question, mediaUrl: null })),
      }))
      respondWith(withoutAudio)

      expect(await resumeSavedGame()).toBe(true)

      const [preloaded] = vi.mocked(player.preload).mock.calls[0] ?? []
      expect(preloaded?.every((url) => url.startsWith(DEEZER_OLD))).toBe(true)
    })

    it('ne demande que les questions qui ont un crédit de fournisseur', async () => {
      const themes = deezerThemes(DEEZER_OLD, 'Ancien')
      const first = themes[0]?.questions[0]
      if (first) {
        // Un extrait importé : un lien du backoffice, aucun crédit.
        first.mediaUrl = '/room/questions/1/media'
        first.mediaCredit = null
      }
      startGame(themes)
      leaveSaveBehind()
      const fetchMock = respondWith(deezerThemes(DEEZER_NEW, 'Nouveau'))

      expect(await resumeSavedGame()).toBe(true)

      const asked = String(fetchMock.mock.calls[0]?.[0]).split('?ids=')[1]?.split(',').map(Number)
      expect(asked).toEqual(creditedIds(storage.current))
      expect(asked?.length).toBeGreaterThan(0)
      expect(asked).not.toContain(first?.id)
    })

    it('n’appelle pas le serveur quand aucune question n’a de crédit', async () => {
      startGame(getPlayableThemes())
      leaveSaveBehind()
      const fetchMock = respondWith(deezerThemes(DEEZER_NEW, 'Nouveau'))

      expect(await resumeSavedGame()).toBe(true)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ne réécrit pas une question dont la réponse n’a plus de crédit, ni une question sans crédit', async () => {
      const themes = deezerThemes(DEEZER_OLD, 'Ancien')
      const uncredited = themes[0]?.questions[0]
      if (uncredited) {
        uncredited.mediaCredit = null
      }
      startGame(themes)
      leaveSaveBehind()
      const before = structuredClone(storage.current?.setup.themes)
      const answer = deezerThemes(DEEZER_NEW, 'Nouveau').map((theme) => ({
        ...theme,
        questions: theme.questions.map((question) =>
          question.id === CREDITED_ID ? { ...question, mediaCredit: null } : question
        ),
      }))
      respondWith(answer)

      expect(await resumeSavedGame()).toBe(true)

      const after = storage.current?.setup.themes.flatMap((theme) => theme.questions) ?? []
      const old = before?.flatMap((theme) => theme.questions) ?? []
      for (const id of [CREDITED_ID, uncredited?.id]) {
        expect(after.find((question) => question.id === id)).toEqual(
          old.find((question) => question.id === id)
        )
      }
      const refreshed = after.find(
        (question) =>
          question.id !== CREDITED_ID && question.id !== uncredited?.id && question.mediaUrl
      )
      expect(refreshed?.mediaUrl?.startsWith(DEEZER_NEW)).toBe(true)
    })

    it('demande les questions par lots de 200 au plus', async () => {
      const [base] = deezerThemes(DEEZER_OLD, 'Ancien')
      const template = base?.questions.find((question) => question.mediaUrl)
      const themes = deezerThemes(DEEZER_OLD, 'Ancien')
      if (template && themes[0]) {
        themes[0].questions = [
          ...themes[0].questions,
          ...Array.from({ length: 205 }, (_item, index) => ({
            ...template,
            id: 1000 + index,
            mediaUrl: `${DEEZER_OLD}${1000 + index}.mp3`,
          })),
        ]
      }
      startGame(themes)
      leaveSaveBehind()
      const total = creditedIds(storage.current).length
      const fetchMock = respondWith(deezerThemes(DEEZER_NEW, 'Nouveau'))

      expect(await resumeSavedGame()).toBe(true)

      const sizes = fetchMock.mock.calls.map(
        ([url]) => String(url).split('?ids=')[1]?.split(',').length
      )
      expect(total).toBeGreaterThan(200)
      expect(sizes).toEqual([200, total - 200])
    })

    describe('titres de playlist (identifiants négatifs)', () => {
      const PLAIN = getPlayableThemes()

      it('identifiants négatifs seuls : appelle `tracks` avec les thèmes de playlist, jamais `content`', async () => {
        startGame([...PLAIN, playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        const fetchMock = routeFetch({ tracks: jsonReply(200, tracksBody(DEEZER_NEW, 'Nouveau')) })

        expect(await resumeSavedGame()).toBe(true)

        expect(calledUrls(fetchMock)).toEqual([
          `http://localhost:3001/room/games/current/tracks?themeIds=${PLAYLIST_THEME_ID}&refs=${PLAYLIST_IDS.map((id) => -id).join(',')}`,
        ])
        const refreshed = playlistQuestions(storage.current)
        expect(refreshed).toHaveLength(PLAYLIST_IDS.length)
        expect(refreshed.every((question) => question.mediaUrl?.startsWith(DEEZER_NEW))).toBe(true)
        expect(getMediaCredit(PLAYLIST_IDS[0] ?? 0)?.artist).toBe('Nouveau')
      })

      it('identifiants positifs seuls : appelle `content`, jamais `tracks`', async () => {
        startGame()
        leaveSaveBehind()
        const fetchMock = routeFetch({
          content: jsonReply(200, { themes: deezerThemes(DEEZER_NEW, 'Nouveau') }),
        })

        expect(await resumeSavedGame()).toBe(true)

        const urls = calledUrls(fetchMock)
        expect(urls).toHaveLength(1)
        expect(urls[0]).toContain('/content?ids=')
        expect(urls[0]).not.toContain('-')
      })

      it('identifiants mélangés : les positifs vont à `content`, les négatifs à `tracks`', async () => {
        startGame([...deezerThemes(DEEZER_OLD, 'Ancien'), playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        const fetchMock = routeFetch({
          content: jsonReply(200, { themes: deezerThemes(DEEZER_NEW, 'Nouveau') }),
          tracks: jsonReply(200, tracksBody(DEEZER_NEW, 'Nouveau')),
        })

        expect(await resumeSavedGame()).toBe(true)

        const urls = calledUrls(fetchMock)
        const content = urls.find((url) => url.includes('/content'))
        const tracks = urls.find((url) => url.includes('/tracks'))
        expect(urls).toHaveLength(2)
        expect(
          content
            ?.split('?ids=')[1]
            ?.split(',')
            .every((id) => Number(id) > 0)
        ).toBe(true)
        expect(tracks).toContain(`themeIds=${PLAYLIST_THEME_ID}`)
        const saved = (storage.current?.setup.themes ?? []).flatMap((theme) => theme.questions)
        const withAudio = saved.filter((question) => question.mediaUrl)
        expect(withAudio.length).toBeGreaterThan(PLAYLIST_IDS.length)
        expect(withAudio.every((question) => question.mediaUrl?.startsWith(DEEZER_NEW))).toBe(true)
      })

      it('laisse 12 s à `tracks` (deux vagues côté serveur) et garde 5 s pour `content`', async () => {
        startGame([...deezerThemes(DEEZER_OLD, 'Ancien'), playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        routeFetch({
          content: jsonReply(200, { themes: deezerThemes(DEEZER_NEW, 'Nouveau') }),
          tracks: jsonReply(200, tracksBody(DEEZER_NEW, 'Nouveau')),
        })
        const timeout = vi.spyOn(AbortSignal, 'timeout')

        expect(await resumeSavedGame()).toBe(true)

        expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([5000, 12_000])
      })

      it.each([
        [
          'quota dépassé (429)',
          () => jsonReply(429, { error: 'too_many_requests' }),
          'too_many_requests',
        ],
        [
          'fournisseur indisponible (502)',
          () => jsonReply(502, { error: 'media_provider_unavailable' }),
          'media_provider_unavailable',
        ],
        ['panne de réseau', () => new TypeError('offline'), 'offline'],
        ['titres absents de la réponse', () => jsonReply(200, { items: [] }), 'tracks_missing'],
      ])(
        '%s : la partie reprend avec ses liens et l’écart est noté en avertissement',
        async (_name, reply, message) => {
          startGame([...deezerThemes(DEEZER_OLD, 'Ancien'), playlistTheme(DEEZER_OLD, 'Ancien')])
          leaveSaveBehind()
          const fetchMock = routeFetch({
            content: jsonReply(200, { themes: deezerThemes(DEEZER_NEW, 'Nouveau') }),
            tracks: reply(),
          })

          expect(await resumeSavedGame()).toBe(true)

          // Les titres gardent leurs liens ; les questions classiques sont rafraîchies quand même.
          const kept = playlistQuestions(storage.current)
          expect(kept.every((question) => question.mediaUrl?.startsWith(DEEZER_OLD))).toBe(true)
          expect(getMediaCredit(CREDITED_ID)?.artist).toBe('Nouveau')
          expect(await sentLogEntries(fetchMock)).toMatchObject([
            { level: 'warn', code: 'resume_tracks_failed', message },
          ])
        }
      )

      it('réponse partielle : les titres reçus sont rafraîchis, les absents gardent leur lien', async () => {
        startGame([...PLAIN, playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        const received = tracksBody(DEEZER_NEW, 'Nouveau').items.slice(0, 4)
        const fetchMock = routeFetch({ tracks: jsonReply(200, { items: received }) })

        expect(await resumeSavedGame()).toBe(true)

        const urls = playlistQuestions(storage.current).map((question) => question.mediaUrl ?? '')
        expect(urls.slice(0, 4).every((url) => url.startsWith(DEEZER_NEW))).toBe(true)
        expect(urls.slice(4).every((url) => url.startsWith(DEEZER_OLD))).toBe(true)
        expect(await sentLogEntries(fetchMock)).toMatchObject([
          { level: 'warn', code: 'resume_tracks_failed', message: 'tracks_missing' },
        ])
      })

      it('`content` en panne pendant que `tracks` répond : les titres sont rafraîchis, rien n’est noté', async () => {
        startGame([...deezerThemes(DEEZER_OLD, 'Ancien'), playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        const fetchMock = routeFetch({
          content: new TypeError('offline'),
          tracks: jsonReply(200, tracksBody(DEEZER_NEW, 'Nouveau')),
        })

        expect(await resumeSavedGame()).toBe(true)

        const kept = playlistQuestions(storage.current)
        expect(kept.every((question) => question.mediaUrl?.startsWith(DEEZER_NEW))).toBe(true)
        expect(await sentLogEntries(fetchMock)).toEqual([])
      })

      it('un `ref` non demandé ne rafraîchit rien : même nombre de titres reçus, l’avertissement part', async () => {
        startGame([...PLAIN, playlistTheme(DEEZER_OLD, 'Ancien')])
        leaveSaveBehind()
        const stranger = { mediaUrl: `${DEEZER_NEW}x.mp3`, mediaCredit: { ...CREDIT, artist: 'X' } }
        // 9 titres demandés sur 10, plus un inconnu : autant d'éléments que de titres demandés.
        const items = [
          ...tracksBody(DEEZER_NEW, 'Nouveau').items.slice(0, 9),
          { ref: '999999', ...stranger },
        ]
        const fetchMock = routeFetch({ tracks: jsonReply(200, { items }) })

        expect(await resumeSavedGame()).toBe(true)

        const urls = playlistQuestions(storage.current).map((question) => question.mediaUrl ?? '')
        expect(urls).toHaveLength(PLAYLIST_IDS.length)
        expect(urls.slice(0, 9).every((url) => url.startsWith(DEEZER_NEW))).toBe(true)
        expect(urls[9]?.startsWith(DEEZER_OLD)).toBe(true)
        expect(await sentLogEntries(fetchMock)).toMatchObject([
          { level: 'warn', code: 'resume_tracks_failed', message: 'tracks_missing' },
        ])
      })
    })

    it('ne redemande rien à une partie de démonstration', async () => {
      setDemoMode(true)
      startGame(getDemoThemes())
      leaveSaveBehind()
      const fetchMock = respondWith([])

      expect(await resumeSavedGame()).toBe(true)

      expect(fetchMock).not.toHaveBeenCalled()
    })
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
