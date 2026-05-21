import '@frontend-tests/_helpers/registerFrontendMocks'

import { setAuthenticatedAdmin } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import TopBar from '@/views/navbar/TopBar.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/topbar/TopBar.vue', () => {
  it('renders brand and desktop top actions when burger is hidden', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(TopBar, {
      props: {
        showBurger: false,
      },
    })

    expect(wrapper.find('.brand').exists()).toBe(true)
    expect(wrapper.find('.top-actions').exists()).toBe(true)
    expect(wrapper.find('.burger').exists()).toBe(false)
  })

  it('renders an accessible burger and emits toggle-sidebar in mobile mode', async () => {
    const wrapper = mountWithFrontendMocks(TopBar, {
      props: {
        showBurger: true,
      },
    })

    const burger = wrapper.find('.burger')

    expect(burger.exists()).toBe(true)
    expect(burger.attributes('aria-label')).toBe('navbar.menu')
    expect(wrapper.find('.top-actions').exists()).toBe(false)

    await burger.trigger('click')

    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })
})
