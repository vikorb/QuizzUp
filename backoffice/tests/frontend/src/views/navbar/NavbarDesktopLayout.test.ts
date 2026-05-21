import '@frontend-tests/_helpers/registerFrontendMocks'

import { setAuthenticatedAdmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import NavbarDesktopLayout from '@/views/navbar/NavbarDesktopLayout.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/NavbarDesktopLayout.vue', () => {
  it('does not expose the sidebar when the user is anonymous', () => {
    setUnauthenticated()

    const wrapper = mountWithFrontendMocks(NavbarDesktopLayout)

    expect(wrapper.find('[data-test="navbar-frame"]').attributes('data-with-sidebar')).toBe('false')
    expect(wrapper.find('[data-test="frame-sidebar"]').exists()).toBe(false)
  })

  it('exposes the sidebar slot when the user is authenticated', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(NavbarDesktopLayout, {
      global: {
        stubs: {
          sideBar: {
            name: 'SideBar',
            template: '<nav data-test="side-bar-stub" />',
          },
        },
      },
    })

    expect(wrapper.find('[data-test="navbar-frame"]').attributes('data-with-sidebar')).toBe('true')
    expect(wrapper.find('[data-test="frame-sidebar"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="side-bar-stub"]').exists()).toBe(true)
  })
})
