import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import RoomsToolBar from '@/views/clients/rooms/RoomsToolBar.vue'

resetFrontendMocksBeforeEach()

function optionValues(wrapper: ReturnType<typeof mountWithFrontendMocks>): string[] {
  return wrapper.findAll('option').map((option) => option.attributes('value') ?? '')
}

describe('views/clients/rooms/RoomsToolBar.vue', () => {
  it('emits search and status filter updates', async () => {
    const wrapper = mountWithFrontendMocks(RoomsToolBar, {
      props: {
        modelValue: '',
        statusFilter: ROOM_STATUS_ACTIVE,
        canManage: true,
      },
    })

    await wrapper.find('input').setValue('néon')
    await wrapper.find('select').setValue(String(ROOM_STATUS_INACTIVE))

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['néon'])
    expect(wrapper.emitted('update:statusFilter')?.at(-1)).toEqual([ROOM_STATUS_INACTIVE])
  })

  it('resets filters and emits create for managers', async () => {
    const wrapper = mountWithFrontendMocks(RoomsToolBar, {
      props: {
        modelValue: 'néon',
        statusFilter: ROOM_STATUS_INACTIVE,
        canManage: true,
      },
    })

    expect(wrapper.find('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="base-toolbar-reset"]').trigger('click')
    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toContainEqual([''])
    expect(wrapper.emitted('update:statusFilter')).toContainEqual([ROOM_STATUS_ACTIVE])
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('hides the create button in read-only mode', () => {
    const wrapper = mountWithFrontendMocks(RoomsToolBar, {
      props: {
        modelValue: '',
        canManage: false,
      },
    })

    expect(wrapper.find('[data-test="base-toolbar-primary"]').exists()).toBe(false)
  })

  it('offers the deleted filter to the superadmin only', () => {
    const adminWrapper = mountWithFrontendMocks(RoomsToolBar, {
      props: { modelValue: '', canManage: true, canSeeDeleted: false },
    })
    const superadminWrapper = mountWithFrontendMocks(RoomsToolBar, {
      props: { modelValue: '', canManage: true, canSeeDeleted: true },
    })

    expect(optionValues(adminWrapper)).not.toContain(String(ROOM_STATUS_DELETED))
    expect(optionValues(superadminWrapper)).toContain(String(ROOM_STATUS_DELETED))
  })
})
