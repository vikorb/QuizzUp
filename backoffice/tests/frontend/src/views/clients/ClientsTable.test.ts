import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import ClientsTable from '@/views/clients/ClientsTable.vue'

resetFrontendMocksBeforeEach()

const clientTableActionsStub = defineComponent({
  name: 'ClientTableActions',
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  emits: ['view-accounts', 'edit', 'updated', 'deleted', 'error'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-test': 'client-table-actions-stub' }, [
        h('button', { type: 'button', 'data-test': 'row-view', onClick: () => emit('view-accounts', props.item.id) }),
        h('button', { type: 'button', 'data-test': 'row-edit', onClick: () => emit('edit', props.item.id) }),
        h('button', { type: 'button', 'data-test': 'row-error', onClick: () => emit('error', 'server_error') }),
      ])
  },
})

const companies = [
  {
    id: 1,
    name: 'Acme Corp',
    email: 'contact@acme.test',
    status: COMPANY_STATUS_ACTIVE,
    accountsCount: 3,
  },
  {
    id: 2,
    name: 'Beta Studio',
    email: 'hello@beta.test',
    status: COMPANY_STATUS_INACTIVE,
    accountsCount: 0,
  },
]

describe('views/clients/ClientsTable.vue', () => {
  it('renders client rows with table cells and statuses', () => {
    const wrapper = mountWithFrontendMocks(ClientsTable, {
      props: {
        companies,
        loading: false,
        error: null,
      },
      global: {
        stubs: {
          clientTableActions: clientTableActionsStub,
        },
      },
    })

    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Acme Corp')
    expect(wrapper.text()).toContain('contact@acme.test')
    expect(wrapper.text()).toContain('3')
  })

  it('shows retry action when an error exists', async () => {
    const wrapper = mountWithFrontendMocks(ClientsTable, {
      props: {
        companies: [],
        loading: false,
        error: 'server_error',
      },
      global: {
        stubs: {
          clientTableActions: clientTableActionsStub,
        },
      },
    })

    expect(wrapper.find('[data-test="base-card-error"]').text()).toBe('server_error')

    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('forwards row action events to its parent', async () => {
    const wrapper = mountWithFrontendMocks(ClientsTable, {
      props: {
        companies,
        loading: false,
        error: null,
      },
      global: {
        stubs: {
          clientTableActions: clientTableActionsStub,
        },
      },
    })

    await wrapper.find('[data-test="row-view"]').trigger('click')
    await wrapper.find('[data-test="row-edit"]').trigger('click')
    await wrapper.find('[data-test="row-error"]').trigger('click')

    expect(wrapper.emitted('view-accounts')).toEqual([[1]])
    expect(wrapper.emitted('edit')).toEqual([[1]])
    expect(wrapper.emitted('error')).toEqual([['server_error']])
  })
})
