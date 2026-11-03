import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  abortGameServiceMock,
  listGamesServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import { GAME_STATE_FINISHED, GAME_STATE_RUNNING } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GamesView from '@/views/GamesView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

async function mountGamesView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GamesView)

  await flushPromises()

  return wrapper
}

function rowIds(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test="base-table-row"]')
    .map((row) => row.attributes('data-row-key') ?? '')
}

function findSelect(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('[data-test="select-field"]')
    .find((candidate) => candidate.find('span').text() === label)

  if (!field) {
    throw new Error(`select ${label} not found`)
  }

  return field.find('select')
}

function findRow(wrapper: VueWrapper, gameId: number) {
  return wrapper.get(`[data-test="base-table-row"][data-row-key="${gameId}"]`)
}

describe('views/GamesView.vue', () => {
  it('lists the games of the company of the signed-in admin', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountGamesView()

    expect(listGamesServiceMock).toHaveBeenCalledWith(1)
    expect(rowIds(wrapper)).toEqual(['4', '3', '2', '1'])
    expect(wrapper.findAll('[data-test="base-table-header"]').map((th) => th.text())).toEqual([
      'games.table.columns.room',
      'games.table.columns.state',
      'games.table.columns.participants',
      'games.table.columns.date',
      'games.table.columns.actions',
    ])
    expect(findRow(wrapper, 3).text()).toContain('Salle Laser')
    expect(findRow(wrapper, 3).text()).toContain('games.state.running')
  })

  it('lets the operator (user role) launch a game', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountGamesView()

    await wrapper.get('[data-test="base-toolbar-primary"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games-create', query: {} })
  })

  it('opens the detail of a game', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountGamesView()

    await findRow(wrapper, 3).get('[data-test="game-view"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '3' },
      query: {},
    })
  })

  it('filters the games by state', async () => {
    setAuthenticatedAdmin()

    const wrapper = await mountGamesView()

    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_RUNNING)

    expect(rowIds(wrapper)).toEqual(['3'])

    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_FINISHED)

    expect(rowIds(wrapper)).toEqual(['2'])

    await wrapper.get('[data-test="base-toolbar-reset"]').trigger('click')

    expect(rowIds(wrapper)).toHaveLength(4)
  })

  it('stops a pending game after confirmation', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountGamesView()

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', confirmLabel: 'games.actions.abort' })
    )
    expect(abortGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(findRow(wrapper, 4).text()).toContain('games.state.aborted')
    expect(wrapper.get('[data-test="base-banner"]').text()).toContain('games.banners.aborted')
  })

  it('does not stop the game when the confirmation is cancelled', async () => {
    setAuthenticatedUser()
    setConfirmResult(false)

    const wrapper = await mountGamesView()

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(abortGameServiceMock).not.toHaveBeenCalled()
  })

  it('only offers to stop pending or running games', async () => {
    setAuthenticatedUser()

    const wrapper = await mountGamesView()
    const abortDisabled = (gameId: number) =>
      findRow(wrapper, gameId).get('[data-test="game-abort"]').attributes('disabled') !== undefined

    expect(abortDisabled(4)).toBe(false)
    expect(abortDisabled(3)).toBe(false)
    expect(abortDisabled(2)).toBe(true)
    expect(abortDisabled(1)).toBe(true)
  })

  it('shows an error banner when stopping fails', async () => {
    setAuthenticatedUser()
    mockServiceFailure(abortGameServiceMock, 'game_already_over', 409)

    const wrapper = await mountGamesView()

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
      'games.errors.gameAlreadyOver'
    )
  })

  it('shows a success banner when coming back from the launch form', async () => {
    setAuthenticatedAdmin()
    currentRouteMock.query = { created: '3' }

    const wrapper = await mountGamesView()

    expect(wrapper.get('[data-test="base-banner"]').text()).toContain('games.banners.created')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'games', query: {} })
  })

  it('shows the list error', async () => {
    setAuthenticatedAdmin()
    mockServiceFailure(listGamesServiceMock, 'forbidden', 403)

    const wrapper = await mountGamesView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
  })

  it('hides the company selector from company staff', async () => {
    setAuthenticatedAdmin()

    const wrapper = await mountGamesView()

    expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(1)
  })

  it('lets the superadmin switch company', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })

    const wrapper = await mountGamesView()

    expect(loadCompaniesServiceMock).toHaveBeenCalled()

    await findSelect(wrapper, 'games.filters.company').setValue('2')
    await flushPromises()

    expect(listGamesServiceMock).toHaveBeenLastCalledWith(2)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'games', query: { companyId: '2' } })

    await wrapper.get('[data-test="base-toolbar-primary"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games-create', query: { companyId: '2' } })
  })
})
