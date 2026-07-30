import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { describe, expect, it, vi } from 'vitest'

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'

function buildFilters(onRemove = vi.fn()): ActiveFilter[] {
  return [
    { key: 'search', label: 'Recherche : escape' },
    { key: 'status', label: 'Actifs', onRemove },
  ]
}

describe('components/ui/BaseToolBar.vue', () => {
  it('shows active filters as chips when collapsed', () => {
    const wrapper = mountWithFrontendMocks(BaseToolBar, {
      props: { defaultCollapsed: true, activeFilters: buildFilters() },
    })

    expect(wrapper.findAll('.toolbar__chip')).toHaveLength(2)
    expect(wrapper.text()).toContain('Recherche : escape')
    expect(wrapper.text()).toContain('Actifs')
  })

  it('hides the chips and shows the filters slot when expanded', () => {
    const wrapper = mountWithFrontendMocks(BaseToolBar, {
      props: { defaultCollapsed: false, activeFilters: buildFilters() },
      slots: { default: '<div data-test="slot-filters">filters</div>' },
    })

    expect(wrapper.find('.toolbar__chip').exists()).toBe(false)
    expect(wrapper.find('[data-test="slot-filters"]').exists()).toBe(true)
  })

  it('renders no chips when collapsed without active filters', () => {
    const wrapper = mountWithFrontendMocks(BaseToolBar, {
      props: { defaultCollapsed: true, activeFilters: [] },
    })

    expect(wrapper.find('.toolbar__chip').exists()).toBe(false)
  })

  it('only renders a remove button for filters that expose onRemove', async () => {
    const onRemove = vi.fn()
    const wrapper = mountWithFrontendMocks(BaseToolBar, {
      props: { defaultCollapsed: true, activeFilters: buildFilters(onRemove) },
    })

    const removeButtons = wrapper.findAll('.toolbar__chip-remove')
    expect(removeButtons).toHaveLength(1)

    await removeButtons[0].trigger('click')
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('reveals the chips after collapsing through the toggle', async () => {
    const wrapper = mountWithFrontendMocks(BaseToolBar, {
      props: { defaultCollapsed: false, activeFilters: buildFilters() },
    })

    expect(wrapper.find('.toolbar__chip').exists()).toBe(false)

    await wrapper.find('.toolbar__toggle').trigger('click')

    expect(wrapper.findAll('.toolbar__chip')).toHaveLength(2)
  })
})
