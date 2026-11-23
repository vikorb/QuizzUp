import {
  confirmTotpEnrollApiMock,
  loginApiMock,
  loginTotpApiMock,
  mockLoginChallenge,
  mockLoginFailure,
  mockLoginSuccess,
  setTokenMock,
  startTotpEnrollApiMock,
} from '@frontend-tests/_helpers/authApiMock'
import {
  clearRoomAccountRejectionMock,
  mockRefreshMeRejectsRoomAccount,
  refreshMeMock,
  roomAccountRejectedMock,
} from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { replaceMock } from '@frontend-tests/_helpers/routerMock'
import { getRedirectMock } from '@frontend-tests/_helpers/routerUtilsMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import LoginForm from '@/views/login/LoginForm.vue'

resetFrontendMocksBeforeEach()

import type { DOMWrapper } from '@vue/test-utils'

function findInput(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  name: string
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
    expect(
      wrapper
        .find('[data-test="form-field-right"] [data-test="ui-button"]')
        .attributes('aria-label')
    ).toBe('auth.login.hidePassword')
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
        })
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

  it('refreshes /me before redirecting a backoffice account', async () => {
    mockLoginSuccess('jwt-token-123')

    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitForm(wrapper)
    await flushPromises()

    expect(refreshMeMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })

  it('stays on the login screen with a clear message for a room account', async () => {
    mockLoginSuccess('room-token')
    mockRefreshMeRejectsRoomAccount()

    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitForm(wrapper)
    await flushPromises()

    expect(setTokenMock).toHaveBeenCalledWith('room-token')
    expect(refreshMeMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).not.toHaveBeenCalled()
    expect(wrapper.find('.form-error').text()).toBe('auth.errors.roomAccount')
  })

  it('explains a room account session closed elsewhere and clears it on a new attempt', async () => {
    roomAccountRejectedMock.value = true
    mockLoginFailure('invalid_credentials')

    const wrapper = mountWithFrontendMocks(LoginForm)

    expect(wrapper.find('.form-error').text()).toBe('auth.errors.roomAccount')

    await submitForm(wrapper)
    await flushPromises()

    expect(clearRoomAccountRejectionMock).toHaveBeenCalled()
    expect(wrapper.find('.form-error').text()).toBe('auth.errors.invalid_credentials')
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

async function submitCredentials(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  await submitForm(wrapper)
  await flushPromises()
}

async function submitCode(wrapper: ReturnType<typeof mountWithFrontendMocks>, code: string) {
  await findInput(wrapper, 'code').setValue(code)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('views/login/LoginForm.vue — superadmin en deux temps', () => {
  it('asks for the code after the password and opens the session only once it is accepted', async () => {
    mockLoginChallenge('totp')
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)

    expect(findInput(wrapper, 'identifier').exists()).toBe(false)
    expect(findInput(wrapper, 'code').exists()).toBe(true)
    expect(wrapper.text()).toContain('login.mfa.totp.title')
    expect(setTokenMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()

    getRedirectMock.mockReturnValue('/dashboard')
    await submitCode(wrapper, '123456')

    expect(loginTotpApiMock).toHaveBeenCalledWith({
      challengeToken: 'challenge-jwt',
      code: '123456',
    })
    expect(setTokenMock).toHaveBeenCalledWith('test-totp-token')
    expect(refreshMeMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/dashboard')
  })

  it('stays on the code step after a wrong code', async () => {
    mockLoginChallenge('totp')
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_invalid' })
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)
    await submitCode(wrapper, '000000')

    expect(findInput(wrapper, 'code').exists()).toBe(true)
    expect(wrapper.find('[data-test="form-field-error"]').text()).toBe('errors.totp_invalid')
    expect(setTokenMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('returns to the password step, empty, with a message when the challenge expired', async () => {
    mockLoginChallenge('totp')
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'mfa_challenge_invalid' })
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)
    await submitCode(wrapper, '123456')

    expect(findInput(wrapper, 'identifier').exists()).toBe(true)
    expect(findInput(wrapper, 'password').element.value).toBe('')
    expect(wrapper.find('.form-error').text()).toBe('errors.mfa_challenge_invalid')
    expect(setTokenMock).not.toHaveBeenCalled()
  })

  it('returns to the password step without a message when the user goes back', async () => {
    mockLoginChallenge('totp')
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)
    await wrapper.find('button.secondary').trigger('click')

    expect(findInput(wrapper, 'identifier').exists()).toBe(true)
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })

  it('switches to the enrollment when the server says the account has no application', async () => {
    mockLoginChallenge('totp')
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_not_enrolled' })
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)
    await submitCode(wrapper, '123456')

    expect(startTotpEnrollApiMock).toHaveBeenCalledWith({ challengeToken: 'challenge-jwt' })
    expect(wrapper.text()).toContain('login.mfa.enroll.title')
  })

  it('shows the service-unavailable text on the password step', async () => {
    mockLoginFailure('totp_unavailable')
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)

    expect(wrapper.find('.form-error').text()).toBe('auth.errors.totp_unavailable')
    expect(findInput(wrapper, 'identifier').exists()).toBe(true)
  })

  it('walks through the enrollment and shows the recovery codes before opening the session', async () => {
    mockLoginChallenge('enroll')
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)

    expect(startTotpEnrollApiMock).toHaveBeenCalledWith({ challengeToken: 'challenge-jwt' })
    expect(wrapper.find('.secret').text()).toBe('JBSW Y3DP EHPK 3PXP')

    await submitCode(wrapper, '123456')

    expect(confirmTotpEnrollApiMock).toHaveBeenCalledWith({
      challengeToken: 'challenge-jwt',
      code: '123456',
    })
    expect(wrapper.findAll('.codes code').map((code) => code.text())).toEqual([
      'aaaaa-bbbbb',
      'ccccc-ddddd',
    ])
    expect(wrapper.find('.secret').exists()).toBe(false)
    expect(setTokenMock).not.toHaveBeenCalled()

    // Sans la case cochée, rien ne se passe.
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(setTokenMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(setTokenMock).toHaveBeenCalledWith('test-enroll-token')
    expect(replaceMock).toHaveBeenCalledTimes(1)
  })

  it('returns to the password step when the enrollment was completed elsewhere', async () => {
    mockLoginChallenge('enroll')
    confirmTotpEnrollApiMock.mockResolvedValue({ ok: false, reason: 'totp_already_enrolled' })
    const wrapper = mountWithFrontendMocks(LoginForm)

    await submitCredentials(wrapper)
    await submitCode(wrapper, '123456')

    expect(findInput(wrapper, 'identifier').exists()).toBe(true)
    expect(wrapper.find('.form-error').text()).toBe('errors.totp_already_enrolled')
    expect(setTokenMock).not.toHaveBeenCalled()
  })

  it('never writes the challenge token, the secret or the recovery codes to a storage or the URL', async () => {
    const storages = ['localStorage', 'sessionStorage'].map((name) => {
      const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }
      vi.stubGlobal(name, storage)

      return storage
    })

    try {
      mockLoginChallenge('enroll', 'challenge-secret-value')
      const wrapper = mountWithFrontendMocks(LoginForm)

      await submitCredentials(wrapper)
      await submitCode(wrapper, '123456')
      await wrapper.find('input[type="checkbox"]').setValue(true)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      for (const storage of storages) expect(storage.setItem).not.toHaveBeenCalled()
      expect(window.location.href).not.toContain('challenge-secret-value')
      expect(JSON.stringify(replaceMock.mock.calls)).not.toContain('challenge-secret-value')
      expect(JSON.stringify(replaceMock.mock.calls)).not.toContain('JBSWY3DPEHPK3PXP')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
