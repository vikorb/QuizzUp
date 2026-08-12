import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { describe, expect, it } from 'vitest'

import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'

const options: SelectFieldOption[] = [
  { value: '', label: 'Tous' },
  { value: '1', label: 'Actif' },
  { value: '2', label: 'Inactif' },
]

describe('components/ui/form/SelectField.vue', () => {
  it('shows the label of the selected option', () => {
    const wrapper = mountWithFrontendMocks(SelectField, { props: { modelValue: '1', options } })

    expect(wrapper.find('.select-field__value').text()).toBe('Actif')
  })

  it('opens the listbox on click and lists the options', async () => {
    const wrapper = mountWithFrontendMocks(SelectField, { props: { modelValue: '', options } })

    expect(wrapper.find('.select-field__menu').exists()).toBe(false)

    await wrapper.find('.select-field__trigger').trigger('click')

    expect(wrapper.find('.select-field__menu').exists()).toBe(true)
    expect(wrapper.findAll('.select-field__option')).toHaveLength(3)
  })

  it('emits the chosen value and closes the menu', async () => {
    const wrapper = mountWithFrontendMocks(SelectField, { props: { modelValue: '', options } })

    await wrapper.find('.select-field__trigger').trigger('click')
    await wrapper.findAll('.select-field__option')[2].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2'])
    expect(wrapper.find('.select-field__menu').exists()).toBe(false)
  })

  it('ignores clicks on a disabled option', async () => {
    const withDisabled: SelectFieldOption[] = [
      { value: '', label: 'Tous' },
      { value: 'x', label: 'Indispo', disabled: true },
    ]
    const wrapper = mountWithFrontendMocks(SelectField, {
      props: { modelValue: '', options: withDisabled },
    })

    await wrapper.find('.select-field__trigger').trigger('click')
    await wrapper.findAll('.select-field__option')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('.select-field__menu').exists()).toBe(true)
  })

  it('opens with the keyboard and selects with Enter', async () => {
    const wrapper = mountWithFrontendMocks(SelectField, { props: { modelValue: '', options } })
    const trigger = wrapper.find('.select-field__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('.select-field__menu').exists()).toBe(true)

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['1'])
  })
})
