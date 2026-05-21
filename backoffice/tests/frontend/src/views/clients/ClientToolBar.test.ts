import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import ClientToolBar from '@/views/clients/ClientToolBar.vue'

resetFrontendMocksBeforeEach()

describe('views/clients/ClientToolBar.vue', () => {
  it('emits search and status filter updates', async () => {
    const wrapper = mountWithFrontendMocks(ClientToolBar, {
      props: {
        modelValue: '',
        statusFilter: COMPANY_STATUS_ACTIVE,
      },
    })

    await wrapper.find('input').setValue('acme')
    await wrapper.find('select').setValue(String(COMPANY_STATUS_INACTIVE))

    const searchEvents = wrapper.emitted('update:modelValue') ?? []
    const statusEvents = wrapper.emitted('update:statusFilter') ?? []

    expect(searchEvents.at(0)).toEqual(['acme'])
    expect(searchEvents.at(-1)).toEqual(['acme'])
    expect(statusEvents).toContainEqual([COMPANY_STATUS_INACTIVE])
    expect(statusEvents.at(-1)).toEqual([COMPANY_STATUS_INACTIVE])
  })

  it('resets filters to their defaults and disables reset when no filter is active', async () => {
    const wrapper = mountWithFrontendMocks(ClientToolBar, {
      props: {
        modelValue: 'acme',
        statusFilter: COMPANY_STATUS_INACTIVE,
      },
    })

    expect(wrapper.find('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="base-toolbar-reset"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('update:statusFilter')).toEqual([[COMPANY_STATUS_ACTIVE]])
  })

  it('navigates to the client creation page from the primary action', async () => {
    const wrapper = mountWithFrontendMocks(ClientToolBar, {
      props: {
        modelValue: '',
        statusFilter: COMPANY_STATUS_ACTIVE,
      },
    })

    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(1)
  })
})
