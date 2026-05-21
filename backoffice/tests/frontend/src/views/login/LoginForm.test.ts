import {
  loginApiMock,
  mockLoginFailure,
  mockLoginSuccess,
  setTokenMock,
} from '@frontend-tests/_helpers/authApiMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { replaceMock } from '@frontend-tests/_helpers/routerMock'
import { getRedirectMock } from '@frontend-tests/_helpers/routerUtilsMock'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import LoginForm from '@/views/login/LoginForm.vue'

resetFrontendMocksBeforeEach()

import type { DOMWrapper } from '@vue/test-utils'

function findInput(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  name: string,
): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

async function submitForm(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  await wrapper.find('form').trigger('submit')
  await nextTick()
}

describe('views/login/LoginForm.vue', () => {
  it('renders seed credentials, password mode and helper text', () => {
    const wrapper = mountWithFrontendMocks(LoginForm)

    expect(findInput(wrapper, 'identifier').element.value).toBe('admin@quizzup.local')
    expect(findInput(wrapper, 'identifier').attributes('autocomplete')).toBe('username')
    expect(findInput(wrapper, 'password').element.value).toBe('ChangeMe123!')
    expect(findInput(wrapper, 'password').attributes('type')).toBe('password')
    expect(findInput(wrapper, 'password').attributes('autocomplete')).toBe('current-password')

    expect(wrapper.text()).toContain('auth.login.submit')
    expect(wrapper.text()).toContain('auth.login.seedHint')
  })

  it('toggles password visibility with an accessible icon button', async () => {
    const wrapper = mountWithFrontendMocks(LoginForm)
    const passwordInput = findInput(wrapper, 'password')
    const toggleButton = wrapper.find('[data-test="form-field-right"] [data-test="ui-button"]')

    expect(passwordInput.attributes('type')).toBe('password')
    expect(toggleButton.attributes('aria-label')).toBe('auth.login.showPassword')

    await toggleButton.trigger('click')
    await nextTick()

    expect(findInput(wrapper, 'password').attributes('type')).toBe('text')
    expect(wrapper.find('[data-test="form-field-right"] [data-test="ui-button"]').attributes('aria-label')).toBe(
      'auth.login.hidePassword',
    )
  })

  it('validates required fields locally and does not call the login API', async () => {
    const wrapper = mountWithFrontendMocks(LoginForm)

    await findInput(wrapper, 'identifier').setValue('   ')
    await findInput(wrapper, 'password').setValue('')
    await submitForm(wrapper)

    const errors = wrapper.findAll('[data-test="form-field-error"]').map((error) => error.text())

    expect(errors).toEqual(['auth.errors.required', 'auth.errors.required'])
    expect(loginApiMock).not.toHaveBeenCalled()
    expect(setTokenMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('submits trimmed credentials, stores the token and redirects on success', async () => {
    mockLoginSuccess('jwt-token-123')
    getRedirectMock.mockReturnValue('/dashboard')

    const wrapper = mountWithFrontendMocks(LoginForm)

    await findInput(wrapper, 'identifier').setValue('  admin@quizzup.local  ')
    await findInput(wrapper, 'password').setValue('ChangeMe123!')
    await submitForm(wrapper)

    expect(loginApiMock).toHaveBeenCalledTimes(1)
    expect(loginApiMock).toHaveBeenCalledWith({
      identifier: 'admin@quizzup.local',
      password: 'ChangeMe123!',
    })
    expect(setTokenMock).toHaveBeenCalledWith('jwt-token-123')
    expect(getRedirectMock).toHaveBeenCalledWith(expect.anything(), '/')
    expect(replaceMock).toHaveBeenCalledWith('/dashboard')
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })

  it('shows a mapped form error and does not store token when credentials are rejected', async () => {
    mockLoginFailure('invalid_credentials')

    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitForm(wrapper)

    expect(loginApiMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.form-error').text()).toBe('auth.errors.invalid_credentials')
    expect(setTokenMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('disables fields and displays the submitting label while the request is pending', async () => {
    let resolveLogin: ((value: { ok: true; token: string }) => void) | undefined

    loginApiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        }),
    )

    const wrapper = mountWithFrontendMocks(LoginForm)

    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(findInput(wrapper, 'identifier').attributes('disabled')).toBeDefined()
    expect(findInput(wrapper, 'password').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('auth.login.submitting')

    resolveLogin?.({
      ok: true,
      token: 'pending-token',
    })
    await nextTick()
    await nextTick()

    expect(setTokenMock).toHaveBeenCalledWith('pending-token')
  })

  it('submits when the password field emits enter', async () => {
    mockLoginSuccess('enter-token')

    const wrapper = mountWithFrontendMocks(LoginForm)

    await findInput(wrapper, 'password').trigger('keydown', {
      key: 'Enter',
    })
    await nextTick()

    expect(loginApiMock).toHaveBeenCalledTimes(1)
    expect(setTokenMock).toHaveBeenCalledWith('enter-token')
  })
})
