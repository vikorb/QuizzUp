import {
  deleteCompanyPermanentlyServiceMock,
  mockDeleteCompanyFailure,
  mockDeleteCompanySuccess,
} from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import ClientTableActions from '@/views/clients/table/ClientTableActions.vue'

resetFrontendMocksBeforeEach()

const company = {
  id: 1,
  name: 'Acme Corp',
  email: 'contact@acme.test',
  status: COMPANY_STATUS_ACTIVE,
  accountsCount: 3,
}

const switchStub = defineComponent({
  name: 'ClientsTableActionsSwitch',
  emits: ['updated', 'error', 'busy-change'],
  setup(_props, { emit }) {
    return () =>
      h('div', { 'data-test': 'switch-stub' }, [
        h('button', { type: 'button', 'data-test': 'switch-busy', onClick: () => emit('busy-change', true) }),
        h('button', { type: 'button', 'data-test': 'switch-ready', onClick: () => emit('busy-change', false) }),
        h('button', {
          type: 'button',
          'data-test': 'switch-updated',
          onClick: () => emit('updated', { ...company, name: 'Updated' }),
        }),
      ])
  },
})

describe('views/clients/table/ClientTableActions.vue', () => {
  it('emits view and edit actions when not busy', async () => {
    const wrapper = mountWithFrontendMocks(ClientTableActions, {
      props: {
        item: company,
      },
      global: {
        stubs: {
          clientsTableActionsSwitch: switchStub,
        },
      },
    })

    await wrapper.findAll('[data-test="ui-button"]')[0].trigger('click')
    await wrapper.findAll('[data-test="ui-button"]')[1].trigger('click')

    expect(wrapper.emitted('view-accounts')).toEqual([[1]])
    expect(wrapper.emitted('edit')).toEqual([[1]])
  })

  it('does not emit actions while the switch is busy', async () => {
    const wrapper = mountWithFrontendMocks(ClientTableActions, {
      props: {
        item: company,
      },
      global: {
        stubs: {
          clientsTableActionsSwitch: switchStub,
        },
      },
    })

    await wrapper.find('[data-test="switch-busy"]').trigger('click')
    await wrapper.findAll('[data-test="ui-button"]')[0].trigger('click')
    await wrapper.findAll('[data-test="ui-button"]')[1].trigger('click')

    expect(wrapper.emitted('view-accounts')).toBeUndefined()
    expect(wrapper.emitted('edit')).toBeUndefined()
  })

  it('soft-deletes a company after confirmation', async () => {
    mockDeleteCompanySuccess()
    window.confirm = vi.fn(() => true)

    const wrapper = mountWithFrontendMocks(ClientTableActions, {
      props: {
        item: company,
      },
      global: {
        stubs: {
          clientsTableActionsSwitch: switchStub,
        },
      },
    })

    await wrapper.findAll('[data-test="ui-button"]')[2].trigger('click')

    expect(deleteCompanyPermanentlyServiceMock).toHaveBeenCalledWith(1)
    expect(wrapper.emitted('deleted')).toEqual([[1]])
  })

  it('does not delete when confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false)

    const wrapper = mountWithFrontendMocks(ClientTableActions, {
      props: {
        item: company,
      },
      global: {
        stubs: {
          clientsTableActionsSwitch: switchStub,
        },
      },
    })

    await wrapper.findAll('[data-test="ui-button"]')[2].trigger('click')

    expect(deleteCompanyPermanentlyServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('emits service errors and forwards switch updates', async () => {
    mockDeleteCompanyFailure('server_error')
    window.confirm = vi.fn(() => true)

    const wrapper = mountWithFrontendMocks(ClientTableActions, {
      props: {
        item: company,
      },
      global: {
        stubs: {
          clientsTableActionsSwitch: switchStub,
        },
      },
    })

    await wrapper.find('[data-test="switch-updated"]').trigger('click')
    await wrapper.findAll('[data-test="ui-button"]')[2].trigger('click')

    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ name: 'Updated' })
    expect(wrapper.emitted('error')).toEqual([['server_error']])
  })
})
