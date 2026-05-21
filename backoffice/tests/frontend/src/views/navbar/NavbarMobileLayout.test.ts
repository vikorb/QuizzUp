import { setAuthenticatedAdmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { removeAfterEachMock, triggerRouterAfterEach } from '@frontend-tests/_helpers/routerMock'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import NavbarMobileLayout from '@/views/navbar/NavbarMobileLayout.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/NavbarMobileLayout.vue', () => {
  it('renders a burger-enabled frame and a closed drawer by default', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(NavbarMobileLayout, {
      props: {
        sidebarOpen: false,
      },
      global: {
        stubs: {
          sideBar: {
            name: 'SideBar',
            template: '<nav data-test="side-bar-stub" />',
          },
        },
      },
    })

    expect(wrapper.find('[data-test="navbar-frame"]').attributes('data-with-sidebar')).toBe('false')
    expect(wrapper.find('[data-test="navbar-frame"]').attributes('data-show-burger')).toBe('true')
    expect(wrapper.find('.drawer').classes()).not.toContain('drawer--open')
  })

  it('opens the drawer when the navbar frame emits toggle-sidebar', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(NavbarMobileLayout, {
      props: {
        sidebarOpen: false,
      },
    })

    await wrapper.find('[data-test="frame-burger"]').trigger('click')

    expect(wrapper.emitted('update:sidebarOpen')).toEqual([[true]])
  })

  it('closes the drawer from backdrop, close button and escape key', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(NavbarMobileLayout, {
      props: {
        sidebarOpen: true,
      },
    })

    await wrapper.find('.drawer__backdrop').trigger('click')
    await wrapper.find('.drawer').trigger('keydown', { key: 'Escape' })
    await wrapper.find('.drawer__head [data-test="ui-button"]').trigger('click')

    expect(wrapper.emitted('update:sidebarOpen')).toEqual([[false], [false], [false]])
  })

  it('closes the drawer after route changes', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(NavbarMobileLayout, {
      props: {
        sidebarOpen: true,
      },
    })

    await triggerRouterAfterEach()
    await nextTick()

    expect(wrapper.emitted('update:sidebarOpen')).toEqual([[false]])
  })

  it('closes immediately for anonymous users and unregisters router hook on unmount', () => {
    setUnauthenticated()

    const wrapper = mountWithFrontendMocks(NavbarMobileLayout, {
      props: {
        sidebarOpen: true,
      },
    })

    expect(wrapper.emitted('update:sidebarOpen')).toEqual([[false]])

    wrapper.unmount()

    expect(removeAfterEachMock).toHaveBeenCalledTimes(1)
  })
})
