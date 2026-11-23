import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  cancelGameServiceMock,
  createGameFixture,
  createScheduledGameFixture,
  createScheduleFixture,
  listGameRoomsServiceMock,
  listGamesServiceMock,
  mockServiceFailure,
  openGameServiceMock,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import { GAME_STATE_PENDING, ROOM_STATUS_ACTIVE, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game, GameRoom } from '@/types/game'
import AgendaView from '@/views/AgendaView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

type GamesResult = Awaited<ReturnType<typeof listGamesServiceMock>>

/** 00:30 à Paris le 24 novembre alors qu'il est encore le 23 en UTC : le jour affiché est celui de la salle. */
const JUST_AFTER_PARIS_MIDNIGHT = new Date('2026-11-23T23:30:00.000Z')

function createRooms(schedule = createScheduleFixture()): GameRoom[] {
  return [
    { id: 10, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE, desksCount: 4, schedule },
    {
      id: 11,
      name: 'Salle Laser',
      status: ROOM_STATUS_ACTIVE,
      desksCount: 6,
      schedule: createScheduleFixture({ opensAt: '18:00', closesAt: '20:00' }, 'America/Montreal'),
    },
    { id: 12, name: 'Salle fermée', status: ROOM_STATUS_INACTIVE },
  ]
}

function serveRooms(rooms: GameRoom[]): void {
  listGameRoomsServiceMock.mockResolvedValue({ ok: true, status: 200, data: { rooms } })
}

function serveGames({ games }: { games: Game[] }): void {
  listGamesServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { games, total: games.length },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

beforeEach(() => {
  resetGamesServiceMock()
  // Seule `Date` est simulée : `flushPromises` a besoin des vraies minuteries.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(JUST_AFTER_PARIS_MIDNIGHT)
  setAuthenticatedAdmin({ companyId: 1 })
  serveRooms(createRooms())
  serveGames({ games: [] })
})

// L'écran écoute `visibilitychange` sur le document : un écran resté monté d'un test à l'autre
// relirait l'agenda et fausserait les appels comptés.
const mounted = new Set<VueWrapper>()

afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount())
  mounted.clear()
  vi.useRealTimers()
})

async function mountAgenda(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(AgendaView, {
    // Le vrai bouton garde les `data-test` de l'écran, que la doublure écraserait.
    global: { stubs: { uiButton: false } },
  })

  mounted.add(wrapper)
  await flushPromises()

  return wrapper
}

function unmountAgenda(wrapper: VueWrapper): void {
  mounted.delete(wrapper)
  wrapper.unmount()
}

function kinds(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-test="agenda-row"]').map((row) => row.attributes('data-kind') ?? '')
}

function times(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-test="agenda-time"]').map((time) => time.text())
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

function dateInput(wrapper: VueWrapper) {
  return wrapper.get<HTMLInputElement>('[data-test="agenda-date"]')
}

async function pickDate(wrapper: VueWrapper, value: string): Promise<void> {
  const input = dateInput(wrapper)

  input.element.value = value
  await input.trigger('change')
  await flushPromises()
}

function gameRow(wrapper: VueWrapper, gameId: number) {
  return wrapper.get(`[data-key="game-${gameId}"]`)
}

function hasButton(wrapper: VueWrapper, gameId: number, name: string): boolean {
  return gameRow(wrapper, gameId).find(`[data-test="agenda-${name}"]`).exists()
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function bannerText(wrapper: VueWrapper): string {
  return wrapper.get('[data-test="base-banner"]').text()
}

describe('views/AgendaView.vue', () => {
  describe('nominal display', () => {
    it('lists the day of the room, in the room time zone, with the free slots and the sessions', async () => {
      serveGames({
        games: [
          createScheduledGameFixture('2026-11-24T10:00:00.000Z', {
            id: 5,
            externalRef: 'BK-42',
            source: 'api',
            playersCount: 3,
          }),
        ],
      })

      const wrapper = await mountAgenda()

      // Il est 23:30 en UTC mais déjà le 24 à Paris : l'agenda s'ouvre sur le jour de la salle.
      expect(dateInput(wrapper).element.value).toBe('2026-11-24')
      expect(listGamesServiceMock).toHaveBeenCalledWith(1, {
        roomId: 10,
        from: '2026-11-23T23:00:00.000Z',
        to: '2026-11-25T23:00:00.000Z',
        limit: 200,
      })
      expect(kinds(wrapper)).toEqual(['slot', 'game', 'slot', 'slot'])
      expect(times(wrapper)).toEqual([
        '10:00 – 11:00',
        '11:00 – 12:00',
        '12:00 – 13:00',
        '13:00 – 14:00',
      ])
      expect(wrapper.find('[data-test="agenda-timezone"]').exists()).toBe(true)
      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('false')
    })

    it('describes the session: state, players, booking reference and source', async () => {
      serveGames({
        games: [
          createScheduledGameFixture('2026-11-24T10:00:00.000Z', {
            id: 5,
            externalRef: 'BK-42',
            source: 'api',
            playersCount: 3,
          }),
        ],
      })

      const row = gameRow(await mountAgenda(), 5)

      expect(row.get('[data-test="agenda-state"]').attributes('data-state')).toBe('scheduled')
      expect(row.get('[data-test="agenda-state"]').text()).toContain('games.state.scheduled')
      expect(row.get('[data-test="agenda-players"]').text()).toBe('agenda.row.players')
      expect(row.find('[data-test="agenda-ref"]').exists()).toBe(true)
      expect(row.find('[data-test="agenda-source"]').exists()).toBe(true)
    })

    it('says so when a session has no player yet', async () => {
      serveGames({
        games: [
          createScheduledGameFixture('2026-11-24T10:00:00.000Z', { id: 5, participantsCount: 0 }),
        ],
      })

      const row = gameRow(await mountAgenda(), 5)

      expect(row.get('[data-test="agenda-players"]').text()).toBe('agenda.row.noPlayers')
      expect(row.find('[data-test="agenda-ref"]').exists()).toBe(false)
      expect(row.find('[data-test="agenda-source"]').exists()).toBe(false)
    })

    it('proposes the free slots only, with one button per slot', async () => {
      const wrapper = await mountAgenda()

      expect(wrapper.findAll('[data-test="agenda-schedule"]')).toHaveLength(4)
      expect(wrapper.text()).toContain('agenda.row.free')
    })

    it('offers only the active rooms', async () => {
      const wrapper = await mountAgenda()

      expect(findSelect(wrapper, 'agenda.filters.room').findAll('option')).toHaveLength(2)
    })
  })

  describe('states', () => {
    it('shows the loading state, then the list', async () => {
      const pending = deferred<GamesResult>()

      listGamesServiceMock.mockReturnValueOnce(pending.promise)

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('true')
      expect(wrapper.get('[data-test="base-card-loading"]').text()).toBe('agenda.loading')
      expect(wrapper.find('[data-test="agenda-list"]').exists()).toBe(false)

      pending.resolve({ ok: true, status: 200, data: { games: [], total: 0 } })
      await flushPromises()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('false')
      expect(wrapper.find('[data-test="agenda-list"]').exists()).toBe(true)
    })

    it('shows the empty state with a link to the settings for an admin', async () => {
      serveRooms(createRooms({ ...createScheduleFixture(), days: {} }))

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="agenda-empty"]').text()).toContain('agenda.empty')
      expect(
        JSON.parse(wrapper.get('[data-test="agenda-settings-link"]').attributes('data-to') ?? '')
      ).toEqual({ name: 'client-details', params: { id: 1 } })
    })

    it('shows the empty state without the settings link for the staff', async () => {
      setAuthenticatedUser({ companyId: 1 })
      serveRooms(createRooms({ ...createScheduleFixture(), days: {} }))

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="agenda-empty"]').text()).toContain('agenda.empty')
      expect(wrapper.find('[data-test="agenda-settings-link"]').exists()).toBe(false)
    })

    it('shows the empty state of a room without any slot set up', async () => {
      serveRooms([{ id: 10, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE, schedule: null }])

      const wrapper = await mountAgenda()

      expect(wrapper.find('[data-test="agenda-empty"]').exists()).toBe(true)
      expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    })

    it('tells that no room is active, without asking for sessions', async () => {
      serveRooms([{ id: 12, name: 'Salle fermée', status: ROOM_STATUS_INACTIVE }])

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="agenda-empty"]').text()).toContain('agenda.noRoom')
      expect(wrapper.find('[data-test="agenda-settings-link"]').exists()).toBe(false)
      expect(listGamesServiceMock).not.toHaveBeenCalled()
    })

    it('shows the error of the rooms and lets the user retry', async () => {
      mockServiceFailure(listGameRoomsServiceMock, 'forbidden', 403)

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
      expect(wrapper.find('[data-test="agenda-list"]').exists()).toBe(false)
      expect(listGamesServiceMock).not.toHaveBeenCalled()

      serveRooms(createRooms())
      await wrapper.get('[data-test="agenda-retry"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
      expect(kinds(wrapper)).toHaveLength(4)
    })

    it('shows the error of the sessions and lets the user retry', async () => {
      mockServiceFailure(listGamesServiceMock, 'server_error', 500)

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('server_error')
      expect(wrapper.find('[data-test="agenda-list"]').exists()).toBe(false)

      serveGames({ games: [] })
      await wrapper.get('[data-test="agenda-retry"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
      expect(kinds(wrapper)).toHaveLength(4)
    })

    it('turns an unexpected exception into a server error', async () => {
      listGamesServiceMock.mockRejectedValue(new Error('boom'))

      const wrapper = await mountAgenda()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('server_error')
      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('false')
    })
  })

  describe('day and room in the room time zone', () => {
    it('changes the day with the date field and asks for the new window', async () => {
      const wrapper = await mountAgenda()

      await pickDate(wrapper, '2026-12-01')

      expect(listGamesServiceMock).toHaveBeenLastCalledWith(1, {
        roomId: 10,
        from: '2026-11-30T23:00:00.000Z',
        to: '2026-12-02T23:00:00.000Z',
        limit: 200,
      })
      expect(dateInput(wrapper).element.value).toBe('2026-12-01')
    })

    it('ignores a date field emptied by hand or set to the day already shown', async () => {
      const wrapper = await mountAgenda()

      await pickDate(wrapper, '')
      await pickDate(wrapper, '2026-11-24')

      expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    })

    it('goes to the previous and the next day with the arrows', async () => {
      const wrapper = await mountAgenda()

      await wrapper.get('[data-test="agenda-next-day"]').trigger('click')
      await flushPromises()

      expect(dateInput(wrapper).element.value).toBe('2026-11-25')

      await wrapper.get('[data-test="agenda-previous-day"]').trigger('click')
      await wrapper.get('[data-test="agenda-previous-day"]').trigger('click')
      await flushPromises()

      expect(dateInput(wrapper).element.value).toBe('2026-11-23')
      expect(listGamesServiceMock).toHaveBeenCalledTimes(4)
    })

    it("shows the hours of another room in its own time zone, not the browser's", async () => {
      const wrapper = await mountAgenda()

      await findSelect(wrapper, 'agenda.filters.room').setValue('11')
      await flushPromises()

      // Montréal : UTC-5 en novembre, fenêtre du 24 minuit au 26 minuit locaux.
      expect(listGamesServiceMock).toHaveBeenLastCalledWith(1, {
        roomId: 11,
        from: '2026-11-24T05:00:00.000Z',
        to: '2026-11-26T05:00:00.000Z',
        limit: 200,
      })
      expect(times(wrapper)).toEqual(['18:00 – 19:00', '19:00 – 20:00'])
      expect(listGameRoomsServiceMock).toHaveBeenCalledTimes(1)
    })

    it('shows the 23-hour day of the spring change with the hour that does not exist skipped', async () => {
      vi.setSystemTime(new Date('2027-03-27T12:00:00.000Z'))
      serveRooms(createRooms(createScheduleFixture({ opensAt: '01:00', closesAt: '05:00' })))

      const wrapper = await mountAgenda()

      expect(dateInput(wrapper).element.value).toBe('2027-03-27')

      await wrapper.get('[data-test="agenda-next-day"]').trigger('click')
      await flushPromises()

      expect(dateInput(wrapper).element.value).toBe('2027-03-28')
      expect(listGamesServiceMock).toHaveBeenLastCalledWith(1, {
        roomId: 10,
        from: '2027-03-27T23:00:00.000Z',
        to: '2027-03-29T22:00:00.000Z',
        limit: 200,
      })
      // Le créneau de 01:00 dure 60 minutes réelles : il finit à 03:00 à l'horloge de la salle.
      expect(times(wrapper)).toEqual(['01:00 – 03:00', '03:00 – 04:00', '04:00 – 05:00'])
    })

    it('shows the 25-hour day of the autumn change with the repeated hour offered once', async () => {
      vi.setSystemTime(new Date('2027-10-30T12:00:00.000Z'))
      serveRooms(createRooms(createScheduleFixture({ opensAt: '01:00', closesAt: '05:00' })))

      const wrapper = await mountAgenda()

      await pickDate(wrapper, '2027-10-31')

      expect(listGamesServiceMock).toHaveBeenLastCalledWith(1, {
        roomId: 10,
        from: '2027-10-30T22:00:00.000Z',
        to: '2027-11-01T23:00:00.000Z',
        limit: 200,
      })
      // Le créneau de 02:00 (heure d'été) finit à 02:00 (heure d'hiver) : l'heure se répète.
      expect(times(wrapper)).toEqual([
        '01:00 – 02:00',
        '02:00 – 02:00',
        '03:00 – 04:00',
        '04:00 – 05:00',
      ])
    })

    it('shows only the latest answer when the day changes faster than the server answers', async () => {
      const wrapper = await mountAgenda()
      const first = deferred<GamesResult>()
      const second = deferred<GamesResult>()

      listGamesServiceMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

      await wrapper.get('[data-test="agenda-next-day"]').trigger('click')
      await wrapper.get('[data-test="agenda-next-day"]').trigger('click')

      second.resolve({
        ok: true,
        status: 200,
        data: {
          games: [createScheduledGameFixture('2026-11-26T10:00:00.000Z', { id: 26 })],
          total: 1,
        },
      })
      await flushPromises()
      first.resolve({
        ok: true,
        status: 200,
        data: {
          games: [createScheduledGameFixture('2026-11-25T10:00:00.000Z', { id: 25 })],
          total: 1,
        },
      })
      await flushPromises()

      expect(dateInput(wrapper).element.value).toBe('2026-11-26')
      expect(wrapper.find('[data-key="game-26"]').exists()).toBe(true)
      expect(wrapper.find('[data-key="game-25"]').exists()).toBe(false)
    })
  })

  describe('actions on a session', () => {
    // 10:30 à Paris : le jour affiché est le 24 novembre.
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-11-24T09:30:00.000Z'))
      serveGames({
        games: [
          // 09:00 locale, finie depuis 30 minutes sans avoir été lancée.
          createScheduledGameFixture('2026-11-24T08:00:00.000Z', { id: 9 }),
          // En attente de lancement dans la salle : plus rien à ouvrir ni à annuler.
          createScheduledGameFixture('2026-11-24T09:00:00.000Z', {
            id: 10,
            state: GAME_STATE_PENDING,
          }),
          // 11:00 locale, dans 30 minutes : ouvrable.
          createScheduledGameFixture('2026-11-24T10:00:00.000Z', { id: 5 }),
          // 13:00 locale, dans 2 h 30 : trop tôt pour l'ouvrir.
          createScheduledGameFixture('2026-11-24T12:00:00.000Z', { id: 8 }),
        ],
      })
    })

    it('offers open and cancel according to the state and the time of each session', async () => {
      const wrapper = await mountAgenda()

      expect(
        [5, 8, 9, 10].map((id) => [
          hasButton(wrapper, id, 'view'),
          hasButton(wrapper, id, 'open'),
          hasButton(wrapper, id, 'cancel'),
        ])
      ).toEqual([
        [true, true, true],
        [true, false, true],
        [true, true, true],
        [true, false, false],
      ])
    })

    it('shows a scheduled session whose slot is over as not launched', async () => {
      const state = gameRow(await mountAgenda(), 9).get('[data-test="agenda-state"]')

      expect(state.attributes('data-state')).toBe('not_launched')
      expect(state.text()).toContain('agenda.state.notLaunched')
    })

    it('opens a session, tells it, and reads the agenda again', async () => {
      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-open"]').trigger('click')
      await flushPromises()

      expect(openGameServiceMock).toHaveBeenCalledWith(1, 5)
      expect(bannerText(wrapper)).toContain('agenda.banners.opened')
      expect(listGamesServiceMock).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('false')
    })

    it.each([
      ['session_not_open_yet', 'games.errors.sessionNotOpenYet'],
      ['room_busy', 'games.errors.roomBusy'],
      ['game_not_scheduled', 'games.errors.gameNotScheduled'],
    ])(
      'translates the error %s when opening fails, and reads the agenda again',
      async (code, key) => {
        mockServiceFailure(openGameServiceMock, code, 409)

        const wrapper = await mountAgenda()

        await gameRow(wrapper, 5).get('[data-test="agenda-open"]').trigger('click')
        await flushPromises()

        expect(bannerText(wrapper)).toContain(key)
        expect(listGamesServiceMock).toHaveBeenCalledTimes(2)
      }
    )

    it('cancels a session after confirmation, tells it, and reads the agenda again', async () => {
      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-cancel"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'danger',
          title: 'agenda.actions.cancelTitle',
          confirmLabel: 'agenda.actions.cancel',
        })
      )
      expect(cancelGameServiceMock).toHaveBeenCalledWith(1, 5)
      expect(bannerText(wrapper)).toContain('agenda.banners.cancelled')
      expect(listGamesServiceMock).toHaveBeenCalledTimes(2)
    })

    it('does not cancel when the confirmation is declined', async () => {
      setConfirmResult(false)

      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-cancel"]').trigger('click')
      await flushPromises()

      expect(cancelGameServiceMock).not.toHaveBeenCalled()
      expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    })

    it('translates the error when cancelling fails', async () => {
      mockServiceFailure(cancelGameServiceMock, 'server_error', 500)

      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-cancel"]').trigger('click')
      await flushPromises()

      expect(bannerText(wrapper)).toContain('games.errors.serverError')
    })

    it('turns an unexpected exception during an action into a server error', async () => {
      openGameServiceMock.mockRejectedValue(new Error('boom'))

      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-open"]').trigger('click')
      await flushPromises()

      expect(bannerText(wrapper)).toContain('games.errors.serverError')
    })

    it('runs one action at a time and disables the buttons of the session in progress', async () => {
      const pending = deferred<Awaited<ReturnType<typeof openGameServiceMock>>>()

      openGameServiceMock.mockReturnValueOnce(pending.promise)

      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-open"]').trigger('click')

      expect(
        gameRow(wrapper, 5).get('[data-test="agenda-open"]').attributes('disabled')
      ).toBeDefined()
      expect(
        gameRow(wrapper, 5).get('[data-test="agenda-cancel"]').attributes('disabled')
      ).toBeDefined()

      await gameRow(wrapper, 9).get('[data-test="agenda-open"]').trigger('click')
      await gameRow(wrapper, 9).get('[data-test="agenda-cancel"]').trigger('click')
      await flushPromises()

      expect(openGameServiceMock).toHaveBeenCalledTimes(1)
      expect(confirmMock).not.toHaveBeenCalled()

      pending.resolve({
        ok: true,
        status: 200,
        data: { game: createGameFixture({ id: 5, state: GAME_STATE_PENDING }) },
      })
      await flushPromises()

      expect(
        gameRow(wrapper, 5).get('[data-test="agenda-open"]').attributes('disabled')
      ).toBeUndefined()
    })

    it('opens the detail of a session', async () => {
      const wrapper = await mountAgenda()

      await gameRow(wrapper, 5).get('[data-test="agenda-view"]').trigger('click')

      expect(pushMock).toHaveBeenCalledWith({
        name: 'games-detail',
        params: { gameId: '5' },
        query: {},
      })
    })

    it('starts the scheduling of a free slot with the room and the start prefilled', async () => {
      const wrapper = await mountAgenda()
      const free = wrapper.find('[data-kind="slot"]')

      expect(free.get('[data-test="agenda-time"]').text()).toBe('12:00 – 13:00')

      await free.get('[data-test="agenda-schedule"]').trigger('click')

      expect(pushMock).toHaveBeenCalledWith({
        name: 'games-create',
        query: { roomId: '10', scheduledAt: '2026-11-24T11:00:00.000Z' },
      })
    })
  })

  describe('rights and company', () => {
    it('lets the staff (user role) see the agenda and act on a session', async () => {
      setAuthenticatedUser({ companyId: 1 })
      vi.setSystemTime(new Date('2026-11-24T09:30:00.000Z'))
      serveGames({ games: [createScheduledGameFixture('2026-11-24T10:00:00.000Z', { id: 5 })] })

      const wrapper = await mountAgenda()

      expect(hasButton(wrapper, 5, 'open')).toBe(true)
      expect(hasButton(wrapper, 5, 'cancel')).toBe(true)
    })

    it('hides the company selector from company staff and does not list the companies', async () => {
      const wrapper = await mountAgenda()

      expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
      expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(1)
    })

    it('lets the superadmin switch company, keeping the choice in the address', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })

      const wrapper = await mountAgenda()

      expect(loadCompaniesServiceMock).toHaveBeenCalled()

      await findSelect(wrapper, 'agenda.filters.company').setValue('2')
      await flushPromises()

      expect(listGameRoomsServiceMock).toHaveBeenLastCalledWith(2)
      expect(replaceMock).toHaveBeenCalledWith({ name: 'agenda', query: { companyId: '2' } })
      expect(listGamesServiceMock).toHaveBeenLastCalledWith(
        2,
        expect.objectContaining({ roomId: 10 })
      )

      await wrapper.get('[data-test="agenda-schedule"]').trigger('click')

      expect(pushMock).toHaveBeenCalledWith({
        name: 'games-create',
        query: expect.objectContaining({ companyId: '2', roomId: '10' }),
      })
    })
  })

  describe('life cycle', () => {
    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState')
    })

    it('reads the agenda again when the tab becomes visible, without showing the loading state', async () => {
      setVisibility('visible')

      const wrapper = await mountAgenda()

      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()

      expect(listGamesServiceMock).toHaveBeenCalledTimes(2)
      expect(listGameRoomsServiceMock).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('false')
    })

    it('does nothing when the tab is hidden', async () => {
      setVisibility('hidden')

      await mountAgenda()

      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()

      expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    })

    it('stops listening when the screen is left', async () => {
      setVisibility('visible')

      const wrapper = await mountAgenda()

      unmountAgenda(wrapper)
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()

      expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
    })
  })
})
