import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import {
  loadCompanyDetailsServiceMock,
  mockLoadCompanyDetailsFailure,
} from '@frontend-tests/_helpers/companiesServiceMock'
import {
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

import type { Game } from '@/types/game'
import GameResultsView from '@/views/games/results/GameResultsView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

const printMock = vi.fn()

beforeEach(() => {
  resetGamesServiceMock()
  setAuthenticatedAdmin({ companyId: 1 })
  currentRouteMock.params = { gameId: '4' }
  currentRouteMock.query = {}
  printMock.mockReset()
  vi.spyOn(window, 'print').mockImplementation(printMock)
})

function finishedGame(overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    id: 4,
    state: GAME_STATE_FINISHED,
    finishedAt: '2026-11-03T15:30:00.000Z',
    participants: [
      createParticipantFixture({ id: 1, podium: 1, displayName: 'Team A', score: 12 }),
      createParticipantFixture({ id: 2, podium: 2, displayName: 'Team B', score: 7 }),
      createParticipantFixture({ id: 3, podium: 3, displayName: 'Team C', score: 7 }),
      createParticipantFixture({ id: 4, podium: 4, displayName: 'Team D', score: 2 }),
    ],
    ...overrides,
  })
}

function mockGame(game: Game): void {
  loadGameServiceMock.mockResolvedValue({ ok: true, status: 200, data: { game } })
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GameResultsView)

  await flushPromises()

  return wrapper
}

function rowTexts(wrapper: VueWrapper, test: string): string[] {
  return wrapper.findAll(`[data-test="${test}"]`).map((cell) => cell.text())
}

describe('views/games/results/GameResultsView.vue', () => {
  it('shows the company, the room, the date and the ranking of a finished game', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(loadGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(loadCompanyDetailsServiceMock).toHaveBeenCalledWith(1)
    expect(wrapper.get('[data-test="results-company"]').text()).toBe('Acme Corp')
    expect(wrapper.get('[data-test="results-room"]').text()).toBe('Salle Néon')
    expect(wrapper.get('[data-test="results-date"]').text()).not.toBe('—')
    expect(rowTexts(wrapper, 'results-rank')).toEqual(['1', '2', '2', '4'])
    expect(rowTexts(wrapper, 'results-names')).toEqual(['Team A', 'Team B', 'Team C', 'Team D'])
    expect(rowTexts(wrapper, 'results-score')).toEqual(['12', '7', '7', '2'])
  })

  it('shows the second player of a team under the first one', async () => {
    mockGame(
      finishedGame({
        participants: [
          createParticipantFixture({
            id: 1,
            displayName: 'Team A',
            score: 3,
            secondPlayer: { displayName: 'Alex', email: null, hasEmail: false, consentAt: null },
          }),
        ],
      })
    )

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-names"]').text()).toContain('Team A')
    expect(wrapper.get('[data-test="results-names"]').text()).toContain('Alex')
  })

  it('never puts a player email in the page, even when the API sends one', async () => {
    mockGame(
      finishedGame({
        participants: [
          createParticipantFixture({
            id: 1,
            podium: 1,
            displayName: 'Team A',
            email: 'first@quizzup.test',
            hasEmail: true,
            consentAt: '2026-11-03T10:00:00.000Z',
            score: 5,
            secondPlayer: {
              displayName: 'Alex',
              email: 'second@quizzup.test',
              hasEmail: true,
              consentAt: '2026-11-03T10:00:00.000Z',
            },
          }),
        ],
      })
    )

    const wrapper = await mountView()

    expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(1)
    expect(wrapper.html()).not.toContain('quizzup.test')
    expect(wrapper.html()).not.toContain('@')
  })

  it('prints the sheet with the browser print dialog', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    await wrapper.get('[data-test="results-print"]').trigger('click')

    expect(printMock).toHaveBeenCalledTimes(1)
  })

  it('has a single primary button', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()
    const primary = wrapper.findAll('[data-variant="primary"]')

    expect(primary).toHaveLength(1)
    expect(primary[0].text()).toBe('games.results.print')
  })

  it('goes back to the game', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    await wrapper.get('[data-test="results-back"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '4' },
      query: {},
    })
  })

  it('keeps the company of the query for the superadmin', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '7' }
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(loadGameServiceMock).toHaveBeenCalledWith(7, 4)

    await wrapper.get('[data-test="results-back"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '4' },
      query: { companyId: '7' },
    })
  })

  it('stays printable when the company name cannot be read', async () => {
    mockLoadCompanyDetailsFailure('forbidden')
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="results-company"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(4)
  })

  it('shows the loading state while the game loads', async () => {
    loadGameServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = mountWithFrontendMocks(GameResultsView)

    await flushPromises()

    expect(wrapper.get('[data-test="results-loading"]').text()).toBe('games.results.loading')
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('shows the translated error when the game cannot be loaded', async () => {
    mockServiceFailure(loadGameServiceMock, 'not_found', 404)

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-error"]').text()).toBe('games.errors.notFound')
    expect(wrapper.find('[data-test="results-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('rejects an invalid game id without calling the API', async () => {
    currentRouteMock.params = { gameId: 'abc' }

    const wrapper = await mountView()

    expect(loadGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="results-error"]').exists()).toBe(true)
  })

  it('shows an empty state for a finished game without participant', async () => {
    mockGame(finishedGame({ participants: [] }))

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-empty"]').text()).toBe('games.results.empty')
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('refuses the sheet of a game that is not finished', async () => {
    mockGame(finishedGame({ state: GAME_STATE_RUNNING }))

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-unfinished"]').text()).toBe('games.results.notFinished')
    expect(wrapper.find('[data-test="results-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })
})
