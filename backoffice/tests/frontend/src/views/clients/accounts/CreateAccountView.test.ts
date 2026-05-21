import {
  accountsFixture,
  loadCompanyAccountServiceMock,
  mockLoadCompanyAccountFailure,
  mockLoadCompanyAccountSuccess,
} from '@frontend-tests/_helpers/accountsServiceMock'
import { setAuthenticatedAdmin } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CreateAccountView from '@/views/clients/accounts/CreateAccountView.vue'

resetFrontendMocksBeforeEach()

function setRoute(name: string, params: Record<string, string>): void {
  currentRouteMock.name = name
  currentRouteMock.params = params
  currentRouteMock.path = '/clients/1/accounts/create'
  currentRouteMock.fullPath = '/clients/1/accounts/create'
}

describe('views/clients/accounts/CreateAccountView.vue', () => {
  it('renders create account form from route context', async () => {
    setAuthenticatedAdmin()
    setRoute('create-client-account', {
      companyId: '1',
    })

    const wrapper = mountWithFrontendMocks(CreateAccountView, {
      global: {
        stubs: {
          createAccountForm: {
            name: 'CreateAccountForm',
            props: ['mode', 'companyId', 'account', 'loadingAccount', 'profileMode'],
            template:
              '<form data-test="create-account-form-stub" :data-mode="mode" :data-company-id="String(companyId)" />',
          },
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('[data-test="section-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-account-form-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-account-form-stub"]').attributes('data-mode')).toBe('create')
    expect(wrapper.find('[data-test="create-account-form-stub"]').attributes('data-company-id')).toBe('1')
    expect(loadCompanyAccountServiceMock).not.toHaveBeenCalled()
  })

  it('loads account data in edit mode', async () => {
    setAuthenticatedAdmin()
    setRoute('edit-client-account', {
      companyId: '1',
      accountId: '1',
    })
    mockLoadCompanyAccountSuccess(accountsFixture[0])

    const wrapper = mountWithFrontendMocks(CreateAccountView, {
      global: {
        stubs: {
          createAccountForm: {
            name: 'CreateAccountForm',
            props: ['account', 'mode'],
            template:
              '<form data-test="create-account-form-stub" :data-mode="mode" :data-account-id="String(account?.id ?? \'\')" />',
          },
        },
      },
    })

    await flushPromises()

    expect(loadCompanyAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.find('[data-test="create-account-form-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-account-form-stub"]').attributes('data-mode')).toBe('edit')
    expect(wrapper.find('[data-test="create-account-form-stub"]').attributes('data-account-id')).toBe('1')
  })

  it('renders error when account loading fails', async () => {
    setAuthenticatedAdmin()
    setRoute('edit-client-account', {
      companyId: '1',
      accountId: '1',
    })
    mockLoadCompanyAccountFailure('not_found')

    const wrapper = mountWithFrontendMocks(CreateAccountView)

    await flushPromises()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('not_found')
    expect(wrapper.findComponent({ name: 'CreateAccountForm' }).exists()).toBe(false)
  })

  it('navigates back from the cancel action', async () => {
    setAuthenticatedAdmin()
    setRoute('create-client-account', {
      companyId: '1',
    })

    const wrapper = mountWithFrontendMocks(CreateAccountView, {
      global: {
        stubs: {
          createAccountForm: {
            name: 'CreateAccountForm',
            template: '<form data-test="create-account-form-stub" />',
          },
        },
      },
    })

    await flushPromises()

    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(1)
  })
})
