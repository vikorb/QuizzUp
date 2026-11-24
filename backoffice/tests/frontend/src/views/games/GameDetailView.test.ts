import { setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  abortGameServiceMock,
  acceptGameRegistrationServiceMock,
  createGameFixture,
  createParticipantFixture,
  createRegistrationFixture,
  listGameRegistrationsServiceMock,
  loadGameServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { setLiveRooms, useLiveCompanyMock } from '@frontend-tests/_helpers/liveCompanyMock'
import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  GAME_STATE_FINISHED,
  GAME_STATE_RUNNING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  type RoomStatusReport,
} from '@quizzup/shared'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import GameDetailView from '@/views/games/GameDetailView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

// Les vues partagent les salles simulées : une vue oubliée relirait la partie à chaque rapport.
enableAutoUnmount(afterEach)

beforeEach(() => {
  resetGamesServiceMock()
  setAuthenticatedUser({ companyId: 1 })
  currentRouteMock.params = { gameId: '4' }
})

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GameDetailView)

  await flushPromises()

  return wrapper
}

function participantRows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="base-table-row"]')
}

// Rapport de la salle 10 pour la partie 4 (celle de la route).
function createStatus(overrides: Partial<RoomStatusReport> = {}): RoomStatusReport {
  return {
    screen: 'play',
    gameId: 4,
    phase: 'question',
    round: 1,
    questionIndex: 0,
    miniGame: null,
    paused: false,
    scores: [{ podium: 1, score: 10 }],
    audioReady: true,
    ...overrides,
  }
}

function abortButton(wrapper: VueWrapper) {
  return wrapper.find('[data-test="game-detail-abort"]')
}

describe('views/games/GameDetailView.vue', () => {
  it('loads the game of the route in the company of the user', async () => {
    const wrapper = await mountView()

    expect(loadGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(wrapper.text()).toContain('Salle Néon')
    expect(wrapper.text()).toContain('games.state.pending')
    expect(wrapper.text()).toContain('games.detail.fields.formatValue')
  })

  it('shows the sign-up panel of a pending game and reloads the game once a request is validated', async () => {
    listGameRegistrationsServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { registrations: [createRegistrationFixture({ id: 5 })] },
    })

    const wrapper = await mountView()

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledWith(1, 4)
    expect(wrapper.find('[data-test="game-join-registration-5"]').exists()).toBe(true)

    await wrapper.get('[data-test="game-join-accept"]').trigger('click')
    await flushPromises()

    expect(acceptGameRegistrationServiceMock).toHaveBeenCalledWith(1, 4, 5, undefined)
    expect(loadGameServiceMock).toHaveBeenCalledTimes(2)
  })

  it('has no sign-up panel for a game that is not pending', async () => {
    loadGameServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_FINISHED }) },
    })

    const wrapper = await mountView()

    expect(listGameRegistrationsServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="game-join-panel"]').exists()).toBe(false)
  })

  it('shows « all » mini-games when the game has no restriction', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('games.detail.fields.miniGames')
    expect(wrapper.get('[data-test="game-detail-mini-games"]').text()).toBe(
      'games.detail.fields.miniGamesAll'
    )
  })

  it.each([[null], [[]]])('shows « all » mini-games for %j', async (miniGames) => {
    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, miniGames }) },
    })
    const wrapper = await mountView()

    expect(wrapper.get('[data-test="game-detail-mini-games"]').text()).toBe(
      'games.detail.fields.miniGamesAll'
    )
  })

  it('lists the names of the chosen mini-games', async () => {
    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        game: createGameFixture({ id: 4, miniGames: [MINI_GAME_FIRST_BUZZ, MINI_GAME_ESTIMATE] }),
      },
    })
    const wrapper = await mountView()

    expect(wrapper.get('[data-test="game-detail-mini-games"]').text()).toBe(
      `games.miniGames.${MINI_GAME_FIRST_BUZZ}, games.miniGames.${MINI_GAME_ESTIMATE}`
    )
  })

  it('lists the participants by podium with score and email', async () => {
    const wrapper = await mountView()
    const rows = participantRows(wrapper)

    expect(rows.map((row) => row.attributes('data-row-key'))).toEqual(['1', '2'])
    expect(rows[0].get('[data-test="base-table-cell-displayName"]').text()).toBe('Team A')
    expect(rows[0].get('[data-test="base-table-cell-score"]').text()).toBe('12')
    expect(rows[0].get('[data-test="base-table-cell-email"]').text()).toBe('a@quizzup.test')
    expect(rows[1].get('[data-test="base-table-cell-email"]').text()).toBe('—')
  })

  it('shows the second player under the first one, with masked emails for the staff', async () => {
    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        game: createGameFixture({
          id: 4,
          participants: [
            createParticipantFixture({
              id: 1,
              podium: 1,
              displayName: 'Team A',
              email: null,
              hasEmail: true,
              score: 12,
              secondPlayer: {
                displayName: 'Alex',
                email: null,
                hasEmail: true,
                consentAt: '2026-11-03T10:00:00.000Z',
                marketingConsent: true,
              },
            }),
            createParticipantFixture({
              id: 2,
              podium: 2,
              displayName: 'Team B',
              secondPlayer: {
                displayName: 'Sam',
                email: null,
                hasEmail: false,
                consentAt: null,
                marketingConsent: false,
              },
            }),
          ],
        }),
      },
    })

    const wrapper = await mountView()
    const rows = participantRows(wrapper)

    expect(rows).toHaveLength(2)
    expect(rows[0].get('[data-test="game-player-name-1"]').text()).toBe('Team A')
    expect(rows[0].get('[data-test="game-player-name-2"]').text()).toBe('Alex')
    expect(rows[1].get('[data-test="game-player-name-2"]').text()).toBe('Sam')
    expect(rows[0].get('[data-test="base-table-cell-score"]').text()).toBe('12')
    expect(rows[0].get('[data-test="game-player-email-1"]').text()).toBe('games.detail.emailMasked')
    expect(rows[0].get('[data-test="game-player-email-2"]').text()).toBe('games.detail.emailMasked')
    expect(rows[1].get('[data-test="game-player-email-1"]').text()).toBe('—')
    expect(rows[1].get('[data-test="game-player-email-2"]').text()).toBe('—')
  })

  it('stops the game after confirmation and shows its new state', async () => {
    const wrapper = await mountView()

    await abortButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    expect(abortGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(wrapper.text()).toContain('games.state.aborted')
    expect(wrapper.get('[data-test="base-banner"]').text()).toContain('games.banners.aborted')
    expect(abortButton(wrapper).exists()).toBe(false)
  })

  it('keeps the game when the confirmation is cancelled', async () => {
    setConfirmResult(false)

    const wrapper = await mountView()

    await abortButton(wrapper).trigger('click')
    await flushPromises()

    expect(abortGameServiceMock).not.toHaveBeenCalled()
  })

  it('shows the stop error', async () => {
    mockServiceFailure(abortGameServiceMock, 'game_already_over', 409)

    const wrapper = await mountView()

    await abortButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
      'games.errors.gameAlreadyOver'
    )
  })

  it('offers to stop a running game, not a finished one', async () => {
    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_RUNNING, participants: [] }) },
    })

    expect(abortButton(await mountView()).exists()).toBe(true)

    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_FINISHED, participants: [] }) },
    })

    expect(abortButton(await mountView()).exists()).toBe(false)
  })

  it('links to the results sheet of a finished game only', async () => {
    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_FINISHED, participants: [] }) },
    })

    const finished = await mountView()
    const link = finished.get('[data-test="game-detail-results"]')

    expect(link.text()).toBe('games.detail.results')

    await link.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-results',
      params: { gameId: '4' },
      query: {},
    })

    // Une partie en attente (par défaut du mock), en cours ou arrêtée n'a pas de feuille.
    expect((await mountView()).find('[data-test="game-detail-results"]').exists()).toBe(false)

    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_RUNNING, participants: [] }) },
    })

    expect((await mountView()).find('[data-test="game-detail-results"]').exists()).toBe(false)
  })

  it('shows a not found game as an empty state', async () => {
    mockServiceFailure(loadGameServiceMock, 'not_found', 404)

    const wrapper = await mountView()
    const card = wrapper.get('[data-test="base-card"]')

    expect(card.attributes('data-empty')).toBe('true')
    expect(card.attributes('data-error')).toBe('')
  })

  it('rejects an invalid game id without calling the API', async () => {
    currentRouteMock.params = { gameId: 'abc' }

    const wrapper = await mountView()

    expect(loadGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('invalid_params')
  })

  it('inserts the live panel when the room reports this game, and not for another game', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="game-live-panel"]').exists()).toBe(false)

    setLiveRooms([createRoomLive({ roomId: 10, status: createStatus({ gameId: 5 }) })])
    await nextTick()

    expect(wrapper.find('[data-test="game-live-panel"]').exists()).toBe(false)

    setLiveRooms([createRoomLive({ roomId: 10, status: createStatus() })])
    await nextTick()

    expect(wrapper.find('[data-test="game-live-panel"]').exists()).toBe(true)
  })

  it('reads the game again once when the room reports it over, which closes the stream', async () => {
    setLiveRooms([createRoomLive({ roomId: 10, status: createStatus() })])

    const wrapper = await mountView()
    const companyOf = useLiveCompanyMock.mock.calls[0]?.[0] as () => number | null

    expect(loadGameServiceMock).toHaveBeenCalledTimes(1)
    expect(companyOf()).toBe(1)

    loadGameServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { game: createGameFixture({ id: 4, state: GAME_STATE_FINISHED }) },
    })
    setLiveRooms([createRoomLive({ roomId: 10, status: createStatus({ phase: 'finished' }) })])
    await flushPromises()

    expect(loadGameServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('games.state.finished')
    expect(companyOf()).toBeNull()

    // Un rapport de plus dans la même phase ne relit rien.
    setLiveRooms([
      createRoomLive({
        roomId: 10,
        status: createStatus({ phase: 'finished', scores: [{ podium: 1, score: 99 }] }),
      }),
    ])
    await flushPromises()

    expect(loadGameServiceMock).toHaveBeenCalledTimes(2)
  })

  it('goes back to the list', async () => {
    const wrapper = await mountView()
    const backButton = wrapper
      .findAll('[data-test="ui-button"]')
      .find((button) => button.text() === 'games.actions.back')

    await backButton?.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: {} })
  })
})
