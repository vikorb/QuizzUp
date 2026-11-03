import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  deleteRoomServiceMock,
  mockDeleteRoomFailure,
  roomsFixture,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { toRoomTableRow } from '@/utils/room/list'
import RoomTableActions from '@/views/clients/rooms/table/RoomTableActions.vue'

resetFrontendMocksBeforeEach()

const switchStub = {
  name: 'RoomTableActionsSwitch',
  template: '<button data-test="room-switch-stub" />',
}

function mountActions(item = toRoomTableRow(roomsFixture[0]), stubs: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(RoomTableActions, {
    props: {
      companyId: 1,
      item,
    },
    global: {
      stubs: {
        roomTableActionsSwitch: switchStub,
        ...stubs,
      },
    },
  })
}

type RowAction = 'account' | 'edit' | 'delete'

function actionButton(wrapper: ReturnType<typeof mountWithFrontendMocks>, action: RowAction) {
  return wrapper.find(`[data-test="ui-button"].icon-${action}`)
}

describe('views/clients/rooms/table/RoomTableActions.vue', () => {
  it('emits edit with the room id (inline form, no navigation)', async () => {
    const wrapper = mountActions()

    await actionButton(wrapper, 'edit').trigger('click')

    expect(wrapper.emitted('edit')).toEqual([[1]])
  })

  it('emits account with the room id to open the room account panel', async () => {
    const wrapper = mountActions()

    expect(actionButton(wrapper, 'account').attributes('aria-label')).toBe(
      'rooms.table.actions.account'
    )

    await actionButton(wrapper, 'account').trigger('click')

    expect(wrapper.emitted('account')).toEqual([[1]])
    expect(wrapper.emitted('edit')).toBeUndefined()
  })

  it('disables the room account action for deleted rooms', async () => {
    const wrapper = mountActions(toRoomTableRow(roomsFixture[2]))

    expect(actionButton(wrapper, 'account').attributes('disabled')).toBeDefined()

    await actionButton(wrapper, 'account').trigger('click')

    expect(wrapper.emitted('account')).toBeUndefined()
  })

  it('confirms and soft-deletes a room', async () => {
    setConfirmResult(true)

    const wrapper = mountActions()

    await actionButton(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'rooms.table.actions.deleteConfirm',
        variant: 'danger',
      })
    )
    expect(deleteRoomServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ status: ROOM_STATUS_DELETED })
    expect(wrapper.emitted('deleted')).toEqual([[1]])
  })

  it('does not call the API when the confirmation is cancelled', async () => {
    setConfirmResult(false)

    const wrapper = mountActions()

    await actionButton(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(deleteRoomServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('emits the API error when deletion fails', async () => {
    mockDeleteRoomFailure('not_found')

    const wrapper = mountActions()

    await actionButton(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('error')).toEqual([['not_found']])
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('disables edit and delete for deleted rooms', async () => {
    const wrapper = mountActions(toRoomTableRow(roomsFixture[2]))

    expect(actionButton(wrapper, 'edit').attributes('disabled')).toBeDefined()
    expect(actionButton(wrapper, 'delete').attributes('disabled')).toBeDefined()
  })

  it('forwards switch events and locks actions while the switch is busy', async () => {
    const wrapper = mountActions(toRoomTableRow(roomsFixture[0]), {
      roomTableActionsSwitch: {
        name: 'RoomTableActionsSwitch',
        emits: ['updated', 'error', 'busy-change'],
        template: `
          <div>
            <button data-test="switch-updated" @click="$emit('updated', { id: 1, name: 'Salle Néon' })" />
            <button data-test="switch-error" @click="$emit('error', 'server_error')" />
            <button data-test="switch-busy" @click="$emit('busy-change', true)" />
          </div>
        `,
      },
    })

    await wrapper.find('[data-test="switch-updated"]').trigger('click')
    await wrapper.find('[data-test="switch-error"]').trigger('click')
    await wrapper.find('[data-test="switch-busy"]').trigger('click')

    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(actionButton(wrapper, 'edit').attributes('disabled')).toBeDefined()
  })
})
