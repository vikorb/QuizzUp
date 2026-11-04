import {
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
import { MINI_GAMES_STORAGE_KEY } from '@/game/miniGamesSetting'
import { createMemorySessionStorage, GameSession, type SessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, useRoomGame } from '@/game/useRoomGame'
import { signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'
import LobbyView from '@/views/LobbyView.vue'

import { getPlayableThemes } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'
import { mountWithApp } from '../_helpers/mount'

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

async function startWith(miniGames: roomApi.RoomGame['miniGames']): Promise<void> {
  vi.spyOn(roomApi, 'fetchCurrentGame').mockResolvedValue({ ...GAME, miniGames })
  vi.spyOn(roomApi, 'fetchCurrentContent').mockResolvedValue(getPlayableThemes())
  vi.spyOn(roomApi, 'startRoomGame').mockResolvedValue({ ...GAME, state: 'running' })
  const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
  await flushPromises()

  await wrapper.find('[data-test="start-game"]').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
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

describe('Lobby d’un compte de salle (partie lancée au backoffice)', () => {
  let player: ExtractPlayer
  let storage: SessionStorage

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
    player = fakePlayer()
    storage = createMemorySessionStorage()
    configureRoomGame({ storage, player })
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

    await vi.advanceTimersByTimeAsync(3000)
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

    expect(start).toHaveBeenCalledWith('token-salle', 42)
    expect(player.preload).toHaveBeenCalled()
    const { state } = useRoomGame()
    expect(state.value?.setup.seed).toBe(123_456)
    expect(state.value?.setup.roundsCount).toBe(3)
    expect(state.value?.setup.participants.map((participant) => participant.podium).sort()).toEqual(
      [1, 3]
    )
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

        expect(start).toHaveBeenCalledWith('token-salle', 42)
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

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(wrapper.find('[data-test="start-game"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(6000)
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

  it('propose de reprendre une partie déjà en cours sur ce PC', async () => {
    localStorage.setItem('quizzup_room_backoffice_game', '42')
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
    const content = vi.spyOn(roomApi, 'fetchCurrentContent')
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })
    await flushPromises()

    expect(wrapper.text()).toContain('Partie en cours')
    await wrapper.find('[data-test="resume-game"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    expect(content).not.toHaveBeenCalled()
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
})
