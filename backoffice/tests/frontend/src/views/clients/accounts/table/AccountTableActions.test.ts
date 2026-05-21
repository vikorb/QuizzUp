import {
  accountsFixture,
  deleteAccountServiceMock,
  mockDeleteAccountFailure,
  mockDeleteAccountSuccess,
} from '@frontend-tests/_helpers/accountsServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { ADMIN_STATUS_DELETED } from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import AccountTableActions from '@/views/clients/accounts/table/AccountTableActions.vue'

resetFrontendMocksBeforeEach()

afterEach(() => {
  vi.restoreAllMocks()
})

function actionButtons(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.findAll('[data-test="ui-button"]')
}

describe('views/clients/accounts/table/AccountTableActions.vue', () => {
  it('navigates to the edit account route', async () => {
    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: accountsFixture[0],
      },
      global: {
        stubs: {
          accountTableActionsSwitch: {
            name: 'AccountTableActionsSwitch',
            template: '<button data-test="account-switch-stub" />',
          },
        },
      },
    })

    await actionButtons(wrapper)[0].trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('confirms and soft-deletes an account', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockDeleteAccountSuccess()

    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: accountsFixture[0],
      },
      global: {
        stubs: {
          accountTableActionsSwitch: {
            name: 'AccountTableActionsSwitch',
            template: '<button data-test="account-switch-stub" />',
          },
        },
      },
    })

    await actionButtons(wrapper)[1].trigger('click')
    await nextTick()
    await nextTick()

    expect(window.confirm).toHaveBeenCalledWith('accounts.table.actions.deleteConfirm')
    expect(deleteAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({
      status: ADMIN_STATUS_DELETED,
    })
    expect(wrapper.emitted('deleted')).toEqual([[1]])
  })

  it('does not call delete API when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: accountsFixture[0],
      },
      global: {
        stubs: {
          accountTableActionsSwitch: {
            name: 'AccountTableActionsSwitch',
            template: '<button data-test="account-switch-stub" />',
          },
        },
      },
    })

    await actionButtons(wrapper)[1].trigger('click')

    expect(deleteAccountServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('emits error when deletion fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockDeleteAccountFailure('server_error')

    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: accountsFixture[0],
      },
      global: {
        stubs: {
          accountTableActionsSwitch: {
            name: 'AccountTableActionsSwitch',
            template: '<button data-test="account-switch-stub" />',
          },
        },
      },
    })

    await actionButtons(wrapper)[1].trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('disables edit and delete actions for deleted accounts', () => {
    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: {
          ...accountsFixture[0],
          status: ADMIN_STATUS_DELETED,
        },
      },
    })

    expect(actionButtons(wrapper)[0].attributes('disabled')).toBeDefined()
    expect(actionButtons(wrapper)[1].attributes('disabled')).toBeDefined()
  })

  it('forwards switch events to the parent component', async () => {
    const wrapper = mountWithFrontendMocks(AccountTableActions, {
      props: {
        companyId: 1,
        item: accountsFixture[0],
      },
      global: {
        stubs: {
          accountTableActionsSwitch: {
            name: 'AccountTableActionsSwitch',
            emits: ['updated', 'error', 'busy-change'],
            template: `
              <div>
                <button data-test="switch-updated" @click="$emit('updated', { id: 1, username: 'updated' })" />
                <button data-test="switch-error" @click="$emit('error', 'server_error')" />
                <button data-test="switch-busy" @click="$emit('busy-change', true)" />
              </div>
            `,
          },
        },
      },
    })

    await wrapper.find('[data-test="switch-updated"]').trigger('click')
    await wrapper.find('[data-test="switch-error"]').trigger('click')
    await wrapper.find('[data-test="switch-busy"]').trigger('click')

    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(actionButtons(wrapper)[0].attributes('disabled')).toBeDefined()
  })
})
