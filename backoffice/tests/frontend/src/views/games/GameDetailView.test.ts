import { setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  abortGameServiceMock,
  createGameFixture,
  createParticipantFixture,
  loadGameServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { GAME_STATE_FINISHED, GAME_STATE_RUNNING } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GameDetailView from '@/views/games/GameDetailView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

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
              },
            }),
            createParticipantFixture({
              id: 2,
              podium: 2,
              displayName: 'Team B',
              secondPlayer: { displayName: 'Sam', email: null, hasEmail: false, consentAt: null },
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

  it('goes back to the list', async () => {
    const wrapper = await mountView()
    const backButton = wrapper
      .findAll('[data-test="ui-button"]')
      .find((button) => button.text() === 'games.actions.back')

    await backButton?.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: {} })
  })
})
