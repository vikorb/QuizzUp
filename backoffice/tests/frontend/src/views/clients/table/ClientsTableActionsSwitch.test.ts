import {
  mockUpdateCompanyStatusFailure,
  mockUpdateCompanyStatusSuccess,
  updateCompanyStatusServiceMock,
} from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it, vi } from 'vitest'

import ClientsTableActionsSwitch from '@/views/clients/table/ClientsTableActionsSwitch.vue'

resetFrontendMocksBeforeEach()

const activeCompany = {
  id: 1,
  name: 'Acme Corp',
  email: 'contact@acme.test',
  status: COMPANY_STATUS_ACTIVE,
  accountsCount: 3,
}

describe('views/clients/table/ClientsTableActionsSwitch.vue', () => {
  it('does nothing when the confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false)

    const wrapper = mountWithFrontendMocks(ClientsTableActionsSwitch, {
      props: {
        company: activeCompany,
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(updateCompanyStatusServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('disables deleted companies', async () => {
    const wrapper = mountWithFrontendMocks(ClientsTableActionsSwitch, {
      props: {
        company: {
          ...activeCompany,
          status: COMPANY_STATUS_DELETED,
        },
      },
    })

    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(updateCompanyStatusServiceMock).not.toHaveBeenCalled()
  })

  it('updates an active company to inactive and emits busy changes', async () => {
    mockUpdateCompanyStatusSuccess({
      name: 'Acme Corp',
      email: 'contact@acme.test',
      accountsCount: 3,
    })

    const wrapper = mountWithFrontendMocks(ClientsTableActionsSwitch, {
      props: {
        company: activeCompany,
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(updateCompanyStatusServiceMock).toHaveBeenCalledWith(1, COMPANY_STATUS_INACTIVE)
    expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({
      id: 1,
      name: 'Acme Corp',
      status: COMPANY_STATUS_INACTIVE,
    })
  })

  it('emits an error when the service fails', async () => {
    mockUpdateCompanyStatusFailure('server_error')

    const wrapper = mountWithFrontendMocks(ClientsTableActionsSwitch, {
      props: {
        company: activeCompany,
      },
    })

    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
  })
})
