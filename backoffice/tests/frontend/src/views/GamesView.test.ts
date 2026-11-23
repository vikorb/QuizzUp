import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  abortGameServiceMock,
  createGameFixture,
  createParticipantFixture,
  listGameRoomsServiceMock,
  listGamesServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import {
  liveErrorKeyMock,
  liveStateMock,
  setLiveRooms,
  useLiveCompanyMock,
} from '@frontend-tests/_helpers/liveCompanyMock'
import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import {
  GAME_LIST_DEFAULT_LIMIT,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  ROOM_PRESENCE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toValue } from 'vue'

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

function findDateInput(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('[data-test="form-field"]')
    .find((candidate) => candidate.get('[data-test="form-field-label"]').text() === label)

  if (!field) {
    throw new Error(`date field ${label} not found`)
  }

  return field.get('input')
}

function createDeferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((done) => {
    resolve = done
  })

  return { promise, resolve }
}

function lastQuery() {
  return listGamesServiceMock.mock.lastCall?.[1]
}

function findRow(wrapper: VueWrapper, gameId: number) {
  return wrapper.get(`[data-test="base-table-row"][data-row-key="${gameId}"]`)
}

function presenceOf(wrapper: VueWrapper, gameId: number) {
  return findRow(wrapper, gameId).find('[data-test="room-presence"]')
}

describe('views/GamesView.vue', () => {
  it('lists the games of the company of the signed-in admin', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountGamesView()

    expect(listGamesServiceMock).toHaveBeenCalledWith(1, {
      limit: GAME_LIST_DEFAULT_LIMIT,
      offset: 0,
    })
    expect(rowIds(wrapper)).toEqual(['4', '3', '2', '1'])
    expect(wrapper.findAll('[data-test="base-table-header"]').map((th) => th.text())).toEqual([
      'games.table.columns.date',
      'games.table.columns.room',
      'games.table.columns.participants',
      'games.table.columns.duration',
      'games.table.columns.topScore',
      'games.table.columns.state',
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

  it('shows the date, players, duration and top score of each game', async () => {
    setAuthenticatedAdmin()

    const wrapper = await mountGamesView()
    const cell = (gameId: number, column: string) =>
      findRow(wrapper, gameId).get(`[data-test="base-table-cell-${column}"]`).text()

    // Partie terminée : durée en m:ss et meilleur score.
    expect(cell(2, 'durationSeconds')).toBe('42:07')
    expect(cell(2, 'topScore')).toBe('30')
    expect(cell(2, 'participantsCount')).toBe('2')
    // Pas encore terminée : des tirets, pas de zéro trompeur.
    expect(cell(4, 'durationSeconds')).toBe('—')
    expect(cell(4, 'topScore')).toBe('—')
    // La date est celle du démarrage, ou de la création avant.
    expect(cell(2, 'date')).toMatch(/0?2\/11\/2026/)
    expect(cell(4, 'date')).toMatch(/0?3\/11\/2026/)
  })

  it('asks the API for the chosen state and goes back to the first page', async () => {
    setAuthenticatedAdmin()
    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { games: [createGameFixture({ id: 3, state: GAME_STATE_RUNNING })], total: 120 },
    })

    const wrapper = await mountGamesView()
    await wrapper.get('[data-test="pagination-next"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: GAME_LIST_DEFAULT_LIMIT })

    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_RUNNING)
    await flushPromises()

    expect(lastQuery()).toEqual({
      state: GAME_STATE_RUNNING,
      limit: GAME_LIST_DEFAULT_LIMIT,
      offset: 0,
    })
    // Chargement initial, page suivante, nouveau filtre : un seul appel par action.
    expect(listGamesServiceMock).toHaveBeenCalledTimes(3)

    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_FINISHED)
    await flushPromises()

    expect(lastQuery()).toMatchObject({ state: GAME_STATE_FINISHED })

    await wrapper.get('[data-test="base-toolbar-reset"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toEqual({ limit: GAME_LIST_DEFAULT_LIMIT, offset: 0 })
  })

  it('offers the rooms of the company and filters on the chosen one', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountGamesView()

    expect(listGameRoomsServiceMock).toHaveBeenCalledWith(1)
    expect(
      findSelect(wrapper, 'games.filters.room')
        .findAll('option')
        .map((option) => option.attributes('value'))
    ).toEqual(['', '10', '11', '12'])

    await findSelect(wrapper, 'games.filters.room').setValue('11')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ roomId: 11, offset: 0 })
  })

  it('sends the chosen period as [start of the first day, start of the day after the last)', async () => {
    setAuthenticatedAdmin()

    const wrapper = await mountGamesView()

    await findDateInput(wrapper, 'games.filters.from').setValue('2026-11-05')
    await flushPromises()
    await findDateInput(wrapper, 'games.filters.to').setValue('2026-11-07')
    await flushPromises()

    expect(lastQuery()).toEqual({
      from: new Date(2026, 10, 5, 0, 0, 0, 0).toISOString(),
      to: new Date(2026, 10, 8, 0, 0, 0, 0).toISOString(),
      limit: GAME_LIST_DEFAULT_LIMIT,
      offset: 0,
    })
  })

  it('keeps the rooms of the last company when the rooms of the previous one arrive late', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    const first = createDeferred()
    listGameRoomsServiceMock.mockImplementationOnce(() => first.promise as never)

    const wrapper = await mountGamesView()

    listGameRoomsServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { rooms: [{ id: 20, name: 'Salle Deux', status: ROOM_STATUS_ACTIVE }] },
    })
    await findSelect(wrapper, 'games.filters.company').setValue('2')
    await flushPromises()
    first.resolve({ ok: true, status: 200, data: { rooms: roomsFixture } })
    await flushPromises()

    expect(
      findSelect(wrapper, 'games.filters.room')
        .findAll('option')
        .map((option) => option.attributes('value'))
    ).toEqual(['', '20'])
  })

  it('pages through the games', async () => {
    setAuthenticatedAdmin()
    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { games: [createGameFixture({ id: 3 })], total: 120 },
    })

    const wrapper = await mountGamesView()
    const previous = () => wrapper.get('[data-test="pagination-previous"]')

    expect(wrapper.get('[data-test="pagination-range"]').text()).toBe('pagination.range')
    expect(previous().attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="pagination-next"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: GAME_LIST_DEFAULT_LIMIT })
    expect(previous().attributes('disabled')).toBeUndefined()

    await previous().trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: 0 })
  })

  it('shows the empty state and no pagination when there is no game', async () => {
    setAuthenticatedAdmin()
    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { games: [], total: 0 },
    })

    const wrapper = await mountGamesView()

    expect(wrapper.find('[data-test="base-card-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pagination-next"]').exists()).toBe(false)
  })

  it('keeps the last answer when an older one arrives late', async () => {
    setAuthenticatedAdmin()
    const first = createDeferred()
    listGamesServiceMock.mockImplementationOnce(() => first.promise as never)

    const wrapper = await mountGamesView()

    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { games: [createGameFixture({ id: 77 })], total: 1 },
    })
    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_RUNNING)
    await flushPromises()
    first.resolve({
      ok: true,
      status: 200,
      data: { games: [createGameFixture({ id: 5 })], total: 1 },
    })
    await flushPromises()

    expect(rowIds(wrapper)).toEqual(['77'])
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

  it('keeps the participants count of the list after stopping a game', async () => {
    setAuthenticatedUser({ companyId: 1 })
    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        // 3 joueurs nommés sur 2 pupitres : le détail renvoyé par l'arrêt compte les pupitres.
        games: [createGameFixture({ id: 4, participantsCount: 3 })],
        total: 1,
      },
    })
    abortGameServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        game: {
          ...createGameFixture({ id: 4, state: GAME_STATE_ABORTED }),
          participantsCount: undefined,
          participants: [
            createParticipantFixture({ id: 1, podium: 1 }),
            createParticipantFixture({ id: 2, podium: 2 }),
          ],
        },
      },
    })

    const wrapper = await mountGamesView()

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(findRow(wrapper, 4).get('[data-test="base-table-cell-participantsCount"]').text()).toBe(
      '3'
    )
  })

  it('reloads the page after stopping a game when a state filter is active', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountGamesView()

    await findSelect(wrapper, 'games.filters.state').setValue(GAME_STATE_PENDING)
    await flushPromises()
    listGamesServiceMock.mockClear()
    // Le serveur ne renvoie plus la partie arrêtée, et le total baisse.
    listGamesServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { games: [createGameFixture({ id: 3, state: GAME_STATE_PENDING })], total: 1 },
    })

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(abortGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    expect(lastQuery()).toMatchObject({ state: GAME_STATE_PENDING, offset: 0 })
    expect(rowIds(wrapper)).toEqual(['3'])
    expect(wrapper.get('[data-test="base-banner"]').text()).toContain('games.banners.aborted')
  })

  it('does not reload the list after stopping a game without a state filter', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountGamesView()
    listGamesServiceMock.mockClear()

    await findRow(wrapper, 4).get('[data-test="game-abort"]').trigger('click')
    await flushPromises()

    expect(listGamesServiceMock).not.toHaveBeenCalled()
    expect(findRow(wrapper, 4).text()).toContain('games.state.aborted')
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
    expect(wrapper.find('[data-test="pagination-next"]').exists()).toBe(false)
  })

  describe('live presence', () => {
    it('follows the live presence of the company of the signed-in admin', async () => {
      setAuthenticatedAdmin({ companyId: 1 })

      await mountGamesView()

      expect(toValue(useLiveCompanyMock.mock.calls[0][0])).toBe(1)
    })

    it('shows the presence of the room of each pending or running game', async () => {
      setAuthenticatedAdmin()
      setLiveRooms([
        createRoomLive({ roomId: 10, presence: ROOM_PRESENCE.OFFLINE }),
        createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.IN_GAME }),
      ])

      const wrapper = await mountGamesView()

      expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('offline')
      expect(presenceOf(wrapper, 4).text()).toContain('live.presence.offline')
      expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('in_game')
      expect(presenceOf(wrapper, 3).text()).toContain('live.presence.in_game')
    })

    it('shows no presence for a finished or stopped game', async () => {
      setAuthenticatedAdmin()
      setLiveRooms([createRoomLive({ roomId: 10 })])

      const wrapper = await mountGamesView()

      expect(presenceOf(wrapper, 2).exists()).toBe(false)
      expect(presenceOf(wrapper, 1).exists()).toBe(false)
    })

    it('updates a badge when the room changes state', async () => {
      setAuthenticatedAdmin()
      setLiveRooms([createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.ONLINE })])

      const wrapper = await mountGamesView()

      expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('online')

      setLiveRooms([createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.IN_GAME })])
      await flushPromises()

      expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('in_game')
    })

    it('claims nothing while the live stream is cut', async () => {
      setAuthenticatedAdmin()
      setLiveRooms([createRoomLive({ roomId: 10 }), createRoomLive({ roomId: 11 })])
      liveStateMock.value = 'reconnecting'

      const wrapper = await mountGamesView()

      expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('unknown')
      expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('unknown')
      expect(wrapper.text()).not.toContain('live.presence.online')
      expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
        'live.connection.reconnecting'
      )
    })

    it('shows the translated live error and keeps the games list', async () => {
      setAuthenticatedAdmin()
      liveStateMock.value = 'error'
      liveErrorKeyMock.value = 'errors.too_many_streams'

      const wrapper = await mountGamesView()

      expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
        'errors.too_many_streams'
      )
      expect(rowIds(wrapper)).toEqual(['4', '3', '2', '1'])
    })

    it('shows no live note when there is nothing to follow', async () => {
      setAuthenticatedAdmin()
      liveStateMock.value = 'idle'

      const wrapper = await mountGamesView()

      expect(wrapper.find('[data-test="live-connection-note"]').exists()).toBe(false)
      expect(rowIds(wrapper)).toEqual(['4', '3', '2', '1'])
    })

    it('keeps the loading, error and empty states of the games list', async () => {
      setAuthenticatedAdmin()
      mockServiceFailure(listGamesServiceMock, 'server_error', 500)

      const failed = await mountGamesView()

      expect(failed.get('[data-test="base-card"]').attributes('data-error')).toBe('server_error')
      expect(failed.find('[data-test="room-presence"]').exists()).toBe(false)

      listGamesServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { games: [], total: 0 },
      })

      const empty = await mountGamesView()

      expect(rowIds(empty)).toEqual([])
      expect(empty.find('[data-test="room-presence"]').exists()).toBe(false)
    })

    it('follows the company chosen by the superadmin', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })

      const wrapper = await mountGamesView()
      const companyIdArg = useLiveCompanyMock.mock.calls[0][0]

      expect(toValue(companyIdArg)).toBe(1)

      await findSelect(wrapper, 'games.filters.company').setValue('2')
      await flushPromises()

      expect(toValue(companyIdArg)).toBe(2)
    })
  })

  it('hides the company selector from company staff', async () => {
    setAuthenticatedAdmin()

    const wrapper = await mountGamesView()

    expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
    // Salle et état seulement.
    expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(2)
  })

  it('lets the superadmin switch company', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })

    const wrapper = await mountGamesView()

    expect(loadCompaniesServiceMock).toHaveBeenCalled()

    await findSelect(wrapper, 'games.filters.company').setValue('2')
    await flushPromises()

    expect(listGamesServiceMock).toHaveBeenLastCalledWith(2, {
      limit: GAME_LIST_DEFAULT_LIMIT,
      offset: 0,
    })
    expect(listGameRoomsServiceMock).toHaveBeenLastCalledWith(2)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'games', query: { companyId: '2' } })

    await wrapper.get('[data-test="base-toolbar-primary"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games-create', query: { companyId: '2' } })
  })
})
