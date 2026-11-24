import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { describe, expect, it } from 'vitest'

import FormField from '@/components/ui/form/FormField.vue'

function mountField(props: Record<string, unknown>) {
  return mountWithFrontendMocks(FormField, {
    props: { modelValue: '', id: 'field', ...props },
    global: { stubs: { formField: false } },
  })
}

describe('components/ui/form/FormField.vue', () => {
  it('describes the input by its own error, then by its hint', () => {
    expect(mountField({ hint: 'Aide' }).get('input').attributes('aria-describedby')).toBe(
      'field_hint'
    )

    const wrapper = mountField({ hint: 'Aide', error: 'Erreur' })

    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('field_error')
    expect(wrapper.findAll('.ff__error')).toHaveLength(1)
  })

  it('can be invalid for the error of a neighbour field, without writing it again', () => {
    const wrapper = mountField({ invalid: true, describedBy: 'other_error', hint: 'Aide' })

    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('other_error')
    expect(wrapper.find('.ff__error').exists()).toBe(false)
    expect(wrapper.get('.ff__control').classes()).toContain('ff__control--error')
  })

  it('is valid by default', () => {
    expect(mountField({}).get('input').attributes('aria-invalid')).toBe('false')
  })
})
