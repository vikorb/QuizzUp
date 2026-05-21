import { mockLoadCompaniesFailure, mockLoadCompaniesSuccess } from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import ClientsView from '@/views/ClientsView.vue'

resetFrontendMocksBeforeEach()

const clientsTableStub = defineComponent({
  name: 'ClientsTable',
  props: {
    companies: {
      type: Array,
      default: () => [],
    },
    loading: Boolean,
    error: String,
  },
  emits: ['view-accounts', 'edit', 'updated', 'deleted', 'error', 'retry'],
  setup(props, { emit }) {
    return () =>
      h('section', { 'data-test': 'clients-table-stub', 'data-error': props.error }, [
        h(
          'ul',
          { 'data-test': 'companies-list' },
          (props.companies as Array<{ id: number; name: string }>).map((company) =>
            h('li', { 'data-test': 'company-row', 'data-company-id': String(company.id) }, company.name),
          ),
        ),
        h('button', { type: 'button', 'data-test': 'view-accounts', onClick: () => emit('view-accounts', 1) }),
        h('button', { type: 'button', 'data-test': 'edit-company', onClick: () => emit('edit', 1) }),
        h('button', {
          type: 'button',
          'data-test': 'updated-company',
          onClick: () =>
            emit('updated', {
              id: 1,
              name: 'Acme Updated',
              email: 'updated@acme.test',
              status: COMPANY_STATUS_INACTIVE,
              accountsCount: 3,
            }),
        }),
        h('button', { type: 'button', 'data-test': 'deleted-company', onClick: () => emit('deleted', 1) }),
        h('button', { type: 'button', 'data-test': 'table-error', onClick: () => emit('error', 'server_error') }),
        h('button', { type: 'button', 'data-test': 'retry', onClick: () => emit('retry') }),
      ])
  },
})

async function mountClientsView() {
  const wrapper = mountWithFrontendMocks(ClientsView, {
    global: {
      stubs: {
        clientsTable: clientsTableStub,
      },
    },
  })

  await nextTick()
  await nextTick()

  return wrapper
}

describe('views/ClientsView.vue', () => {
  it('loads companies and displays the default active-only filtered list', async () => {
    mockLoadCompaniesSuccess([
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
        accountsCount: 1,
      },
    ])

    const wrapper = await mountClientsView()

    expect(wrapper.find('[data-test="section-layout-title"]').text()).toBe('clients.title')
    expect(wrapper.findAll('[data-test="company-row"]').map((row) => row.text())).toEqual(['Acme Corp'])
  })

  it('forwards toolbar filters to the table data', async () => {
    const wrapper = await mountClientsView()

    await wrapper.find('input').setValue('acme')
    await nextTick()

    expect(wrapper.findAll('[data-test="company-row"]').map((row) => row.text())).toEqual(['Acme Corp'])
  })

  it('displays load errors and retries loading companies', async () => {
    mockLoadCompaniesFailure('server_error')
    const wrapper = await mountClientsView()

    expect(wrapper.find('[data-test="clients-table-stub"]').attributes('data-error')).toBe('server_error')

    mockLoadCompaniesSuccess()
    await wrapper.find('[data-test="retry"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-test="clients-table-stub"]').attributes('data-error')).toBeUndefined()
    expect(wrapper.findAll('[data-test="company-row"]').map((row) => row.text())).toEqual(['Acme Corp'])
  })

  it('navigates to accounts and edit pages from table events', async () => {
    const wrapper = await mountClientsView()

    await wrapper.find('[data-test="view-accounts"]').trigger('click')
    await wrapper.find('[data-test="edit-company"]').trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(2)
  })

  it('updates and removes companies from table events while showing a banner', async () => {
    const wrapper = await mountClientsView()

    await wrapper.find('[data-test="updated-company"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="base-banner"]').exists()).toBe(true)
    const banner = wrapper.find('[data-test="base-banner"]')

    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('companyDeactivated')

    await wrapper.find('[data-test="deleted-company"]').trigger('click')
    await nextTick()

    expect(wrapper.findAll('[data-test="company-row"]')).toHaveLength(0)
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('companyDeleted')
  })

  it('shows and dismisses action errors from the table', async () => {
    const wrapper = await mountClientsView()

    await wrapper.find('[data-test="table-error"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('server_error')

    await wrapper.find('[data-test="base-banner-dismiss"]').trigger('click')

    expect(wrapper.find('[data-test="base-banner"]').exists()).toBe(false)
  })
})
