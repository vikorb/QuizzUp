import {
  confirmTotpEnrollApiMock,
  startTotpEnrollApiMock,
  TOTP_ENROLL_START_OK,
} from '@frontend-tests/_helpers/authApiMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { getQrSvgSrc } from '@/utils/qr'
import TotpEnrollStep from '@/views/login/TotpEnrollStep.vue'

resetFrontendMocksBeforeEach()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountStep() {
  wrapper = mountWithFrontendMocks(TotpEnrollStep, {
    props: { challengeToken: 'challenge-jwt' },
    attachTo: document.body,
    global: { mocks: { $t: tWithParamsMock }, stubs: { formField: false } },
  })
  await flushPromises()

  return wrapper
}

async function submitCode(step: VueWrapper, code: string) {
  await step.find('input[name="code"]').setValue(code)
  await step.find('form').trigger('submit')
  await flushPromises()
}

describe('views/login/TotpEnrollStep.vue', () => {
  it('starts the enrollment with the challenge token and shows the grouped, copyable secret', async () => {
    const step = await mountStep()

    expect(startTotpEnrollApiMock).toHaveBeenCalledWith({ challengeToken: 'challenge-jwt' })
    expect(step.find('.secret').text()).toBe('JBSW Y3DP EHPK 3PXP')
    expect(step.find('.secret').element.tagName).toBe('CODE')
    // Le libellé et le secret sont reliés par la structure (dt / dd), pas par un aria-labelledby.
    expect(step.find('dt').text()).toBe('login.mfa.enroll.secretLabel')
    expect(step.find('dd .secret').exists()).toBe(true)
    expect(step.find('.secret').attributes('aria-labelledby')).toBeUndefined()
  })

  it('offers the otpauth link when the server gives one', async () => {
    const step = await mountStep()

    expect(step.find('a.link').attributes('href')).toBe(
      'otpauth://totp/QuizzUp:root?secret=JBSWY3DPEHPK3PXP&issuer=QuizzUp'
    )
  })

  it('shows the QR code from the server as an image, first, with an alternative text', async () => {
    const step = await mountStep()
    const qr = step.find('img.qr')

    expect(qr.attributes('src')).toBe(getQrSvgSrc(TOTP_ENROLL_START_OK.qrSvg))
    expect(qr.attributes('alt')).toBe('login.mfa.enroll.qrAlt')
    // Jamais injecté dans la page : ni `v-html`, ni `<svg>` en ligne.
    expect(step.find('svg').exists()).toBe(false)
    // Le QR code passe avant la clé en texte.
    expect(qr.element.compareDocumentPosition(step.find('.secret').element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('keeps the secret in a details element that is folded by default', async () => {
    const step = await mountStep()
    const manual = step.find('details.manual')

    expect(manual.attributes('open')).toBeUndefined()
    expect(manual.find('summary').text()).toBe('login.mfa.enroll.manual')
    expect(manual.find('.secret').text()).toBe('JBSW Y3DP EHPK 3PXP')
    expect(step.find('details .secret').exists()).toBe(true)
  })

  it('never follows a link that is not an otpauth address', async () => {
    startTotpEnrollApiMock.mockResolvedValue({
      ...TOTP_ENROLL_START_OK,
      otpauthUrl: 'javascript:alert(1)',
    })
    const step = await mountStep()

    expect(step.find('a.link').exists()).toBe(false)
    expect(step.find('.secret').exists()).toBe(true)
  })

  it('shows a loading state while the secret is being generated', async () => {
    let release: (() => void) | undefined
    startTotpEnrollApiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ...TOTP_ENROLL_START_OK, otpauthUrl: 'otpauth://totp/x' })
        })
    )
    wrapper = mountWithFrontendMocks(TotpEnrollStep, {
      props: { challengeToken: 'challenge-jwt' },
      global: { mocks: { $t: tWithParamsMock } },
    })
    await flushPromises()

    expect(wrapper.find('[role="status"]').text()).toBe('login.mfa.enroll.loading')
    expect(wrapper.find('.secret').exists()).toBe(false)

    release?.()
    await flushPromises()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('.secret').exists()).toBe(true)
  })

  it('focuses the code field once the secret is shown', async () => {
    const step = await mountStep()

    expect(document.activeElement).toBe(step.find('input[name="code"]').element)
  })

  it('shows an error and a restart button when the secret cannot be generated', async () => {
    startTotpEnrollApiMock.mockResolvedValueOnce({ ok: false, reason: 'totp_unavailable' })
    const step = await mountStep()

    expect(step.find('[role="alert"]').text()).toBe('errors.totp_unavailable')
    expect(step.find('.secret').exists()).toBe(false)

    await step.find('button.secondary').trigger('click')
    await flushPromises()

    expect(startTotpEnrollApiMock).toHaveBeenCalledTimes(2)
    expect(step.find('.secret').exists()).toBe(true)
    expect(step.find('[role="alert"]').exists()).toBe(false)
  })

  it.each(['mfa_challenge_invalid', 'totp_already_enrolled'])(
    'goes back with a message when the start answers %s',
    async (reason) => {
      startTotpEnrollApiMock.mockResolvedValueOnce({ ok: false, reason })
      const step = await mountStep()

      expect(step.emitted('back')).toEqual([[{ key: `errors.${reason}`, params: {} }]])
    }
  )

  it('refuses a code that is not made of the expected digits without calling the server', async () => {
    const step = await mountStep()

    await submitCode(step, '12345')

    expect(confirmTotpEnrollApiMock).not.toHaveBeenCalled()
    const input = step.find('input[name="code"]')
    expect(step.find('.ff__error').text()).toBe('login.mfa.invalidCode:{"length":6}')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(step.find('.ff__error').attributes('id'))

    await submitCode(step, 'abcdef')

    expect(confirmTotpEnrollApiMock).not.toHaveBeenCalled()
  })

  it('keeps the numeric keyboard: only 6 digits are accepted here', async () => {
    const step = await mountStep()

    expect(step.find('input[name="code"]').attributes('inputmode')).toBe('numeric')
  })

  it('shows the 6-digit text when the server rejects the form', async () => {
    confirmTotpEnrollApiMock.mockResolvedValue({ ok: false, reason: 'invalid_form' })
    const step = await mountStep()

    await submitCode(step, '123456')

    expect(step.find('.ff__error').text()).toBe('login.mfa.invalidCode:{"length":6}')
  })

  it('confirms with the digits (spaces removed) and hands over the session and the codes', async () => {
    const step = await mountStep()

    await submitCode(step, '123 456')

    expect(confirmTotpEnrollApiMock).toHaveBeenCalledWith({
      challengeToken: 'challenge-jwt',
      code: '123456',
    })
    expect(step.emitted('enrolled')).toEqual([
      [{ token: 'test-enroll-token', recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'] }],
    ])
  })

  it('links a wrong first code to the field and keeps the secret', async () => {
    confirmTotpEnrollApiMock.mockResolvedValue({ ok: false, reason: 'totp_invalid' })
    const step = await mountStep()

    await submitCode(step, '000000')

    expect(step.find('.ff__error').text()).toBe('errors.totp_invalid')
    expect(step.find('.secret').text()).toBe('JBSW Y3DP EHPK 3PXP')
    expect(step.emitted('enrolled')).toBeUndefined()
  })

  it('shows the lock-out delay in an alert', async () => {
    confirmTotpEnrollApiMock.mockResolvedValue({
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: 30,
    })
    const step = await mountStep()

    await submitCode(step, '123456')

    expect(step.find('[role="alert"]').text()).toBe('login.mfa.retryIn:{"minutes":1}')
  })

  it.each(['totp_enrollment_changed', 'totp_not_enrolled'])(
    'proposes to restart the enrollment after a 409 %s, and a restart gives a new secret',
    async (reason) => {
      confirmTotpEnrollApiMock.mockResolvedValueOnce({ ok: false, reason })
      const step = await mountStep()

      await submitCode(step, '123456')

      expect(step.find('[role="alert"]').text()).toBe(
        reason === 'totp_enrollment_changed' ? 'login.mfa.enrollmentChanged' : `errors.${reason}`
      )
      const restart = step.find('button.secondary')
      expect(restart.text()).toBe('login.mfa.enroll.restart')

      startTotpEnrollApiMock.mockResolvedValueOnce({
        ok: true,
        secret: 'MFRGGZDFMZTWQ2LK',
        otpauthUrl: 'otpauth://totp/new',
        qrSvg: '<svg id="new"/>',
      })
      await restart.trigger('click')
      await flushPromises()

      expect(startTotpEnrollApiMock).toHaveBeenCalledTimes(2)
      expect(step.find('.secret').text()).toBe('MFRG GZDF MZTW Q2LK')
      expect(step.find('img.qr').attributes('src')).toBe(getQrSvgSrc('<svg id="new"/>'))
      expect(step.find('[role="alert"]').exists()).toBe(false)
      expect(step.emitted('back')).toBeUndefined()
    }
  )

  it.each(['mfa_challenge_invalid', 'totp_already_enrolled'])(
    'goes back with a message when the confirmation answers %s',
    async (reason) => {
      confirmTotpEnrollApiMock.mockResolvedValue({ ok: false, reason })
      const step = await mountStep()

      await submitCode(step, '123456')

      expect(step.emitted('back')).toEqual([[{ key: `errors.${reason}`, params: {} }]])
    }
  )

  it('goes back without a message when the user asks for it', async () => {
    const step = await mountStep()

    await step.findAll('button.secondary').at(-1)?.trigger('click')

    expect(step.emitted('back')).toEqual([[null]])
  })

  it('wipes the secret from the page when the step is left', async () => {
    const step = await mountStep()
    expect(document.body.textContent).toContain('JBSW Y3DP EHPK 3PXP')

    step.unmount()
    wrapper = null

    expect(document.body.textContent).not.toContain('JBSW')
  })

  it('has a single primary button', async () => {
    const step = await mountStep()

    expect(step.findAll('[data-test="ui-button"][data-variant="primary"]')).toHaveLength(1)
  })
})
