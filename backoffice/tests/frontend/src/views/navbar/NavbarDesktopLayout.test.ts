import '@frontend-tests/_helpers/registerFrontendMocks'

import { setAuthenticatedAdmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { setViewportWidth } from '@frontend-tests/_helpers/dom'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import NavbarDesktopLayout from '@/views/navbar/NavbarDesktopLayout.vue'

resetFrontendMocksBeforeEach()

const railCapturingSideBar = {
  name: 'SideBar',
  props: ['collapsed'],
  template: '<nav data-test="side-bar-stub" :data-collapsed="String(collapsed)" />',
}

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

  it('collapses the sidebar to a rail on tablet-portrait widths', async () => {
    setAuthenticatedAdmin()
    await setViewportWidth(900)

    const wrapper = mountWithFrontendMocks(NavbarDesktopLayout, {
      global: { stubs: { sideBar: railCapturingSideBar } },
    })
    await nextTick()

    expect(wrapper.find('[data-test="side-bar-stub"]').attributes('data-collapsed')).toBe('true')
  })

  it('keeps the sidebar expanded on wide desktop widths', async () => {
    setAuthenticatedAdmin()
    await setViewportWidth(1300)

    const wrapper = mountWithFrontendMocks(NavbarDesktopLayout, {
      global: { stubs: { sideBar: railCapturingSideBar } },
    })
    await nextTick()

    expect(wrapper.find('[data-test="side-bar-stub"]').attributes('data-collapsed')).toBe('false')
  })
})
