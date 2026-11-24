import {
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import {
  createGameFixture,
  createGameServiceMock,
  createJoinFixture,
  createScheduledGameFixture,
  createScheduleFixture,
  listGameRoomsServiceMock,
  loadGameServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import {
  liveErrorKeyMock,
  liveStateMock,
  useLiveCompanyMock,
} from '@frontend-tests/_helpers/liveCompanyMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, toValue } from 'vue'

import CreateGameView from '@/views/games/CreateGameView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

const createGameFormStub = defineComponent({
  name: 'CreateGameForm',
  props: {
    companyId: { type: Number, required: true },
    rooms: { type: Array, default: () => [] },
    roomsLoading: Boolean,
    game: { type: Object, default: null },
    prefill: { type: Object, default: undefined },
  },
  emits: ['created', 'saved', 'cancel'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-test': 'create-game-form-stub',
          'data-company-id': String(props.companyId),
          'data-rooms': String(props.rooms.length),
          'data-game-id': String((props.game as { id?: number } | null)?.id ?? ''),
          'data-prefill': JSON.stringify(props.prefill ?? null),
        },
        [
          h('button', {
            type: 'button',
            'data-test': 'stub-saved',
            onClick: () =>
              emit(
                'saved',
                createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 5, roomId: 10 })
              ),
          }),
          h('button', {
            type: 'button',
            'data-test': 'stub-created',
            onClick: () => emit('created', createGameFixture({ id: 99 })),
          }),
          h('button', {
            type: 'button',
            'data-test': 'stub-cancel',
            onClick: () => emit('cancel'),
          }),
        ]
      )
  },
})

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(CreateGameView, {
    global: {
      stubs: {
        createGameForm: createGameFormStub,
      },
    },
  })

  await flushPromises()

  return wrapper
}

describe('views/games/CreateGameView.vue', () => {
  it('loads the rooms of the company of the operator', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountView()
    const form = wrapper.get('[data-test="create-game-form-stub"]')

    expect(listGameRoomsServiceMock).toHaveBeenCalledWith(1)
    expect(form.attributes('data-company-id')).toBe('1')
    expect(form.attributes('data-rooms')).toBe(String(roomsFixture.length))
  })

  it('goes back to the list without calling the API when cancelling', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()

    await wrapper.get('[data-test="stub-cancel"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: {} })
    expect(createGameServiceMock).not.toHaveBeenCalled()
  })

  it('also goes back with the card cancel button', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()

    await wrapper.get('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: {} })
  })

  it('returns to the list with the created game for the success banner', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()

    await wrapper.get('[data-test="stub-created"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: { created: '99' } })
  })

  it('keeps the company chosen by the superadmin', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '2' }

    const wrapper = await mountView()

    expect(listGameRoomsServiceMock).toHaveBeenCalledWith(2)

    await wrapper.get('[data-test="stub-created"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games',
      query: { companyId: '2', created: '99' },
    })
  })

  it('opens the game page, with its QR code, when the sign-up by QR code was enabled', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()
    const form = wrapper.getComponent({ name: 'CreateGameForm' })

    form.vm.$emit('created', createGameFixture({ id: 99, join: createJoinFixture() }))

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '99' },
      query: {},
    })
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the company chosen by the superadmin on the way to the game page', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '2' }

    const wrapper = await mountView()
    const form = wrapper.getComponent({ name: 'CreateGameForm' })

    form.vm.$emit('created', createGameFixture({ id: 99, join: createJoinFixture() }))

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '99' },
      query: { companyId: '2' },
    })
  })

  it('returns to the list when the game has no sign-up link', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()
    const form = wrapper.getComponent({ name: 'CreateGameForm' })

    form.vm.$emit('created', createGameFixture({ id: 99, join: null }))

    expect(pushMock).toHaveBeenCalledWith({ name: 'games', query: { created: '99' } })
  })

  it('follows the live presence of the company the form is for', async () => {
    setAuthenticatedUser({ companyId: 1 })

    const wrapper = await mountView()

    expect(useLiveCompanyMock).toHaveBeenCalledTimes(1)
    expect(toValue(useLiveCompanyMock.mock.calls[0][0])).toBe(1)
    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe('live.connection.live')
  })

  it('tells the operator when the live tracking is interrupted or stopped', async () => {
    setAuthenticatedUser()
    liveStateMock.value = 'reconnecting'

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
      'live.connection.reconnecting'
    )

    liveStateMock.value = 'error'
    liveErrorKeyMock.value = 'errors.too_many_streams'
    await flushPromises()

    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe('errors.too_many_streams')
    // Sans le direct, le formulaire reste utilisable.
    expect(wrapper.find('[data-test="create-game-form-stub"]').exists()).toBe(true)
  })

  it('shows the rooms loading error', async () => {
    setAuthenticatedUser()
    mockServiceFailure(listGameRoomsServiceMock, 'forbidden', 403)

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
  })

  it('does not load a game on the creation route', async () => {
    setAuthenticatedUser()

    const wrapper = await mountView()

    expect(loadGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="base-card"]').attributes('data-title')).toBe(
      'games.create.cardTitle'
    )
  })

  describe('programmation', () => {
    it('hands the prefill of the address to the form', async () => {
      setAuthenticatedUser()
      currentRouteMock.query = { roomId: '10', scheduledAt: '2026-12-05T13:00:00.000Z' }

      const wrapper = await mountView()
      const form = wrapper.get('[data-test="create-game-form-stub"]')

      expect(JSON.parse(form.attributes('data-prefill') ?? 'null')).toEqual({
        roomId: 10,
        scheduledAt: '2026-12-05T13:00:00.000Z',
      })
    })

    it('shows no error for an invalid address value', async () => {
      setAuthenticatedUser()
      currentRouteMock.query = { roomId: 'abc', scheduledAt: 'demain' }

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
      expect(wrapper.find('[data-test="create-game-form-stub"]').exists()).toBe(true)
    })

    it('returns to the agenda after a scheduled creation', async () => {
      setAuthenticatedUser()

      const wrapper = await mountView()
      const form = wrapper.getComponent({ name: 'CreateGameForm' })

      form.vm.$emit('created', createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 7 }))

      expect(pushMock).toHaveBeenCalledWith({
        name: 'agenda',
        query: { roomId: '10', date: '2026-12-05', saved: 'scheduled' },
      })
    })

    it('returns to the day of the room, not the UTC day, in the time zone of that room', async () => {
      setAuthenticatedUser()
      listGameRoomsServiceMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          rooms: [
            {
              ...roomsFixture[0],
              schedule: createScheduleFixture(undefined, 'America/Montreal'),
            },
          ],
        },
      })

      const wrapper = await mountView()
      const form = wrapper.getComponent({ name: 'CreateGameForm' })

      // 01:00Z le 6 décembre : encore le 5 au soir à Montréal (UTC-5), déjà le 6 à Paris.
      form.vm.$emit('created', createScheduledGameFixture('2026-12-06T01:00:00.000Z', { id: 7 }))

      expect(pushMock).toHaveBeenCalledWith({
        name: 'agenda',
        query: { roomId: '10', date: '2026-12-05', saved: 'scheduled' },
      })
    })

    it('keeps the company of the superadmin on the way back to the agenda', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })
      currentRouteMock.query = { companyId: '2' }

      const wrapper = await mountView()
      const form = wrapper.getComponent({ name: 'CreateGameForm' })

      form.vm.$emit('created', createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 7 }))

      expect(pushMock).toHaveBeenCalledWith({
        name: 'agenda',
        query: { companyId: '2', roomId: '10', date: '2026-12-05', saved: 'scheduled' },
      })
    })

    it('cancels back to the agenda when the form was opened from a slot', async () => {
      setAuthenticatedUser()
      currentRouteMock.query = { roomId: '10', scheduledAt: '2026-12-05T13:00:00.000Z' }

      const wrapper = await mountView()

      await wrapper.get('[data-test="stub-cancel"]').trigger('click')

      expect(pushMock).toHaveBeenCalledWith({ name: 'agenda', query: {} })
    })
  })

  describe('modification', () => {
    const scheduled = createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 5 })
    const scheduledResult = { ok: true as const, status: 200, data: { game: scheduled } }

    beforeEach(() => {
      currentRouteMock.params = { gameId: '5' }
    })

    it('loads the session and the rooms, then gives the session to the form', async () => {
      setAuthenticatedUser({ companyId: 1 })
      loadGameServiceMock.mockResolvedValueOnce(scheduledResult)

      const wrapper = await mountView()
      const form = wrapper.get('[data-test="create-game-form-stub"]')

      expect(loadGameServiceMock).toHaveBeenCalledWith(1, 5)
      expect(listGameRoomsServiceMock).toHaveBeenCalledWith(1)
      expect(form.attributes('data-game-id')).toBe('5')
      expect(form.attributes('data-prefill')).toBe('null')
      expect(wrapper.get('[data-test="base-card"]').attributes('data-title')).toBe(
        'games.edit.cardTitle'
      )
    })

    it('shows the loading state and no form while the session is being read', async () => {
      setAuthenticatedUser()
      loadGameServiceMock.mockReturnValueOnce(new Promise(() => undefined))

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('true')
      expect(wrapper.get('[data-test="base-card-loading"]').text()).toBe('games.edit.loading')
      expect(wrapper.find('[data-test="create-game-form-stub"]').exists()).toBe(false)
    })

    it('shows the server error code and no form, then retries', async () => {
      setAuthenticatedUser()
      mockServiceFailure(loadGameServiceMock, 'game_not_found', 404)

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('game_not_found')
      expect(wrapper.find('[data-test="create-game-form-stub"]').exists()).toBe(false)

      loadGameServiceMock.mockResolvedValueOnce(scheduledResult)
      await wrapper.get('[data-test="game-form-retry"]').trigger('click')
      await flushPromises()

      expect(loadGameServiceMock).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
      expect(wrapper.get('[data-test="create-game-form-stub"]').attributes('data-game-id')).toBe(
        '5'
      )
    })

    it('shows a network failure as a server error', async () => {
      setAuthenticatedUser()
      loadGameServiceMock.mockRejectedValueOnce(new Error('network'))

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('server_error')
    })

    it('refuses a session that is no longer scheduled', async () => {
      setAuthenticatedUser()
      loadGameServiceMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { game: createGameFixture({ id: 5, state: 'running' }) },
      })

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe(
        'game_not_scheduled'
      )
      expect(wrapper.find('[data-test="create-game-form-stub"]').exists()).toBe(false)
    })

    it('keeps the rooms error visible, with a retry', async () => {
      setAuthenticatedUser()
      loadGameServiceMock.mockResolvedValueOnce(scheduledResult)
      mockServiceFailure(listGameRoomsServiceMock, 'forbidden', 403)

      const wrapper = await mountView()

      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
      expect(wrapper.find('[data-test="game-form-retry"]').exists()).toBe(true)
    })

    it('goes back to the agenda once saved', async () => {
      setAuthenticatedUser()
      loadGameServiceMock.mockResolvedValueOnce(scheduledResult)

      const wrapper = await mountView()
      await wrapper.get('[data-test="stub-saved"]').trigger('click')

      expect(pushMock).toHaveBeenCalledWith({
        name: 'agenda',
        query: { roomId: '10', date: '2026-12-05', saved: 'updated' },
      })
    })

    it('cancels back to the agenda, keeping the company chosen by the superadmin', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })
      currentRouteMock.query = { companyId: '2' }
      loadGameServiceMock.mockResolvedValueOnce(scheduledResult)

      const wrapper = await mountView()
      await wrapper.get('[data-test="stub-cancel"]').trigger('click')

      expect(loadGameServiceMock).toHaveBeenCalledWith(2, 5)
      expect(pushMock).toHaveBeenCalledWith({ name: 'agenda', query: { companyId: '2' } })
    })

    it('reports an unreadable game identifier without calling the API', async () => {
      setAuthenticatedUser()
      currentRouteMock.params = { gameId: 'abc' }

      const wrapper = await mountView()

      expect(loadGameServiceMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('invalid_params')
    })
  })
})
