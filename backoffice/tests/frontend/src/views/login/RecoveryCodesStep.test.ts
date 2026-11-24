import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import RecoveryCodesStep from '@/views/login/RecoveryCodesStep.vue'

resetFrontendMocksBeforeEach()

const CODES = ['aaaaa-bbbbb', 'ccccc-ddddd', 'eeeee-fffff']

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountStep() {
  wrapper = mountWithFrontendMocks(RecoveryCodesStep, {
    props: { codes: CODES },
    attachTo: document.body,
    global: { mocks: { $t: tWithParamsMock } },
  })

  return wrapper
}

describe('views/login/RecoveryCodesStep.vue', () => {
  it('lists every code once, as copyable text, and says how many there are', () => {
    const step = mountStep()

    expect(step.findAll('.codes code').map((code) => code.text())).toEqual(CODES)
    expect(step.text()).toContain('login.mfa.recovery.hint:{"count":3}')
  })

  it('moves the focus to the heading on arrival', () => {
    const step = mountStep()

    expect(document.activeElement).toBe(step.find('h2').element)
  })

  it('keeps the continue button disabled until the box is ticked', async () => {
    const step = mountStep()
    const button = step.find('button[type="submit"]')

    expect(button.attributes('disabled')).toBeDefined()

    await step.find('input[type="checkbox"]').setValue(true)

    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('does not continue when the form is submitted with the box unticked', async () => {
    const step = mountStep()

    await step.find('form').trigger('submit')

    expect(step.emitted('continue')).toBeUndefined()
  })

  it('continues once the box is ticked', async () => {
    const step = mountStep()

    await step.find('input[type="checkbox"]').setValue(true)
    await step.find('form').trigger('submit')

    expect(step.emitted('continue')).toHaveLength(1)
  })

  it('labels the checkbox with a real text', () => {
    const step = mountStep()

    expect(step.find('label.noted').text()).toBe('login.mfa.recovery.noted')
  })
})
