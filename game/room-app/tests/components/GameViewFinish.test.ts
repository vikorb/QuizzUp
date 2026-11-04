import { flushPromises } from '@vue/test-utils'

import { rememberBackofficeGameId } from '@/game/backofficeGame'
import { getDemoThemes } from '@/game/demoContent'
import {
  flushPendingFinishes,
  PENDING_FINISHES_KEY,
  readPendingFinishes,
} from '@/game/pendingFinishes'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame } from '@/game/useRoomGame'
import { enterDemo, signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'
import GameView from '@/views/GameView.vue'

import { playToPodium } from '../_helpers/drive'
import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

const SEED = 11

describe('GameView : fin de partie signalée au backoffice', () => {
  let clock: ReturnType<typeof createManualClock>

  function playUntilPodium(): void {
    const session = startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: SEED,
      roundsCount: 1,
      questionsPerRound: 1,
    })
    playToPodium(session, clock)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    syncRoomAuth()
    signIn('tok', { id: 1, companyId: 1, role: 'room' })
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
  })

  afterEach(() => {
    closeGame()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('affiche « Envoi des résultats… » puis « Résultats enregistrés »', async () => {
    rememberBackofficeGameId(7, SEED)
    let deliver!: () => void
    const finish = vi.spyOn(roomApi, 'finishRoomGame').mockReturnValue(
      new Promise((resolve) => {
        deliver = () => resolve({} as roomApi.RoomGame)
      })
    )
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith('tok', 7, expect.any(Array))
    expect(wrapper.find('[data-test="finish-sync"]').text()).toBe('Envoi des résultats…')

    deliver()
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').text()).toBe('Résultats enregistrés')
    expect(readPendingFinishes()).toEqual([])
  })

  it('signale « hors ligne » au podium puis renvoie les résultats automatiquement', async () => {
    rememberBackofficeGameId(7, SEED)
    const finish = vi
      .spyOn(roomApi, 'finishRoomGame')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({} as roomApi.RoomGame)
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').text()).toContain('Hors ligne')
    expect(readPendingFinishes()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(finish).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="finish-sync"]').text()).toBe('Résultats enregistrés')
    expect(readPendingFinishes()).toEqual([])
  })

  it('en mode démo : aucun envoi et aucune mention', async () => {
    enterDemo()
    rememberBackofficeGameId(7, SEED)
    const finish = vi.spyOn(roomApi, 'finishRoomGame')
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()

    expect(finish).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="finish-sync"]').exists()).toBe(false)
    expect(localStorage.getItem(PENDING_FINISHES_KEY)).toBeNull()
  })

  it('ne signale rien si la partie locale n’est pas celle retenue par le backoffice', async () => {
    rememberBackofficeGameId(7, SEED + 1)
    const finish = vi.spyOn(roomApi, 'finishRoomGame')
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()

    expect(finish).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="finish-sync"]').exists()).toBe(false)
  })

  it('signale le refus du backoffice (409) sans dire « enregistré »', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    rememberBackofficeGameId(7, SEED)
    vi.spyOn(roomApi, 'finishRoomGame').mockRejectedValue(
      new roomApi.RoomApiError(409, 'game_already_over')
    )
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').text()).toBe(
      'Résultats refusés par le backoffice.'
    )
    expect(readPendingFinishes()).toEqual([])
  })

  it('page rechargée au podium : affiche l’état de la partie encore en file', async () => {
    // Le rapport est déjà en file (partie retenue oubliée), le réseau est toujours coupé.
    localStorage.setItem(
      PENDING_FINISHES_KEY,
      JSON.stringify([{ gameId: 7, seed: SEED, scores: [{ podium: 1, score: 10 }] }])
    )
    const finish = vi.spyOn(roomApi, 'finishRoomGame').mockRejectedValue(new Error('offline'))
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPromises()
    // Le démarrage de l'application vide la file.
    await flushPendingFinishes()
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').text()).toContain('Hors ligne')
    expect(readPendingFinishes()).toHaveLength(1)

    finish.mockResolvedValue({} as roomApi.RoomGame)
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').text()).toBe('Résultats enregistrés')
  })

  it('n’affiche pas l’état d’une autre partie en file', async () => {
    localStorage.setItem(
      PENDING_FINISHES_KEY,
      JSON.stringify([{ gameId: 8, seed: SEED + 1, scores: [{ podium: 1, score: 10 }] }])
    )
    vi.spyOn(roomApi, 'finishRoomGame').mockRejectedValue(new Error('offline'))
    playUntilPodium()

    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    await flushPendingFinishes()
    await flushPromises()

    expect(wrapper.find('[data-test="finish-sync"]').exists()).toBe(false)
  })
})
