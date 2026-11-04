import {
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import {
  createGameFixture,
  createGameServiceMock,
  listGameRoomsServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

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
  },
  emits: ['created', 'cancel'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-test': 'create-game-form-stub',
          'data-company-id': String(props.companyId),
          'data-rooms': String(props.rooms.length),
        },
        [
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

  it('shows the rooms loading error', async () => {
    setAuthenticatedUser()
    mockServiceFailure(listGameRoomsServiceMock, 'forbidden', 403)

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
  })
})
