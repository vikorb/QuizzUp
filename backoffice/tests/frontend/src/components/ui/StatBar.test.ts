import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { describe, expect, it } from 'vitest'

import StatBar, { type Stat } from '@/components/ui/StatBar.vue'

describe('components/ui/StatBar.vue', () => {
  it('renders each stat value and label', () => {
    const stats: Stat[] = [
      { label: 'Thèmes', value: 18 },
      { label: 'Actifs', value: 12, tone: 'ok', ratio: 66.7 },
    ]

    const wrapper = mountWithFrontendMocks(StatBar, { props: { stats } })

    expect(wrapper.findAll('.stat')).toHaveLength(2)
    expect(wrapper.text()).toContain('18')
    expect(wrapper.text()).toContain('Thèmes')
    expect(wrapper.text()).toContain('Actifs')
  })

  it('derives a rounded percentage hint from the ratio', () => {
    const stats: Stat[] = [{ label: 'Actifs', value: 12, tone: 'ok', ratio: 66.7 }]

    const wrapper = mountWithFrontendMocks(StatBar, { props: { stats } })

    expect(wrapper.find('.stat__hint').text()).toBe('67 %')
  })

  it('applies the tone modifier class', () => {
    const stats: Stat[] = [{ label: 'Brouillons', value: 4, tone: 'warn', ratio: 22 }]

    const wrapper = mountWithFrontendMocks(StatBar, { props: { stats } })

    expect(wrapper.find('.stat').classes()).toContain('stat--warn')
  })

  it('shows no hint for a plain stat without ratio or hint', () => {
    const stats: Stat[] = [{ label: 'Thèmes', value: 18 }]

    const wrapper = mountWithFrontendMocks(StatBar, { props: { stats } })

    expect(wrapper.find('.stat__hint').exists()).toBe(false)
  })

  it('uses an explicit hint when provided', () => {
    const stats: Stat[] = [{ label: 'Questions', value: 243, tone: 'accent', hint: 'liées' }]

    const wrapper = mountWithFrontendMocks(StatBar, { props: { stats } })

    expect(wrapper.find('.stat__hint').text()).toBe('liées')
  })
})
