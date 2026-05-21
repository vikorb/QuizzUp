import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import Brand from '@/views/navbar/topbar/Brand.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/topbar/Brand.vue', () => {
  it('renders a home link with the app identity', () => {
    const wrapper = mountWithFrontendMocks(Brand)

    const link = wrapper.find('[data-test="router-link"]')
    const logo = wrapper.find('img')

    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/')
    expect(link.classes()).toContain('brand')
    expect(link.attributes('aria-label')).toBe('Home')

    expect(logo.exists()).toBe(true)
    expect(logo.attributes('alt')).toBe('Logo')

    expect(wrapper.text()).toContain('navbar.appTitle')
    expect(wrapper.text()).toContain('navbar.subtitle')
  })
})
