import { setAuthenticatedAdmin, setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import type { DOMWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const detailFormMock = vi.hoisted(() => ({
  saveClientDetailCompany: vi.fn(),
}))

vi.mock('@/utils/company/details/form', () => ({
  createClientDetailFieldErrors: () => ({
    name: null,
    email: null,
  }),
  createClientDetailFormValues: () => ({
    name: '',
    email: '',
    status: 1,
  }),
  getClientDetailFormValues: (company: { name: string; email: string; status: number }) => ({
    name: company.name,
    email: company.email,
    status: company.status,
  }),
  getClientDetailNextStatus: (status: number) => (status === 1 ? 0 : 1),
  getClientDetailPermissions: (role: string | null) => ({
    canManageCompany: role === 'admin' || role === 'superadmin',
    canShowStatusSwitch: role === 'admin' || role === 'superadmin',
    isCompanyReadonly: role !== 'admin' && role !== 'superadmin',
  }),
  hasClientDetailCompanyChanges: (
    form: { name: string; email: string; status: number },
    company: { name: string; email: string; status: number },
    canManageCompany: boolean,
  ) => canManageCompany && (form.name !== company.name || form.email !== company.email || form.status !== company.status),
  saveClientDetailCompany: detailFormMock.saveClientDetailCompany,
}))

import ClientDetailForm from '@/views/clients/details/ClientDetailForm.vue'

resetFrontendMocksBeforeEach()

const company = {
  id: 1,
  name: 'Acme Corp',
  email: 'contact@acme.test',
  status: COMPANY_STATUS_ACTIVE,
  accountsCount: 3,
}

function findInput(wrapper: ReturnType<typeof mountWithFrontendMocks>, name: string): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

describe('views/clients/details/ClientDetailForm.vue', () => {
  it('renders readonly fields without actions for users without manage permission', () => {
    setAuthenticatedUser()

    const wrapper = mountWithFrontendMocks(ClientDetailForm, {
      props: {
        company,
      },
    })

    expect(findInput(wrapper, 'name').element.value).toBe('Acme Corp')
    expect(findInput(wrapper, 'email').element.value).toBe('contact@acme.test')
    expect(findInput(wrapper, 'name').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="switch-field"]').exists()).toBe(false)
    expect(wrapper.find('.company-form__actions').exists()).toBe(false)
  })

  it('allows admins to edit fields, reset changes and toggle status', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ClientDetailForm, {
      props: {
        company,
      },
    })

    await findInput(wrapper, 'name').setValue('Updated')
    await wrapper.find('[data-test="switch-field"]').trigger('click')

    expect(wrapper.find('[data-test="form-actions-submit"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="ui-button"]')[1].attributes('disabled')).toBeUndefined()

    await wrapper.findAll('[data-test="ui-button"]')[0].trigger('click')

    expect(findInput(wrapper, 'name').element.value).toBe('Acme Corp')
  })

  it('emits updated company and success message after a successful save', async () => {
    setAuthenticatedAdmin()

    detailFormMock.saveClientDetailCompany.mockResolvedValue({
      ok: true,
      company: {
        ...company,
        name: 'Updated',
      },
      successMessage: 'clients.details.success.updated',
    })

    const wrapper = mountWithFrontendMocks(ClientDetailForm, {
      props: {
        company,
      },
    })

    await findInput(wrapper, 'name').setValue('Updated')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    expect(detailFormMock.saveClientDetailCompany).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Updated' }),
      expect.any(Function),
    )
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ name: 'Updated' })
    expect(wrapper.find('[data-test="form-result-success"]').text()).toBe(
      'clients.details.success.updated',
    )
  })

  it('renders field and form errors when save fails', async () => {
    setAuthenticatedAdmin()

    detailFormMock.saveClientDetailCompany.mockResolvedValue({
      ok: false,
      fieldErrors: {
        name: 'name error',
        email: null,
      },
      formError: 'form error',
    })

    const wrapper = mountWithFrontendMocks(ClientDetailForm, {
      props: {
        company,
      },
    })

    await findInput(wrapper, 'name').setValue('Updated')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-test="form-field-error"]').text()).toBe('name error')
    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe('form error')
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('syncs form values when the company prop changes', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ClientDetailForm, {
      props: {
        company,
      },
    })

    await wrapper.setProps({
      company: {
        ...company,
        name: 'Beta Studio',
        email: 'hello@beta.test',
        status: COMPANY_STATUS_INACTIVE,
      },
    })

    expect(findInput(wrapper, 'name').element.value).toBe('Beta Studio')
    expect(findInput(wrapper, 'email').element.value).toBe('hello@beta.test')
  })
})
