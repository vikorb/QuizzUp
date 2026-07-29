import { setAuthenticatedAdmin, setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import { saveClientDetailCompanyMock } from '@frontend-tests/_helpers/companyDetailFormMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { COMPANY_STATUS_ACTIVE, COMPANY_STATUS_INACTIVE } from '@quizzup/shared'
import type { DOMWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ClientDetailForm from '@/views/clients/details/ClientDetailForm.vue'

resetFrontendMocksBeforeEach()

const company = {
  id: 1,
  name: 'Acme Corp',
  email: 'contact@acme.test',
  status: COMPANY_STATUS_ACTIVE,
  accountsCount: 3,
}

function findInput(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  name: string
): DOMWrapper<HTMLInputElement> {
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

    saveClientDetailCompanyMock.mockResolvedValue({
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

    expect(saveClientDetailCompanyMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Updated' }),
      expect.any(Function)
    )
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ name: 'Updated' })
    expect(wrapper.find('[data-test="form-result-success"]').text()).toBe(
      'clients.details.success.updated'
    )
  })

  it('renders field and form errors when save fails', async () => {
    setAuthenticatedAdmin()

    saveClientDetailCompanyMock.mockResolvedValue({
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
