import {
  type CreateCompanyAccountResult,
  createCompanyAccountServiceMock,
  mockCreateCompanyAccountFailure,
  mockCreateCompanyAccountSuccess,
  mockUpdateCompanyAccountSuccess,
  updateCompanyAccountServiceMock,
} from '@frontend-tests/_helpers/accountsServiceMock'
import {
  refreshMeMock,
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
} from '@quizzup/shared'
import { type DOMWrapper,flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import CreateAccountForm from '@/views/clients/accounts/create/CreateAccountForm.vue'

resetFrontendMocksBeforeEach()

function findInput(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  name: string,
): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

async function submitForm(wrapper: ReturnType<typeof mountWithFrontendMocks>): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await nextTick()
}

const editAccount = {
  id: 9,
  companyId: 1,
  firstname: 'Existing',
  lastname: 'Admin',
  displayName: 'Existing Admin',
  username: 'existing',
  email: 'existing@quizzup.test',
  role: ADMIN_ROLE_ADMIN,
  status: ADMIN_STATUS_ACTIVE,
  deletedAt: null,
}

describe('views/clients/accounts/create/CreateAccountForm.vue', () => {
  it('renders create mode fields and role options for superadmins', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    expect(findInput(wrapper, 'username').attributes('required')).toBeDefined()
    expect(findInput(wrapper, 'email').attributes('required')).toBeDefined()
    expect(findInput(wrapper, 'password').attributes('required')).toBeDefined()
    expect(wrapper.find('select[name="role"]').exists()).toBe(true)
    expect(wrapper.find('select[name="role"]').text()).toContain('accounts.form.fields.role.options.superadmin')
    expect(wrapper.text()).toContain('accounts.form.actions.create')
    expect(wrapper.text()).toContain('accounts.form.hints.create')
  })

  it('limits role options for company admins and hides role field in profile mode', () => {
    setAuthenticatedAdmin()

    const adminWrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    expect(adminWrapper.find('select[name="role"]').text()).not.toContain(
      'accounts.form.fields.role.options.superadmin',
    )
    expect(adminWrapper.find('select[name="role"]').text()).toContain('accounts.form.fields.role.options.admin')
    expect(adminWrapper.find('select[name="role"]').text()).toContain('accounts.form.fields.role.options.user')

    const profileWrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'edit',
        companyId: 1,
        profileMode: true,
        account: editAccount,
      },
    })

    expect(profileWrapper.find('select[name="role"]').exists()).toBe(false)
  })

  it('validates required fields before calling the create service', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await findInput(wrapper, 'username').setValue('')
    await findInput(wrapper, 'email').setValue('')
    await findInput(wrapper, 'password').setValue('')
    await submitForm(wrapper)

    expect(createCompanyAccountServiceMock).not.toHaveBeenCalled()
    const errors = wrapper
      .findAll('[data-test="form-field-error"]')
      .map((error) => error.text())
      .join(' ')

    expect(errors).toContain('accounts.form.validation.usernameRequired')
    expect(errors).toContain('accounts.form.validation.emailInvalid')
    expect(errors).toContain('accounts.form.validation.passwordRequired')
  })

  it('creates an account, trims payload values and navigates back to accounts list', async () => {
    setAuthenticatedAdmin()
    mockCreateCompanyAccountSuccess()

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await findInput(wrapper, 'firstname').setValue('  Alice  ')
    await findInput(wrapper, 'lastname').setValue('  Admin  ')
    await findInput(wrapper, 'username').setValue('  alice  ')
    await findInput(wrapper, 'email').setValue('  alice@quizzup.test  ')
    await findInput(wrapper, 'password').setValue('ChangeMe123!')

    await submitForm(wrapper)

    expect(createCompanyAccountServiceMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        firstname: 'Alice',
        lastname: 'Admin',
        username: 'alice',
        email: 'alice@quizzup.test',
        password: 'ChangeMe123!',
      }),
    )
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('maps API field errors to the matching field', async () => {
    setAuthenticatedAdmin()
    mockCreateCompanyAccountFailure('email_already_exists')

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await findInput(wrapper, 'username').setValue('alice')
    await findInput(wrapper, 'email').setValue('alice@quizzup.test')
    await findInput(wrapper, 'password').setValue('ChangeMe123!')
    await submitForm(wrapper)

    expect(wrapper.findAll('[data-test="form-field-error"]').map((error) => error.text()).join(' ')).toContain(
      'accounts.form.errors',
    )
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('maps generic API errors to the form result', async () => {
    setAuthenticatedAdmin()
    mockCreateCompanyAccountFailure('server_error')

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await findInput(wrapper, 'username').setValue('alice')
    await findInput(wrapper, 'email').setValue('alice@quizzup.test')
    await findInput(wrapper, 'password').setValue('ChangeMe123!')
    await submitForm(wrapper)

    expect(wrapper.find('[data-test="form-result-error"]').text()).toContain('accounts.form.errors')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('disables fields and submit action while creating the account', async () => {
    setAuthenticatedAdmin()

    let resolveCreate: ((value: CreateCompanyAccountResult) => void) | undefined

    createCompanyAccountServiceMock.mockImplementation(
      () =>
        new Promise<CreateCompanyAccountResult>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await findInput(wrapper, 'username').setValue('created')
    await findInput(wrapper, 'email').setValue('created@quizzup.test')
    await findInput(wrapper, 'password').setValue('ChangeMe123!')

    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(findInput(wrapper, 'username').attributes('disabled')).toBeDefined()
    expect(findInput(wrapper, 'email').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="form-actions-submit"]').attributes('disabled')).toBeDefined()

    resolveCreate?.({
      ok: true,
      data: {
        account: {
          id: 42,
          companyId: 1,
          firstname: 'Created',
          lastname: 'User',
          displayName: 'Created User',
          username: 'created',
          email: 'created@quizzup.test',
          role: ADMIN_ROLE_USER,
          status: ADMIN_STATUS_ACTIVE,
        },
      },
    })

    await nextTick()
    await nextTick()

    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('updates an existing account in edit mode without requiring a password', async () => {
    setAuthenticatedSuperadmin()
    mockUpdateCompanyAccountSuccess({
      ...editAccount,
      firstname: 'Updated',
    })

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'edit',
        companyId: 1,
        account: editAccount,
      },
    })

    expect(findInput(wrapper, 'username').element.value).toBe('existing')
    expect(findInput(wrapper, 'password').attributes('required')).toBeUndefined()

    await findInput(wrapper, 'firstname').setValue('Updated')
    await submitForm(wrapper)

    expect(updateCompanyAccountServiceMock).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        firstname: 'Updated',
      }),
    )
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('shows not found when edit mode has no account', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'edit',
        companyId: 1,
        account: null,
      },
    })

    await findInput(wrapper, 'username').setValue('missing')
    await findInput(wrapper, 'email').setValue('missing@quizzup.test')

    await submitForm(wrapper)

    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe('accounts.form.errors.not_found')
  })

  it('updates profile mode, refreshes me and stays on the page with a success message', async () => {
    setAuthenticatedUser()
    mockUpdateCompanyAccountSuccess({
      ...editAccount,
      id: 3,
      role: ADMIN_ROLE_USER,
    })

    const wrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'edit',
        companyId: 1,
        account: {
          ...editAccount,
          id: 3,
          role: ADMIN_ROLE_USER,
        },
        profileMode: true,
      },
    })

    await findInput(wrapper, 'firstname').setValue('Profile')
    await submitForm(wrapper)

    expect(refreshMeMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="form-result-success"]').text()).toBe(
      'accounts.form.success.profileUpdated',
    )
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('navigates back to home in profile mode and accounts list otherwise', async () => {
    setAuthenticatedUser()

    const profileWrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'edit',
        companyId: 1,
        account: editAccount,
        profileMode: true,
      },
    })

    await profileWrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'home' })

    pushMock.mockClear()

    const accountWrapper = mountWithFrontendMocks(CreateAccountForm, {
      props: {
        mode: 'create',
        companyId: 1,
      },
    })

    await accountWrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(pushMock).toHaveBeenCalledTimes(1)
  })
})
