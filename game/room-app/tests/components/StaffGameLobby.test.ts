import {
  GAME_FORMAT_CUSTOM,
  GAME_FORMAT_DISCOVERY,
  GAME_FORMAT_SETTINGS,
  GAME_FORMAT_SHORT,
  GAME_FORMAT_STANDARD,
  type GameFormat,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_QUICK_ANSWER,
  type MiniGame,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'

import type { ExtractPlayer } from '@/audio/player'
import { useConfirm } from '@/composables/useConfirm'
import { rememberBackofficeGameId } from '@/game/backofficeGame'
import { MINI_GAMES_STORAGE_KEY } from '@/game/miniGamesSetting'
import { PENDING_FINISHES_KEY } from '@/game/pendingFinishes'
import { createMemorySessionStorage, GameSession, type SessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, useRoomGame } from '@/game/useRoomGame'
import { saveRoomDesksCount } from '@/hardware/roomHardware'
import { startRoomLive, stopRoomLive } from '@/live/roomLive'
import { setCurrentLocale } from '@/plugins/i18n'
import { signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'
import LobbyView from '@/views/LobbyView.vue'

import { createFakeLiveServer, helloMessage } from '../_helpers/fakeLiveServer'
import { getPlayableThemes } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

/** Lecture lente du lobby tant que le flux de la salle est fermé (`StaffGameLobby.vue`). */
const FALLBACK_POLL_MS = 15_000
const GAME_UPDATED = 'event: game_updated\ndata: {"gameId":42}\n\n'

const GAME: roomApi.RoomGame = {
  id: 42,
  seed: 123_456,
  roundsCount: 3,
  questionsPerRound: 2,
  miniGames: null,
  state: 'pending',
  participants: [
    { id: 7, podium: 3, displayName: 'Inès', score: 0 },
    { id: 6, podium: 1, displayName: 'Léa', score: 0 },
  ],
}

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

function queue(...gameIds: number[]): void {
  localStorage.setItem(
    PENDING_FINISHES_KEY,
    JSON.stringify(
      gameIds.map((gameId) => ({ gameId, seed: gameId, scores: [{ podium: 1, score: 10 }] }))
    )
  )
}

async function startWith(miniGames: roomApi.RoomGame['miniGames']): Promise<void> {
  vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, miniGames })
  vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
  vi.spyOn(roomApi, 'startRoomGame').mockResolvedValue({ ...GAME, state: 'running' })
  const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
  await flushPromises()

  await wrapper.find('[data-test="start-game"]').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
}

/** Lance la partie reçue et rend les questions que le moteur compte déjà comme posées. */
async function playWith(game: Partial<roomApi.RoomGame>) {
  vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, ...game })
  vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
  vi.spyOn(roomApi, 'startRoomGame').mockResolvedValue({ ...GAME, state: 'running' })
  const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
  await flushPromises()

  await wrapper.find('[data-test="start-game"]').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
  const used = useRoomGame().state.value?.setup.avoidQuestionIds
  closeGame()

  return used
}

async function clickStart(
  miniGames: roomApi.RoomGame['miniGames'],
  game: Partial<roomApi.RoomGame>,
  themes = getPlayableThemes()
) {
  vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, miniGames, ...game })
  vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(themes)
  const start = vi.spyOn(roomApi, 'startRoomGame')
  const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
  await flushPromises()

  await wrapper.find('[data-test="start-game"]').trigger('click')
  await flushPromises()
  return { wrapper, start }
}

const primaryTests = (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) =>
  wrapper.findAll('.ui-btn--primary').map((button) => button.attributes('data-test'))

/** Une partie du backoffice déjà sauvegardée sur ce PC. */
function saveGame(storage: SessionStorage): void {
  rememberBackofficeGameId(GAME.id, GAME.seed)
  GameSession.create(
    {
      seed: GAME.seed,
      participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
      themes: getPlayableThemes(),
    },
    [],
    { storage }
  )
}

/** Lecture unique du lobby : la partie vient de `fetchCurrentGame` (mockée test par test), sans session à venir. */
function delegateCurrentState(): void {
  vi.spyOn(roomApi, 'fetchCurrentState').mockImplementation(async (token) => ({
    game: await roomApi.fetchCurrentGame(token),
    next: null,
  }))
}

/** Monte le lobby sur la partie `GAME` modifiée par `game`. */
async function mountLobby(game: Partial<roomApi.RoomGame>) {
  delegateCurrentState()
  vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, ...game })
  const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
  await flushPromises()
  return wrapper
}

/** Ligne du format affichée au lobby pour la partie `GAME` modifiée par `game`. */
async function formatLine(game: Partial<roomApi.RoomGame>): Promise<string> {
  const wrapper = await mountLobby(game)
  return wrapper.get('[data-test="game-format"]').text()
}

describe('Lobby d’un compte de salle (partie lancée au backoffice)', () => {
  let player: ExtractPlayer
  let storage: SessionStorage

  beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
    player = fakePlayer()
    storage = createMemorySessionStorage()
    configureRoomGame({ storage, player })
    delegateCurrentState()
  })

  afterEach(() => {
    closeGame()
    vi.restoreAllMocks()
  })

  it('attend la partie puis l’affiche dès que le staff l’a lancée', async () => {
    vi.useFakeTimers()
    const fetchGame = vi
      .spyOn(roomApi, 'fetchCurrentGame')
      .mockResolvedValueOnce(null)
      .mockResolvedValue(GAME)
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.find('[data-test="waiting-game"]').exists()).toBe(true)
    expect(wrapper.find('input[name=desk-1-name]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
    await flushPromises()

    expect(fetchGame).toHaveBeenCalledWith('token-salle')
    expect(wrapper.text()).toContain('3 manches × 2 questions')
    const names = wrapper.findAll('.player strong').map((node) => node.text())
    expect(names).toEqual(['Léa', 'Inès'])

    pressKey('KeyA') // pupitre 3
    await flushPromises()
    expect(wrapper.find('[data-test="player-3"]').classes()).toContain('player--ping')
    vi.useRealTimers()
  })

  describe('format de la partie', () => {
    afterEach(() => setCurrentLocale('fr'))

    it.each([
      [GAME_FORMAT_DISCOVERY, 'Format Découverte · 3 à 6 min'],
      [GAME_FORMAT_SHORT, 'Format Courte · 12 à 21 min'],
      [GAME_FORMAT_STANDARD, 'Format Standard · 28 à 47 min'],
    ] as const)('nomme le format %s et annonce sa durée', async (format, expected) => {
      expect(await formatLine({ format, ...GAME_FORMAT_SETTINGS[format], miniGames: null })).toBe(
        expected
      )
    })

    it('affiche « Personnalisé » et l’estimation des nombres de la partie', async () => {
      expect(
        await formatLine({
          format: GAME_FORMAT_CUSTOM,
          roundsCount: 3,
          questionsPerRound: 3,
          miniGames: null,
        })
      ).toBe('Format Personnalisé · 3 à 6 min')
    })

    it.each([[null], [undefined]])(
      'lit un format %s (partie d’avant les formats) comme personnalisé',
      async (format) => {
        expect(await formatLine({ format })).toContain('Format Personnalisé')
      }
    )

    it('estime la durée avec les mini-jeux choisis pour la partie', async () => {
      const all = await formatLine({
        format: GAME_FORMAT_STANDARD,
        roundsCount: 10,
        questionsPerRound: 10,
      })
      const one = await formatLine({
        format: GAME_FORMAT_STANDARD,
        roundsCount: 10,
        questionsPerRound: 10,
        miniGames: [MINI_GAME_QUICK_ANSWER],
      })

      expect(all).toContain('28 à 47 min')
      expect(one).toContain('27 à 38 min')
    })

    it('se traduit en anglais', async () => {
      const wrapper = await mountLobby({
        format: GAME_FORMAT_SHORT,
        ...GAME_FORMAT_SETTINGS[GAME_FORMAT_SHORT],
        miniGames: null,
      })
      setCurrentLocale('en')
      await flushPromises()

      expect(wrapper.get('[data-test="game-format"]').text()).toBe('Short format · 12 to 21 min')
    })

    it('lit un format inconnu de cet écran comme personnalisé, sans clé brute', async () => {
      // Un serveur plus récent peut envoyer un format que cet écran ne connaît pas.
      const line = await formatLine({ format: 'marathon' as unknown as GameFormat })

      expect(line).toContain('Format Personnalisé')
      expect(line).not.toContain('room.lobby')
    })
  })

  it('affiche et démarre une partie à 6 pupitres venue du backoffice', async () => {
    const sixPlayers: roomApi.RoomGame = {
      ...GAME,
      participants: [6, 4, 5, 2, 1, 3].map((podium) => ({
        id: podium + 20,
        podium,
        displayName: `Joueur ${podium}`,
        score: 0,
      })),
    }
    // La salle est réglée sur 6 pupitres (sinon le backoffice aurait refusé cette partie).
    await saveRoomDesksCount(6)
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(sixPlayers)
    vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    vi.spyOn(roomApi, 'startRoomGame').mockResolvedValue({ ...sixPlayers, state: 'running' })
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.findAll('.player strong').map((node) => node.text())).toEqual([
      'Joueur 1',
      'Joueur 2',
      'Joueur 3',
      'Joueur 4',
      'Joueur 5',
      'Joueur 6',
    ])
    // Chaque pupitre garde sa couleur, jusqu'au 6.
    expect(wrapper.find('.player--5').exists()).toBe(true)
    expect(wrapper.find('.desk-badge--6').exists()).toBe(true)

    pressKey('Digit5')
    await flushPromises()
    expect(wrapper.find('[data-test="player-5"]').classes()).toContain('player--ping')

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    const { state } = useRoomGame()
    expect(state.value?.setup.participants.map((participant) => participant.podium)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })

  it('charge le contenu, accuse réception et démarre la partie du backoffice', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
    vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    const start = vi
      .spyOn(roomApi, 'startRoomGame')
      .mockResolvedValue({ ...GAME, state: 'running' })
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))

    // Les pupitres chargés partent avec la demande : le backoffice vérifie qu'ils n'ont pas changé.
    expect(start).toHaveBeenCalledWith('token-salle', 42, [3, 1])
    expect(player.preload).toHaveBeenCalled()
    const { state } = useRoomGame()
    expect(state.value?.setup.seed).toBe(123_456)
    expect(state.value?.setup.roundsCount).toBe(3)
    expect(state.value?.setup.participants.map((participant) => participant.podium).sort()).toEqual(
      [1, 3]
    )
  })

  it('transmet au moteur les questions déjà vues par les joueurs, absentes sans elles', async () => {
    expect(await playWith({ avoidQuestionIds: [11, 12] })).toEqual([11, 12])
    // Un backoffice ancien ne l'envoie pas : rien à éviter.
    expect(await playWith({})).toEqual([])
  })

  describe('mini-jeux de la partie', () => {
    afterEach(() => {
      localStorage.removeItem(MINI_GAMES_STORAGE_KEY)
    })

    it('transmet au moteur les mini-jeux choisis au lancement', async () => {
      await startWith([MINI_GAME_QUICK_ANSWER, MINI_GAME_FIRST_BUZZ])

      expect(useRoomGame().state.value?.setup.miniGames).toEqual([
        MINI_GAME_QUICK_ANSWER,
        MINI_GAME_FIRST_BUZZ,
      ])
    })

    it('préfère le choix du backoffice au réglage local de la salle', async () => {
      localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify([MINI_GAME_FIRST_BUZZ]))

      await startWith([MINI_GAME_QUICK_ANSWER])

      expect(useRoomGame().state.value?.setup.miniGames).toEqual([MINI_GAME_QUICK_ANSWER])
    })

    it('retombe sur le réglage local de la salle quand le backoffice n’impose rien', async () => {
      localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify([MINI_GAME_FIRST_BUZZ]))

      await startWith(null)

      expect(useRoomGame().state.value?.setup.miniGames).toEqual([MINI_GAME_FIRST_BUZZ])
    })

    it('ignore les codes inconnus du choix du backoffice', async () => {
      await startWith(['retired_game', MINI_GAME_QUICK_ANSWER] as unknown as MiniGame[])

      expect(useRoomGame().state.value?.setup.miniGames).toEqual([MINI_GAME_QUICK_ANSWER])
    })

    it('traite un choix vide ou entièrement inconnu comme « aucun choix »', async () => {
      localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify([MINI_GAME_FIRST_BUZZ]))

      await startWith(['retired_game'] as unknown as MiniGame[])

      expect(useRoomGame().state.value?.setup.miniGames).toEqual([MINI_GAME_FIRST_BUZZ])
    })

    describe('sélection injouable', () => {
      it('n’appelle pas startRoomGame quand le mini-jeu exige plus de joueurs', async () => {
        const { wrapper, start } = await clickStart([MINI_GAME_POINT_STEAL], {
          participants: [GAME.participants[0]!],
        })

        expect(start).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Aucun mini-jeu choisi n’est jouable')
        expect(useRoomGame().state.value).toBeNull()
      })

      it('n’appelle pas startRoomGame pour un blind test sans extrait éligible', async () => {
        const textOnly = getPlayableThemes().map((theme) => ({
          ...theme,
          questions: theme.questions.map((question) => ({
            ...question,
            mediaType: QUESTION_MEDIA_TYPE_NONE,
            mediaUrl: null,
          })),
        }))
        const { wrapper, start } = await clickStart([MINI_GAME_FLASH_BLIND_TEST], {}, textOnly)

        expect(start).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Aucun mini-jeu choisi n’est jouable')
        expect(useRoomGame().state.value).toBeNull()
      })

      it('démarre dès qu’un mini-jeu choisi est jouable', async () => {
        const { wrapper, start } = await clickStart(
          [MINI_GAME_POINT_STEAL, MINI_GAME_QUICK_ANSWER],
          { participants: [GAME.participants[0]!] }
        )

        expect(start).toHaveBeenCalledWith('token-salle', 42, [3])
        expect(wrapper.text()).not.toContain('Aucun mini-jeu choisi n’est jouable')
      })
    })

    it('tire tous les mini-jeux sans choix du backoffice ni réglage local', async () => {
      await startWith(null)

      expect(useRoomGame().state.value?.setup.miniGames.length).toBeGreaterThan(1)
    })
  })

  it('explique pourquoi la partie ne démarre pas', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
    const content = vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValueOnce([])
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Aucun thème jouable')

    content.mockRejectedValueOnce(new roomApi.RoomApiError(404, 'game_not_found'))
    await wrapper.find('[data-test="start-game"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('n’est plus disponible')
    expect(useRoomGame().state.value).toBeNull()
  })

  it('n’entre pas en partie et recharge le lobby quand les joueurs ont changé pendant la préparation', async () => {
    const added = { id: 8, podium: 2, displayName: 'Noé', score: 0 }
    const current = vi
      .spyOn(roomApi, 'fetchCurrentGame')
      .mockResolvedValueOnce(GAME)
      .mockResolvedValue({ ...GAME, participants: [...GAME.participants, added] })
    vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    const start = vi
      .spyOn(roomApi, 'startRoomGame')
      .mockRejectedValue(new roomApi.RoomApiError(409, 'game_participants_changed'))
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Noé')

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await flushPromises()

    expect(start).toHaveBeenCalledWith('token-salle', 42, [3, 1])
    expect(router.currentRoute.value.name).not.toBe('play')
    expect(useRoomGame().state.value).toBeNull()
    expect(current).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Les joueurs ont changé')
    expect(wrapper.text()).toContain('Noé')
    expect(wrapper.find('[data-test="start-game"]').attributes('disabled')).toBeUndefined()
  })

  it('signale un backoffice injoignable', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockRejectedValue(new Error('network'))
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.text()).toContain('Backoffice injoignable')
  })

  it('garde la partie affichée pendant une courte coupure', async () => {
    vi.useFakeTimers()
    vi.spyOn(roomApi, 'fetchCurrentGame')
      .mockResolvedValueOnce(GAME)
      .mockRejectedValue(new Error('network'))
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
    await flushPromises()
    expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 2)
    await flushPromises()
    expect(wrapper.text()).toContain('Backoffice injoignable')
    vi.useRealTimers()
  })

  it('affiche les deux joueurs d’un pupitre', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({
      ...GAME,
      participants: [{ id: 6, podium: 1, displayName: 'Léa', secondDisplayName: 'Tom', score: 0 }],
    })
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()
    expect(wrapper.find('[data-test="player-1"]').text()).toContain('Léa & Tom')
  })

  it('refuse une partie sans joueur', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, participants: [] })
    const content = vi.spyOn(roomApi, 'fetchCurrentContent')
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Aucun joueur n’est inscrit')
    expect(content).not.toHaveBeenCalled()
  })

  it('ne passe pas la partie « en cours » si le moteur la refuse', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, roundsCount: 0 })
    vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    const start = vi.spyOn(roomApi, 'startRoomGame')
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('n’est pas jouable')
    expect(start).not.toHaveBeenCalled()
    expect(useRoomGame().state.value).toBeNull()
  })

  it('ne démarre rien si l’écran est quitté pendant la préparation', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
    let deliver: ((themes: ReturnType<typeof getPlayableThemes>) => void) | undefined
    vi.spyOn(roomApi, 'fetchCurrentContent').mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve
      })
    )
    const start = vi.spyOn(roomApi, 'startRoomGame')
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    wrapper.unmount()
    deliver?.(getPlayableThemes())
    await flushPromises()

    expect(start).not.toHaveBeenCalled()
    expect(useRoomGame().state.value).toBeNull()
    expect(router.currentRoute.value.name).not.toBe('play')
  })

  it('ne propose pas de reprendre la sauvegarde d’une autre partie', async () => {
    GameSession.create(
      {
        seed: GAME.seed,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes: getPlayableThemes(),
      },
      [],
      { storage }
    )
    localStorage.setItem('quizzup_room_backoffice_game', '41')
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.find('[data-test="resume-game"]').exists()).toBe(false)
  })

  it('ne propose pas la sauvegarde d’une partie de même numéro mais de graine différente', async () => {
    rememberBackofficeGameId(GAME.id, GAME.seed + 1)
    GameSession.create(
      {
        seed: GAME.seed,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes: getPlayableThemes(),
      },
      [],
      { storage }
    )
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.find('[data-test="resume-game"]').exists()).toBe(false)
  })

  it('propose de reprendre une partie déjà en cours sur ce PC', async () => {
    rememberBackofficeGameId(GAME.id, GAME.seed)
    const credit = { provider: 'deezer', title: 'Titre', artist: 'Artiste', coverUrl: null }
    const themes = getPlayableThemes().map((theme) => ({
      ...theme,
      questions: theme.questions.map((question) => ({
        ...question,
        mediaCredit: question.mediaUrl ? { ...credit, link: null } : null,
      })),
    }))
    const creditedIds = themes.flatMap((theme) =>
      theme.questions.filter((question) => question.mediaCredit).map((question) => question.id)
    )
    GameSession.create(
      {
        seed: GAME.seed,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes,
      },
      [],
      { storage }
    )
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
    // Les extraits de fournisseur sont redemandés à la reprise : leurs liens signés ont pu expirer.
    const content = vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.text()).toContain('Partie en cours')
    await wrapper.find('[data-test="resume-game"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    expect(content).toHaveBeenCalledTimes(1)
    expect(content.mock.calls[0]?.[1]).toMatchObject({ ids: creditedIds })
  })

  it('demande confirmation avant de recommencer une partie en cours', async () => {
    vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
    const content = vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
    vi.spyOn(roomApi, 'startRoomGame').mockResolvedValue({ ...GAME, state: 'running' })
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.find('[data-test="resume-game"]').exists()).toBe(false)
    await wrapper.find('[data-test="start-game"]').trigger('click')
    useConfirm().cancel()
    await flushPromises()
    expect(content).not.toHaveBeenCalled()

    await wrapper.find('[data-test="start-game"]').trigger('click')
    useConfirm().accept()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    expect(JSON.parse(localStorage.getItem('quizzup_room_backoffice_game') ?? '')).toMatchObject({
      id: 42,
    })
  })

  describe('un seul bouton principal visible', () => {
    it('partie prête : « Démarrer » seul, en grand format', async () => {
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(primaryTests(wrapper)).toEqual(['start-game'])
      expect(wrapper.find('[data-test="start-game"]').classes()).toContain('ui-btn--lg')
    })

    it('partie en cours avec sauvegarde : « Reprendre » seul, « Recommencer » passe en secondaire', async () => {
      saveGame(storage)
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(primaryTests(wrapper)).toEqual(['resume-game'])
      for (const test of ['resume-game', 'start-game']) {
        expect(wrapper.find(`[data-test="${test}"]`).classes()).toContain('ui-btn--lg')
      }
    })

    it('partie en cours sans sauvegarde : « Recommencer » seul', async () => {
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, state: 'running' })
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(primaryTests(wrapper)).toEqual(['start-game'])
    })

    it('backoffice injoignable : aucun bouton principal, seulement « Réessayer »', async () => {
      vi.spyOn(roomApi, 'fetchCurrentGame').mockRejectedValue(new Error('network'))
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(primaryTests(wrapper)).toEqual([])
      expect(wrapper.find('[role="alert"] button').exists()).toBe(true)
    })
  })

  describe('résultats de parties en attente d’envoi', () => {
    it('n’affiche aucun bandeau quand tout est envoyé', async () => {
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(wrapper.find('[data-test="pending-results"]').exists()).toBe(false)
    })

    it('prévient qu’un résultat attend son envoi au backoffice', async () => {
      queue(5)
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      const notice = wrapper.find('[data-test="pending-results"]')
      expect(notice.text()).toBe(
        '1 résultat de partie en attente d’envoi au backoffice : nouvel essai automatique.'
      )
      expect(notice.attributes('role')).toBe('status')
      // Le lobby reste utilisable.
      expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)
    })

    it('compte les résultats en attente, même quand le backoffice est injoignable', async () => {
      queue(5, 6, 7)
      vi.spyOn(roomApi, 'fetchCurrentGame').mockRejectedValue(new Error('network'))
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(wrapper.find('[data-test="pending-results"]').text()).toContain(
        '3 résultats de parties en attente'
      )
      expect(wrapper.text()).toContain('Backoffice injoignable')
    })
  })
  describe('inscription par QR code', () => {
    const QR_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h1v1H0z"/></svg>'
    const JOIN = {
      url: 'https://quizz.example/rejoindre/#jeton',
      qrSvg: QR_SVG,
      expiresAt: '2999-01-01T00:00:00Z',
    }

    it('affiche le QR code en image (jamais en HTML brut) et l’adresse en clair', async () => {
      const wrapper = await mountLobby({ join: JOIN })

      const img = wrapper.find('[data-test="join-qr"]')
      expect(img.element.tagName).toBe('IMG')
      expect(img.attributes('src')).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(QR_SVG)}`
      )
      expect(wrapper.find('[data-test="join"] svg').exists()).toBe(false)
      expect(wrapper.find('[data-test="join-url"]').text()).toBe(JOIN.url)
    })

    it('sans QR code (serveur sans adresse publique), n’affiche pas l’adresse relative', async () => {
      const wrapper = await mountLobby({
        join: { url: '/rejoindre/#jeton', qrSvg: null, expiresAt: JOIN.expiresAt },
      })

      expect(wrapper.find('[data-test="join"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('/rejoindre/')
    })

    it.each([
      ['null', { ...JOIN, qrSvg: null }],
      ['absent', { url: JOIN.url, expiresAt: JOIN.expiresAt }],
    ])(
      'sans QR code (%s) mais avec une adresse absolue, affiche l’adresse seule',
      async (_label, join) => {
        const wrapper = await mountLobby({ join })

        expect(wrapper.find('[data-test="join-qr"]').exists()).toBe(false)
        expect(wrapper.find('[data-test="join-url"]').text()).toBe(JOIN.url)
      }
    )

    it('n’affiche aucun lien quand il est fermé ou inconnu du serveur, mais garde la zone vivante vide', async () => {
      for (const join of [null, undefined]) {
        vi.restoreAllMocks()
        const wrapper = await mountLobby({ join })
        expect(wrapper.find('[data-test="join"]').exists()).toBe(false)
        const live = wrapper.find('[data-test="pending-registrations"]')
        expect(live.attributes('role')).toBe('status')
        expect(live.text()).toBe('')
      }
    })

    it('garde le compteur des demandes quand le lien est fermé', async () => {
      const wrapper = await mountLobby({ join: null, pendingRegistrationsCount: 2 })

      expect(wrapper.find('[data-test="join"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="pending-registrations"]').text()).toBe(
        '2 inscriptions en attente de validation'
      )
    })

    it('n’affiche pas le QR code d’une partie déjà en cours', async () => {
      const wrapper = await mountLobby({
        state: 'running',
        join: JOIN,
        pendingRegistrationsCount: 2,
      })

      expect(wrapper.find('[data-test="join"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="pending-registrations"]').exists()).toBe(false)
    })

    it('compte les inscriptions à valider, sans en montrer les noms', async () => {
      const wrapper = await mountLobby({ join: JOIN, pendingRegistrationsCount: 1 })
      expect(wrapper.find('[data-test="pending-registrations"]').text()).toBe(
        '1 inscription en attente de validation'
      )

      vi.restoreAllMocks()
      const several = await mountLobby({ join: JOIN, pendingRegistrationsCount: 3 })
      expect(several.find('[data-test="pending-registrations"]').text()).toBe(
        '3 inscriptions en attente de validation'
      )
    })
  })

  describe('suivi en direct (game_updated)', () => {
    let server: ReturnType<typeof createFakeLiveServer>
    let fetchGame: ReturnType<typeof vi.spyOn>

    async function mountOnLiveStream() {
      vi.useFakeTimers()
      server = createFakeLiveServer()
      vi.stubGlobal('fetch', server.fetchMock)
      fetchGame = vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      startRoomLive()
      await vi.advanceTimersByTimeAsync(0)
      server.streams.at(-1)?.push(helloMessage())
      await vi.advanceTimersByTimeAsync(0)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()
      return wrapper
    }

    afterEach(() => {
      stopRoomLive()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    })

    it('relit la partie sur l’événement, et plus aucune lecture périodique tant que le flux est ouvert', async () => {
      await mountOnLiveStream()
      expect(fetchGame).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
      expect(fetchGame).toHaveBeenCalledTimes(1)

      server.streams.at(-1)?.push(GAME_UPDATED)
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fetchGame).toHaveBeenCalledTimes(2)
    })

    it('relit une seule fois quand un événement arrive pendant une lecture', async () => {
      await mountOnLiveStream()
      let release!: (game: roomApi.RoomGame) => void
      const pending = new Promise<roomApi.RoomGame>((resolve) => {
        release = resolve
      })
      fetchGame.mockImplementationOnce(() => pending)

      server.streams.at(-1)?.push(GAME_UPDATED)
      await vi.advanceTimersByTimeAsync(0)
      server.streams.at(-1)?.push(GAME_UPDATED)
      await vi.advanceTimersByTimeAsync(0)
      release(GAME)
      await flushPromises()

      // 1 (montage) + 1 (premier événement) + 1 (relecture demandée pendant celle-ci)
      expect(fetchGame).toHaveBeenCalledTimes(3)
    })

    it('flux coupé : lecture lente ; flux rétabli : une lecture de rattrapage puis plus rien, sans double abonnement', async () => {
      await mountOnLiveStream()
      server.streams.at(-1)?.end()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      fetchGame.mockClear()

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
      await flushPromises()
      expect(fetchGame).toHaveBeenCalledTimes(1)

      // Le flux revient après l'attente de reconnexion (1 s) : nouveau hello.
      await vi.advanceTimersByTimeAsync(1000)
      server.streams.at(-1)?.push(helloMessage('stream-2'))
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fetchGame).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
      expect(fetchGame).toHaveBeenCalledTimes(2)

      server.streams.at(-1)?.push(GAME_UPDATED)
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fetchGame).toHaveBeenCalledTimes(3)
    })

    it('au démontage : plus d’abonnement ni de minuterie', async () => {
      const wrapper = await mountOnLiveStream()
      wrapper.unmount()
      fetchGame.mockClear()

      server.streams.at(-1)?.push(GAME_UPDATED)
      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
      expect(fetchGame).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBeLessThanOrEqual(2) // garde-fou et rapport du flux, pas du lobby
    })

    it('flux fermé au démontage pendant la lecture lente : la minuterie est retirée', async () => {
      vi.useFakeTimers()
      fetchGame = vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()
      wrapper.unmount()
      fetchGame.mockClear()

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
      expect(fetchGame).not.toHaveBeenCalled()
    })
  })

  describe('session programmée (next)', () => {
    // 13:00 UTC = 02:45 le lendemain à Chatham (+13:45) : une heure que ni UTC ni un PC de salle
    // courant ne donnent, donc seule la conversion vers le fuseau de la salle la produit.
    const ROOM_ZONE = 'Pacific/Chatham'
    const START = '2026-11-24T13:00:00.000Z'
    const SESSION: roomApi.RoomGame = {
      ...GAME,
      id: 55,
      state: 'scheduled',
      scheduledAt: START,
      scheduledEndAt: '2026-11-24T14:00:00.000Z',
    }
    const ROOM_INFO = {
      id: 10,
      name: 'Salle',
      config: {},
      schedule: { timezone: ROOM_ZONE },
    } as roomApi.RoomInfo

    let fetchState: ReturnType<typeof vi.spyOn>
    let fetchInfo: ReturnType<typeof vi.spyOn>

    /** Lobby sans partie en attente, à l'heure `at` (UTC), avec `next` pour prochaine session. */
    async function mountWaiting(
      next: roomApi.RoomGame | null,
      at: string,
      info: roomApi.RoomInfo = ROOM_INFO
    ) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(at))
      fetchState = vi.spyOn(roomApi, 'fetchCurrentState').mockResolvedValue({ game: null, next })
      fetchInfo = vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue(info)
      const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()
      return { wrapper, router }
    }

    /** Flux ouvert : plus de lecture périodique, seuls l'événement et l'horloge de l'écran bougent. */
    async function mountOnLiveStream(next: roomApi.RoomGame | null, at: string) {
      const server = createFakeLiveServer()
      vi.useFakeTimers()
      vi.setSystemTime(new Date(at))
      vi.stubGlobal('fetch', server.fetchMock)
      fetchState = vi.spyOn(roomApi, 'fetchCurrentState').mockResolvedValue({ game: null, next })
      vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue(ROOM_INFO)
      startRoomLive()
      await vi.advanceTimersByTimeAsync(0)
      server.streams.at(-1)?.push(helloMessage())
      await vi.advanceTimersByTimeAsync(0)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()
      return { server, wrapper }
    }

    const launchButton = (wrapper: Awaited<ReturnType<typeof mountWaiting>>['wrapper']) =>
      wrapper.get('[data-test="launch-next"]')

    afterEach(() => {
      stopRoomLive()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    })

    it('sans session à venir : l’attente habituelle, rien d’autre', async () => {
      const { wrapper } = await mountWaiting(null, '2026-11-24T10:00:00Z')

      expect(wrapper.find('[data-test="waiting-game"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)
      expect(fetchInfo).not.toHaveBeenCalled()
    })

    it('une partie en attente reste prioritaire : next n’est pas lu', async () => {
      vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue(GAME)
      fetchInfo = vi.spyOn(roomApi, 'fetchRoomInfo')
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()

      expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)
      expect(fetchInfo).not.toHaveBeenCalled()
    })

    it('plus d’une heure avant : l’heure est celle de la salle, « Lancer » est désactivé', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T10:00:00Z')

      const title = wrapper.get('[data-test="next-session"] h2').text()
      expect(title).toMatch(/^Prochaine session : .*02:45$/)
      // Ouverture 60 min avant : 12:00 UTC = 01:45 à Chatham.
      expect(wrapper.get('[data-test="next-status"]').text()).toMatch(/à partir de .*01:45$/)
      expect(launchButton(wrapper).attributes('disabled')).toBeDefined()
      expect(wrapper.findAll('[data-test="next-session"] li').map((li) => li.text())).toEqual([
        'Pupitre 1 · Léa',
        'Pupitre 3 · Inès',
      ])
      expect(fetchInfo).toHaveBeenCalledTimes(1)
    })

    it('se traduit en anglais', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T10:00:00Z')
      setCurrentLocale('en')
      await flushPromises()

      expect(wrapper.get('[data-test="next-session"] h2').text()).toMatch(/^Next session: .*02:45$/)
      expect(launchButton(wrapper).text()).toBe('Start')
      setCurrentLocale('fr')
    })

    it('après l’heure de début : « en retard de N min »', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:12:30Z')

      expect(launchButton(wrapper).attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-test="next-status"]').text()).toBe('En retard de 12 min')
    })

    it('à la fin du créneau la session disparaît de l’écran, sans nouvelle lecture', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:59:50Z')
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(30_000)
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="waiting-game"]').exists()).toBe(true)
    })

    it('fuseau illisible : la session reste cachée (jamais l’heure du PC), puis revient', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-24T10:00:00Z'))
      vi.spyOn(roomApi, 'fetchCurrentState').mockResolvedValue({ game: null, next: SESSION })
      fetchInfo = vi
        .spyOn(roomApi, 'fetchRoomInfo')
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue(ROOM_INFO)
      const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
      await flushPromises()
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
      await flushPromises()
      expect(wrapper.get('[data-test="next-session"] h2').text()).toMatch(/02:45$/)
    })

    it('« Lancer » ouvre la session, charge le contenu, démarre puis entre en jeu', async () => {
      const { wrapper, router } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      const open = vi
        .spyOn(roomApi, 'openRoomGame')
        .mockResolvedValue({ ...SESSION, state: 'pending' })
      vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
      const start = vi
        .spyOn(roomApi, 'startRoomGame')
        .mockResolvedValue({ ...SESSION, state: 'running' })

      // Après l'ouverture, le serveur renvoie la partie à jour : autre graine, autre pupitre.
      fetchState.mockResolvedValue({
        game: {
          ...SESSION,
          state: 'pending',
          seed: 987,
          participants: [{ id: 9, podium: 2, displayName: 'Zoé', score: 0 }],
        },
        next: null,
      })

      await launchButton(wrapper).trigger('click')
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))

      expect(open).toHaveBeenCalledWith('token-salle', 55)
      // Le moteur et le démarrage reçoivent la relecture, pas le `next` lu avant l'ouverture.
      expect(start).toHaveBeenCalledWith('token-salle', 55, [2])
      expect(open.mock.invocationCallOrder[0]!).toBeLessThan(start.mock.invocationCallOrder[0]!)
      const { setup } = useRoomGame().state.value!
      expect(setup.seed).toBe(987)
      expect(setup.participants.map((participant) => participant.podium)).toEqual([2])
    })

    it('relecture après l’ouverture en échec : erreur affichée, rien n’est démarré', async () => {
      const { wrapper, router } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockResolvedValue({ ...SESSION, state: 'pending' })
      const content = vi.spyOn(roomApi, 'fetchCurrentContent')
      const start = vi.spyOn(roomApi, 'startRoomGame')
      fetchState
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue({ game: { ...SESSION, state: 'pending' }, next: null })

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      expect(content).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(router.currentRoute.value.name).not.toBe('play')
      // La session ouverte est relue : c'est la partie en attente, avec l'erreur.
      expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Impossible de démarrer la partie')
    })

    it('session disparue (annulée ou déjà ouverte) : l’écran la relit et retire « Lancer »', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockRejectedValue(
        new roomApi.RoomApiError(409, 'game_not_scheduled')
      )
      fetchState.mockClear()
      fetchState.mockResolvedValue({ game: null, next: null })

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      expect(fetchState).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="waiting-game"]').exists()).toBe(true)
    })

    it('le refus « salle occupée » ne reste pas sur la partie qui a pris la place', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockRejectedValue(
        new roomApi.RoomApiError(409, 'room_busy')
      )

      await launchButton(wrapper).trigger('click')
      await flushPromises()
      // La lecture qui suit le refus garde le message tant que la même session est affichée.
      expect(wrapper.get('[data-test="next-session"]').text()).toContain('Une autre partie attend')

      fetchState.mockResolvedValue({ game: GAME, next: null })
      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
      await flushPromises()

      expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('Une autre partie attend')
    })

    it('participants changés après l’ouverture : une seule relecture de la partie', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockResolvedValue({ ...SESSION, state: 'pending' })
      vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
      vi.spyOn(roomApi, 'startRoomGame').mockRejectedValue(
        new roomApi.RoomApiError(409, 'game_participants_changed')
      )
      fetchState.mockClear()
      fetchState.mockResolvedValue({ game: { ...SESSION, state: 'pending' }, next: null })

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      // 1 relecture après l’ouverture + 1 relecture de l’écran, pas deux.
      expect(fetchState).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Les joueurs ont changé')
    })

    it('salle sans réglage de créneaux : l’heure est celle du fuseau par défaut, pas celle du PC', async () => {
      const previous = process.env.TZ
      process.env.TZ = 'Asia/Tokyo' // PC réglé ailleurs : 13:00 UTC y serait 22:00
      try {
        const { wrapper } = await mountWaiting(SESSION, '2026-11-24T10:00:00Z', {
          ...ROOM_INFO,
          schedule: null,
        })

        // Europe/Paris en novembre : UTC+1.
        expect(wrapper.get('[data-test="next-session"] h2').text()).toMatch(/14:00$/)
      } finally {
        if (previous === undefined) {
          delete process.env.TZ
        } else {
          process.env.TZ = previous
        }
      }
    })

    it('sans joueur inscrit : refusé en local, la session n’est pas ouverte', async () => {
      const { wrapper } = await mountWaiting(
        { ...SESSION, participants: [] },
        '2026-11-24T13:05:00Z'
      )
      const open = vi.spyOn(roomApi, 'openRoomGame')

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      expect(open).not.toHaveBeenCalled()
      expect(wrapper.get('[data-test="next-session"]').text()).toContain(
        'Aucun joueur n’est inscrit'
      )
    })

    it.each([
      ['session_not_open_yet', 'pas encore ouvrable'],
      ['room_busy', 'Une autre partie attend déjà'],
      ['game_not_scheduled', 'n’est plus disponible'],
    ])('refus du serveur %s : message affiché, rien n’est démarré', async (code, message) => {
      const { wrapper, router } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockRejectedValue(new roomApi.RoomApiError(409, code))
      const content = vi.spyOn(roomApi, 'fetchCurrentContent')

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="next-session"]').text()).toContain(message)
      expect(content).not.toHaveBeenCalled()
      expect(router.currentRoute.value.name).not.toBe('play')
      expect(launchButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('session ouverte mais contenu introuvable : la partie en attente est relue', async () => {
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T13:05:00Z')
      vi.spyOn(roomApi, 'openRoomGame').mockResolvedValue({ ...SESSION, state: 'pending' })
      vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue([])
      const current = fetchState.mockResolvedValue({
        game: { ...SESSION, state: 'pending' },
        next: null,
      })

      await launchButton(wrapper).trigger('click')
      await flushPromises()

      expect(current).toHaveBeenCalled()
      expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Aucun thème jouable')
    })

    describe('suivi en direct (game_updated)', () => {
      it('l’horloge active « Lancer » 60 min avant le début, sans nouvelle lecture', async () => {
        const { wrapper } = await mountOnLiveStream(SESSION, '2026-11-24T11:59:40Z')
        expect(launchButton(wrapper).attributes('disabled')).toBeDefined()
        fetchState.mockClear()

        await vi.advanceTimersByTimeAsync(30_000)
        expect(launchButton(wrapper).attributes('disabled')).toBeUndefined()
        expect(fetchState).not.toHaveBeenCalled()
      })

      it('l’événement relit next ; flux ouvert : aucune lecture périodique', async () => {
        const { server, wrapper } = await mountOnLiveStream(null, '2026-11-24T10:00:00Z')
        expect(wrapper.find('[data-test="next-session"]').exists()).toBe(false)

        await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
        expect(fetchState).toHaveBeenCalledTimes(1)

        fetchState.mockResolvedValue({ game: null, next: SESSION })
        server.streams.at(-1)?.push(GAME_UPDATED)
        await vi.advanceTimersByTimeAsync(0)
        await flushPromises()
        expect(wrapper.find('[data-test="next-session"]').exists()).toBe(true)
        expect(fetchState).toHaveBeenCalledTimes(2)
      })

      it('flux coupé : la lecture lente rafraîchit next', async () => {
        const { wrapper } = await mountWaiting(null, '2026-11-24T10:00:00Z')
        fetchState.mockResolvedValue({ game: null, next: SESSION })

        await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS)
        await flushPromises()
        expect(wrapper.find('[data-test="next-session"]').exists()).toBe(true)
      })
    })

    it('au démontage : plus d’horloge, plus de lecture, aucune minuterie laissée', async () => {
      vi.useFakeTimers()
      const before = vi.getTimerCount()
      const { wrapper } = await mountWaiting(SESSION, '2026-11-24T10:00:00Z')
      expect(vi.getTimerCount()).toBeGreaterThan(before)
      wrapper.unmount()
      fetchState.mockClear()

      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS * 4)
      expect(fetchState).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(before)
    })
  })
})
