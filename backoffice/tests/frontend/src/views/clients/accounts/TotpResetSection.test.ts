import { resetTotpApiMock } from '@frontend-tests/_helpers/authApiMock'
import { logoutMock } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { replaceMock } from '@frontend-tests/_helpers/routerMock'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import TotpResetSection from '@/views/clients/accounts/TotpResetSection.vue'

resetFrontendMocksBeforeEach()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountSection() {
  wrapper = mountWithFrontendMocks(TotpResetSection, {
    attachTo: document.body,
    global: { mocks: { $t: tWithParamsMock }, stubs: { formField: false } },
  })

  return wrapper
}

async function openForm(section: VueWrapper) {
  await section.find('button.reset__button').trigger('click')
  await flushPromises()
}

async function submitCode(section: VueWrapper, code: string) {
  await section.find('input[name="code"]').setValue(code)
  await section.find('form').trigger('submit')
  await flushPromises()
}

describe('views/clients/accounts/TotpResetSection.vue', () => {
  it('asks nothing until the user opens the reset', () => {
    const section = mountSection()

    expect(section.find('form').exists()).toBe(false)
    expect(section.text()).toContain('login.mfa.reset.hint')
    expect(resetTotpApiMock).not.toHaveBeenCalled()
  })

  it('opens a labelled code field and focuses it', async () => {
    const section = mountSection()

    await openForm(section)

    const input = section.find('input[name="code"]')
    expect(input.attributes('autocomplete')).toBe('one-time-code')
    // Code à 6 chiffres ou code de secours « xxxxx-xxxxx » : pas de clavier numérique.
    expect(input.attributes('inputmode')).toBeUndefined()
    expect(input.attributes('autocapitalize')).toBe('none')
    expect(input.attributes('spellcheck')).toBe('false')
    expect(document.activeElement).toBe(input.element)
  })

  it('cancels without calling the server', async () => {
    const section = mountSection()

    await openForm(section)
    await section.findAll('button.reset__button').at(-1)?.trigger('click')

    expect(section.find('form').exists()).toBe(false)
    expect(resetTotpApiMock).not.toHaveBeenCalled()
  })

  it('does not call the server for an empty code', async () => {
    const section = mountSection()

    await openForm(section)
    await submitCode(section, '  ')

    expect(resetTotpApiMock).not.toHaveBeenCalled()
    expect(section.find('.ff__error').text()).toBe('login.mfa.codeRequired')
  })

  it('signs out and goes to the login screen once the second factor is removed', async () => {
    const section = mountSection()

    await openForm(section)
    await submitCode(section, ' 123456 ')

    expect(resetTotpApiMock).toHaveBeenCalledWith({ code: '123456' })
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'login' })
  })

  it('links a wrong code to the field and stays signed in', async () => {
    resetTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_invalid' })
    const section = mountSection()

    await openForm(section)
    await submitCode(section, '000000')

    const input = section.find('input[name="code"]')
    expect(section.find('.ff__error').text()).toBe('errors.totp_invalid')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(section.find('.ff__error').attributes('id'))
    expect(logoutMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('signs out like any ended session, with no wrong-code message, when the token is refused', async () => {
    resetTotpApiMock.mockResolvedValue({ ok: false, reason: 'session_ended' })
    const section = mountSection()

    await openForm(section)
    await submitCode(section, '123456')

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'login' })
    expect(section.text()).not.toContain('errors.totp_invalid')
  })

  it('shows the lock-out delay in an alert and stays signed in', async () => {
    resetTotpApiMock.mockResolvedValue({
      ok: false,
      reason: 'too_many_attempts',
      retryAfterSeconds: 900,
    })
    const section = mountSection()

    await openForm(section)
    await submitCode(section, '123456')

    expect(section.find('[role="alert"]').text()).toBe('login.mfa.retryIn:{"minutes":15}')
    expect(logoutMock).not.toHaveBeenCalled()
  })

  it('shows our own text when there is nothing to remove', async () => {
    resetTotpApiMock.mockResolvedValue({ ok: false, reason: 'totp_not_enrolled' })
    const section = mountSection()

    await openForm(section)
    await submitCode(section, '123456')

    expect(section.find('[role="alert"]').text()).toBe('errors.totp_not_enrolled')
  })
})
