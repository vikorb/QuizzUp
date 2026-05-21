import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import CreateClientView from '@/views/clients/CreateClientView.vue'

resetFrontendMocksBeforeEach()

describe('views/clients/CreateClientView.vue', () => {
  it('renders the create client page shell and form', () => {
    const wrapper = mountWithFrontendMocks(CreateClientView, {
      global: {
        stubs: {
          createClientForm: {
            name: 'CreateClientForm',
            template: '<form data-test="create-client-form-stub" />',
          },
        },
      },
    })

    expect(wrapper.find('[data-test="section-layout-title"]').text()).toBe('clients.create.title')
    expect(wrapper.find('[data-test="section-layout-subtitle"]').text()).toBe('clients.create.subtitle')
    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe('clients.create.cardTitle')
    expect(wrapper.find('[data-test="create-client-form-stub"]').exists()).toBe(true)
  })
})
