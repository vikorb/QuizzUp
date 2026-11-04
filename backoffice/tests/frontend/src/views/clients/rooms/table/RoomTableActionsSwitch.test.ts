import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  mockUpdateRoomStatusFailure,
  roomsFixture,
  updateRoomStatusServiceMock,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { ROOM_STATUS_ACTIVE, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { toRoomTableRow } from '@/utils/room/list'
import RoomTableActionsSwitch from '@/views/clients/rooms/table/RoomTableActionsSwitch.vue'

resetFrontendMocksBeforeEach()

function mountSwitch(roomIndex: number, disabled = false) {
  return mountWithFrontendMocks(RoomTableActionsSwitch, {
    props: {
      companyId: 1,
      room: toRoomTableRow(roomsFixture[roomIndex]),
      disabled,
    },
  })
}

describe('views/clients/rooms/table/RoomTableActionsSwitch.vue', () => {
  it('disables an active room after confirmation', async () => {
    const wrapper = mountSwitch(0)

    expect(wrapper.find('[data-test="switch-field"]').attributes('aria-checked')).toBe('true')

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'rooms.table.actions.disableConfirm' })
    )
    expect(updateRoomStatusServiceMock).toHaveBeenCalledWith(1, 1, ROOM_STATUS_INACTIVE)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ status: ROOM_STATUS_INACTIVE })
    expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
  })

  it('enables an inactive room', async () => {
    const wrapper = mountSwitch(1)

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'rooms.table.actions.enableConfirm' })
    )
    expect(updateRoomStatusServiceMock).toHaveBeenCalledWith(1, 2, ROOM_STATUS_ACTIVE)
  })

  it('does nothing when the confirmation is cancelled', async () => {
    setConfirmResult(false)

    const wrapper = mountSwitch(0)

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await flushPromises()

    expect(updateRoomStatusServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('emits the API error', async () => {
    mockUpdateRoomStatusFailure('forbidden')

    const wrapper = mountSwitch(0)

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('error')).toEqual([['forbidden']])
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('is disabled for deleted rooms and when the parent is busy', () => {
    expect(mountSwitch(2).find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()
    expect(
      mountSwitch(0, true).find('[data-test="switch-field"]').attributes('disabled')
    ).toBeDefined()
  })
})
