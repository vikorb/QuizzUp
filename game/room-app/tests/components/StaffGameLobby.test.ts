import { flushPromises } from '@vue/test-utils'

import type { ExtractPlayer } from '@/audio/player'
import { createMemorySessionStorage } from '@/game/session'
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

describe('Lobby d’un compte de salle (partie lancée au backoffice)', () => {
  let player: ExtractPlayer

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
    player = fakePlayer()
    configureRoomGame({ storage: createMemorySessionStorage(), player })
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
})
