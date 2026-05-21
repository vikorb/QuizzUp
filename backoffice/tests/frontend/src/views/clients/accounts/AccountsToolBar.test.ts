import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { ADMIN_STATUS_ACTIVE, ADMIN_STATUS_INACTIVE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import AccountsToolBar from '@/views/clients/accounts/AccountsToolBar.vue'

resetFrontendMocksBeforeEach()

describe('views/clients/accounts/AccountsToolBar.vue', () => {
  it('emits search and status filter updates', async () => {
    const wrapper = mountWithFrontendMocks(AccountsToolBar, {
      props: {
        modelValue: '',
        statusFilter: ADMIN_STATUS_ACTIVE,
      },
    })

    await wrapper.find('input').setValue('alice')
    await wrapper.find('select').setValue(String(ADMIN_STATUS_INACTIVE))

    const searchEvents = wrapper.emitted('update:modelValue') ?? []
    const statusEvents = wrapper.emitted('update:statusFilter') ?? []

    expect(searchEvents).toContainEqual(['alice'])
    expect(searchEvents.at(-1)).toEqual(['alice'])
    expect(statusEvents).toContainEqual([ADMIN_STATUS_INACTIVE])
    expect(statusEvents.at(-1)).toEqual([ADMIN_STATUS_INACTIVE])
  })

  it('resets filters and emits create from primary action', async () => {
    const wrapper = mountWithFrontendMocks(AccountsToolBar, {
      props: {
        modelValue: 'alice',
        statusFilter: ADMIN_STATUS_INACTIVE,
      },
    })

    expect(wrapper.find('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="base-toolbar-reset"]').trigger('click')
    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toContainEqual([''])
    expect(wrapper.emitted('create')).toHaveLength(1)
  })
})
