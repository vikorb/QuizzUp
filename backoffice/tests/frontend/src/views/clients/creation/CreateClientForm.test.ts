import type {
  CreateCompanyResult} from '@frontend-tests/_helpers/companiesServiceMock';
import {
  createCompanyMock,
  mockCreateCompanyFailure,
  mockCreateCompanySuccess,
} from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared';
import type { DOMWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import CreateClientForm from '@/views/clients/creation/CreateClientForm.vue'

resetFrontendMocksBeforeEach()

function findInput(wrapper: ReturnType<typeof mountWithFrontendMocks>, name: string): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

async function submitForm(wrapper: ReturnType<typeof mountWithFrontendMocks>): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await nextTick()
}

describe('views/clients/creation/CreateClientForm.vue', () => {
  it('renders fields, actions and hint', () => {
    const wrapper = mountWithFrontendMocks(CreateClientForm)

    expect(findInput(wrapper, 'name').attributes('autocomplete')).toBe('organization')
    expect(findInput(wrapper, 'email').attributes('type')).toBe('email')
    expect(wrapper.find('[data-test="form-actions-cancel"]').text()).toBe('clients.create.actions.cancel')
    expect(wrapper.find('[data-test="form-actions-submit"]').text()).toBe('clients.create.actions.submit')
    expect(wrapper.text()).toContain('clients.create.hint')
  })

  it('validates required fields before calling the API', async () => {
    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await submitForm(wrapper)

    expect(createCompanyMock).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-test="form-field-error"]').map((error) => error.text())).toEqual([
      'clients.create.errors.required',
      'clients.create.errors.required',
    ])
  })

  it('creates a company with normalized payload and redirects to details', async () => {
    mockCreateCompanySuccess({
      id: 42,
      name: 'Acme Corp',
      email: 'contact@acme.test',
      status: 1,
      accountsCount: 0,
    })

    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await findInput(wrapper, 'name').setValue('  Acme Corp  ')
    await findInput(wrapper, 'email').setValue('  CONTACT@ACME.TEST  ')
    await submitForm(wrapper)
    await nextTick()

    expect(createCompanyMock).toHaveBeenCalledWith({
      name: 'Acme Corp',
      email: 'contact@acme.test',
    })
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('maps API field errors to the matching field', async () => {
    mockCreateCompanyFailure('email_already_exists')

    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await findInput(wrapper, 'name').setValue('Acme Corp')
    await findInput(wrapper, 'email').setValue('contact@acme.test')
    await submitForm(wrapper)

    expect(wrapper.findAll('[data-test="form-field-error"]').map((error) => error.text())).toContain(
      'clients.create.errorsApi.emailAlreadyExists',
    )
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('maps generic API errors to the form result', async () => {
    mockCreateCompanyFailure('server_error')

    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await findInput(wrapper, 'name').setValue('Acme Corp')
    await findInput(wrapper, 'email').setValue('contact@acme.test')
    await submitForm(wrapper)

    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe('clients.create.errorsApi.serverError')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('disables fields and submit action while creating the company', async () => {
    let resolveCreate: ((value: CreateCompanyResult) => void) | undefined

    createCompanyMock.mockImplementation(
      () =>
        new Promise<CreateCompanyResult>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await findInput(wrapper, 'name').setValue('Created Client')
    await findInput(wrapper, 'email').setValue('created@client.test')

    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(findInput(wrapper, 'name').attributes('disabled')).toBeDefined()
    expect(findInput(wrapper, 'email').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="form-actions-submit"]').attributes('disabled')).toBeDefined()

    resolveCreate?.({
      ok: true,
      data: {
        company: {
          id: 42,
          name: 'Created Client',
          email: 'created@client.test',
          status: COMPANY_STATUS_ACTIVE,
          accountsCount: 0,
        },
      },
    })

    await nextTick()
    await nextTick()

    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('navigates back to clients when cancelling', async () => {
    const wrapper = mountWithFrontendMocks(CreateClientForm)

    await wrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(1)
  })
})
