import { loginTotpApiMock } from '@frontend-tests/_helpers/authApiMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import TotpStep from '@/views/login/TotpStep.vue'

resetFrontendMocksBeforeEach()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// Le vrai FormField (pas le bouchon) : on contrôle les attributs d'accessibilité du champ.
function mountStep() {
  wrapper = mountWithFrontendMocks(TotpStep, {
    props: { challengeToken: 'challenge-jwt' },
    attachTo: document.body,
    global: { mocks: { $t: tWithParamsMock }, stubs: { formField: false } },
  })

  return wrapper
}

async function submitCode(step: VueWrapper, code: string) {
  await step.find('input[name="code"]').setValue(code)
  await step.find('form').trigger('submit')
  await flushPromises()
}

describe('views/login/TotpStep.vue', () => {
  it('exposes a labelled one-time-code field and focuses it on arrival', () => {
    const step = mountStep()
    const input = step.find('input[name="code"]')

    // Code à 6 chiffres ou code de secours « xxxxx-xxxxx » : pas de clavier numérique.
    expect(input.attributes('inputmode')).toBeUndefined()
    expect(input.attributes('autocapitalize')).toBe('none')
    expect(input.attributes('spellcheck')).toBe('false')
    expect(input.attributes('autocomplete')).toBe('one-time-code')
    expect(step.find(`label[for="${input.attributes('id')}"]`).text()).toContain(
      'login.mfa.code.label'
    )
    expect(document.activeElement).toBe(input.element)
    expect(step.text()).toContain('login.mfa.totp.hint:{"length":6}')
  })

  it('sends the challenge token with the code and signs in on success', async () => {
    loginTotpApiMock.mockResolvedValue({ ok: true, token: 'session-jwt' })
    const step = mountStep()

    await submitCode(step, ' 123456 ')

    expect(loginTotpApiMock).toHaveBeenCalledWith({
      challengeToken: 'challenge-jwt',
      code: '123456',
    })
    expect(step.emitted('signed-in')).toEqual([['session-jwt']])
  })

  it('accepts a recovery code as it is', async () => {
    const step = mountStep()

    await submitCode(step, 'abcde-fghij')

    expect(loginTotpApiMock).toHaveBeenCalledWith({
      challengeToken: 'challenge-jwt',
      code: 'abcde-fghij',
    })
  })

  it('does not call the server for an empty code', async () => {
    const step = mountStep()

    await submitCode(step, '   ')

    expect(loginTotpApiMock).not.toHaveBeenCalled()
    expect(step.find('.ff__error').text()).toBe('login.mfa.codeRequired')
  })

  it('links a wrong code to the field, clears it and puts the focus back', async () => {
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_invalid' })
    const step = mountStep()

    await submitCode(step, '000000')

    const input = step.find('input[name="code"]')
    const error = step.find('.ff__error')
    expect(error.text()).toBe('errors.totp_invalid')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'))
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(input.element)
    expect(step.emitted('signed-in')).toBeUndefined()
    expect(step.find('[aria-live="polite"]').find('.ff__error').exists()).toBe(true)
  })

  it('shows the lock-out delay from Retry-After in an alert', async () => {
    loginTotpApiMock.mockResolvedValue({
      ok: false,
      reason: 'too_many_attempts',
      retryAfterSeconds: 900,
    })
    const step = mountStep()

    await submitCode(step, '123456')

    expect(step.find('[role="alert"]').text()).toBe('login.mfa.retryIn:{"minutes":15}')
    expect(step.emitted('back')).toBeUndefined()
  })

  it('falls back to the generic lock-out text when the server gives no delay', async () => {
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'too_many_attempts' })
    const step = mountStep()

    await submitCode(step, '123456')

    expect(step.find('[role="alert"]').text()).toBe('errors.too_many_attempts')
  })

  it.each([
    ['totp_unavailable', 'errors.totp_unavailable'],
    ['forbidden', 'login.mfa.forbidden'],
    ['api_unreachable', 'login.mfa.unreachable'],
    ['server_error', 'errors.server_error'],
  ])('shows our own text for %s, not a field error', async (reason, key) => {
    loginTotpApiMock.mockResolvedValue({ ok: false, reason })
    const step = mountStep()

    await submitCode(step, '123456')

    expect(step.find('[role="alert"]').text()).toBe(key)
    expect(step.find('.ff__error').exists()).toBe(false)
    expect(step.find('input[name="code"]').attributes('aria-invalid')).toBe('false')
  })

  it('goes back to the first step with a message when the challenge has expired', async () => {
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'mfa_challenge_invalid' })
    const step = mountStep()

    await submitCode(step, '123456')

    expect(step.emitted('back')).toEqual([[{ key: 'errors.mfa_challenge_invalid', params: {} }]])
  })

  it('moves to the enrollment when the account has no application yet', async () => {
    loginTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_not_enrolled' })
    const step = mountStep()

    await submitCode(step, '123456')

    expect(step.emitted('enroll')).toHaveLength(1)
  })

  it('goes back without a message when the user asks for it', async () => {
    const step = mountStep()

    await step.find('button.secondary').trigger('click')

    expect(step.emitted('back')).toEqual([[null]])
  })

  it('has a single primary button', () => {
    const step = mountStep()

    expect(step.findAll('[data-test="ui-button"][data-variant="primary"]')).toHaveLength(1)
  })
})
