import {
  accountsFixture,
  createAccountFixture,
} from '@frontend-tests/_helpers/accountsServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { ADMIN_STATUS_DELETED, ADMIN_STATUS_INACTIVE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import AccountsTable from '@/views/clients/accounts/AccountsTable.vue'

resetFrontendMocksBeforeEach()

describe('views/clients/accounts/AccountsTable.vue', () => {
  it('renders account rows with status labels', () => {
    const wrapper = mountWithFrontendMocks(AccountsTable, {
      props: {
        companyId: 1,
        accounts: [
          accountsFixture[0],
          createAccountFixture({
            id: 3,
            status: ADMIN_STATUS_DELETED,
            username: 'deleted',
            displayName: 'Deleted User',
            email: 'deleted@quizzup.test',
          }),
        ],
        loading: false,
        error: null,
      },
      global: {
        stubs: {
          accountTableActions: {
            name: 'AccountTableActions',
            template: '<button data-test="account-table-actions-stub" />',
          },
        },
      },
    })

    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Alice Admin')
    expect(wrapper.text()).toContain('alice@quizzup.test')
    expect(wrapper.text()).toContain('accounts.status.active')
    expect(wrapper.text()).toContain('accounts.status.deleted')
  })

  it('renders loading, empty and error states through BaseCard', async () => {
    const loadingWrapper = mountWithFrontendMocks(AccountsTable, {
      props: {
        companyId: 1,
        accounts: [],
        loading: true,
        error: null,
      },
    })

    expect(loadingWrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')

    const errorWrapper = mountWithFrontendMocks(AccountsTable, {
      props: {
        companyId: 1,
        accounts: [],
        loading: false,
        error: 'server_error',
      },
    })

    expect(errorWrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('server_error')

    await errorWrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(errorWrapper.emitted('retry')).toHaveLength(1)
  })

  it('forwards child action events', async () => {
    const wrapper = mountWithFrontendMocks(AccountsTable, {
      props: {
        companyId: 1,
        accounts: [accountsFixture[0]],
        loading: false,
        error: null,
      },
      global: {
        stubs: {
          accountTableActions: {
            name: 'AccountTableActions',
            props: ['item'],
            emits: ['edit', 'updated', 'deleted', 'error'],
            template: `
              <div data-test="account-table-actions-stub">
                <button data-test="edit-account" @click="$emit('edit', item.id)" />
                <button data-test="updated-account" @click="$emit('updated', item)" />
                <button data-test="deleted-account" @click="$emit('deleted', item.id)" />
                <button data-test="error-account" @click="$emit('error', 'server_error')" />
              </div>
            `,
          },
        },
      },
    })

    await wrapper.find('[data-test="edit-account"]').trigger('click')
    await wrapper.find('[data-test="updated-account"]').trigger('click')
    await wrapper.find('[data-test="deleted-account"]').trigger('click')
    await wrapper.find('[data-test="error-account"]').trigger('click')

    expect(wrapper.emitted('edit')).toEqual([[1]])
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(wrapper.emitted('deleted')).toEqual([[1]])
    expect(wrapper.emitted('error')).toEqual([['server_error']])
  })

  it('supports inactive account rows', () => {
    const wrapper = mountWithFrontendMocks(AccountsTable, {
      props: {
        companyId: 1,
        accounts: [
          createAccountFixture({
            id: 4,
            status: ADMIN_STATUS_INACTIVE,
            displayName: 'Inactive User',
            username: 'inactive',
            email: 'inactive@quizzup.test',
          }),
        ],
        loading: false,
        error: null,
      },
    })

    expect(wrapper.text()).toContain('accounts.status.inactive')
  })
})
