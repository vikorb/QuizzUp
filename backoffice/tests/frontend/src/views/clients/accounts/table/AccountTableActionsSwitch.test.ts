import {
  accountsFixture,
  mockUpdateAccountStatusFailure,
  mockUpdateAccountStatusSuccess,
  updateAccountStatusServiceMock,
} from '@frontend-tests/_helpers/accountsServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { ADMIN_STATUS_ACTIVE, ADMIN_STATUS_DELETED, ADMIN_STATUS_INACTIVE } from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import AccountTableActionsSwitch from '@/views/clients/accounts/table/AccountTableActionsSwitch.vue'

resetFrontendMocksBeforeEach()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('views/clients/accounts/table/AccountTableActionsSwitch.vue', () => {
  it('confirms and disables an active account', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockUpdateAccountStatusSuccess({
      status: ADMIN_STATUS_INACTIVE,
    })

    const wrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: accountsFixture[0],
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(window.confirm).toHaveBeenCalledWith('accounts.table.actions.disableConfirm')
    expect(updateAccountStatusServiceMock).toHaveBeenCalledWith(1, 1, ADMIN_STATUS_INACTIVE)
    expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({
      status: ADMIN_STATUS_INACTIVE,
    })
  })

  it('confirms and enables an inactive account', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const wrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: {
          ...accountsFixture[1],
          status: ADMIN_STATUS_INACTIVE,
        },
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(updateAccountStatusServiceMock).toHaveBeenCalledWith(1, 2, ADMIN_STATUS_ACTIVE)
  })

  it('does not call API when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: accountsFixture[0],
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(updateAccountStatusServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('emits an error when the status update fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockUpdateAccountStatusFailure('server_error')

    const wrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: accountsFixture[0],
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('is disabled for deleted accounts and when parent disables it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const deletedWrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: {
          ...accountsFixture[0],
          status: ADMIN_STATUS_DELETED,
        },
      },
    })

    const disabledWrapper = mountWithFrontendMocks(AccountTableActionsSwitch, {
      props: {
        companyId: 1,
        account: accountsFixture[0],
        disabled: true,
      },
    })

    expect(deletedWrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()
    expect(disabledWrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()
  })
})
