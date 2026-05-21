import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import ClientDetailSwitch from '@/views/clients/details/ClientDetailSwitch.vue'

resetFrontendMocksBeforeEach()

describe('views/clients/details/ClientDetailSwitch.vue', () => {
  it('renders active status and emits toggle on change', async () => {
    const wrapper = mountWithFrontendMocks(ClientDetailSwitch, {
      props: {
        status: COMPANY_STATUS_ACTIVE,
        originalStatus: COMPANY_STATUS_ACTIVE,
      },
    })

    expect(wrapper.find('[data-test="switch-field"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.company-status__subtitle--pending').exists()).toBe(false)

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('marks status as pending when it differs from original status', () => {
    const wrapper = mountWithFrontendMocks(ClientDetailSwitch, {
      props: {
        status: COMPANY_STATUS_INACTIVE,
        originalStatus: COMPANY_STATUS_ACTIVE,
      },
    })

    expect(wrapper.find('.company-status__subtitle--pending').exists()).toBe(true)
    expect(wrapper.find('[data-test="switch-field"]').attributes('aria-checked')).toBe('false')
  })

  it('disables deleted status', async () => {
    const wrapper = mountWithFrontendMocks(ClientDetailSwitch, {
      props: {
        status: COMPANY_STATUS_DELETED,
        originalStatus: COMPANY_STATUS_DELETED,
      },
    })

    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})
