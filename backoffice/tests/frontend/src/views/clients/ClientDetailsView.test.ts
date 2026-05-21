import { setAuthenticatedSuperadmin, setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import {
  mockLoadCompanyDetailsFailure,
  mockLoadCompanyDetailsSuccess,
} from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import ClientDetailsView from '@/views/clients/ClientDetailsView.vue'

resetFrontendMocksBeforeEach()

const clientDetailFormStub = defineComponent({
  name: 'ClientDetailForm',
  props: {
    company: {
      type: Object,
      required: true,
    },
  },
  emits: ['updated'],
  setup(props, { emit }) {
    return () =>
      h('section', { 'data-test': 'client-detail-form-stub' }, [
        h('span', { 'data-test': 'client-detail-name' }, String(props.company.name)),
        h('button', {
          type: 'button',
          'data-test': 'update-company',
          onClick: () => emit('updated', { ...props.company, name: 'Updated Client' }),
        }),
      ])
  },
})

const accountsSectionStub = defineComponent({
  name: 'ClientDetailAccountsSection',
  props: {
    companyId: Number,
    canShowAccountsSection: Boolean,
  },
  setup(props) {
    return () =>
      h('section', {
        'data-test': 'accounts-section-stub',
        'data-company-id': String(props.companyId),
        'data-can-show': String(props.canShowAccountsSection),
      })
  },
})

async function mountClientDetailsView() {
  currentRouteMock.params = {
    id: '1',
  }

  const wrapper = mountWithFrontendMocks(ClientDetailsView, {
    global: {
      stubs: {
        clientDetailForm: clientDetailFormStub,
        clientDetailAccountsSection: accountsSectionStub,
      },
    },
  })

  await nextTick()
  await nextTick()

  return wrapper
}

describe('views/clients/ClientDetailsView.vue', () => {
  it('loads and renders company details for superadmins', async () => {
    setAuthenticatedSuperadmin()
    mockLoadCompanyDetailsSuccess({
      id: 1,
      name: 'Acme Corp',
      email: 'contact@acme.test',
      status: COMPANY_STATUS_ACTIVE,
      accountsCount: 3,
    })

    const wrapper = await mountClientDetailsView()

    expect(wrapper.find('[data-test="section-layout-title"]').text()).toBe('clients.details.title')
    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe('clients.details.card.title')
    expect(wrapper.find('[data-test="client-detail-name"]').text()).toBe('Acme Corp')
    expect(wrapper.find('[data-test="accounts-section-stub"]').attributes('data-can-show')).toBe('true')
  })

  it('renders load errors and hides the form when details cannot be loaded', async () => {
    setAuthenticatedSuperadmin()
    mockLoadCompanyDetailsFailure('not_found')

    const wrapper = await mountClientDetailsView()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('not_found')
    expect(wrapper.find('[data-test="client-detail-form-stub"]').exists()).toBe(false)
  })

  it('updates displayed company when the form emits updated', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = await mountClientDetailsView()

    await wrapper.find('[data-test="update-company"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="client-detail-name"]').text()).toBe('Updated Client')
  })

  it('navigates back to clients for superadmins and home for regular users', async () => {
    setAuthenticatedSuperadmin()
    const superadminWrapper = await mountClientDetailsView()

    await superadminWrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(pushMock).toHaveBeenLastCalledWith('/clients')

    setAuthenticatedUser()
    const userWrapper = await mountClientDetailsView()

    await userWrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(pushMock).toHaveBeenLastCalledWith('/')
  })

  it('does not call the service when route id is invalid', async () => {
    currentRouteMock.params = {
      id: 'invalid',
    }

    const wrapper = mountWithFrontendMocks(ClientDetailsView, {
      global: {
        stubs: {
          clientDetailForm: clientDetailFormStub,
          clientDetailAccountsSection: accountsSectionStub,
        },
      },
    })

    await nextTick()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('invalid_params')
  })
})
