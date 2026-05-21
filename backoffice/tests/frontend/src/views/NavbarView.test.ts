import { setViewportWidth } from '@frontend-tests/_helpers/dom'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import NavbarView from '@/views/NavbarView.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/NavbarView.vue', () => {
  it('renders the mobile layout at or below the mobile breakpoint', async () => {
    await setViewportWidth(980)

    const wrapper = mountWithFrontendMocks(NavbarView, {
      global: {
        stubs: {
          navbarDesktopLayout: {
            name: 'NavbarDesktopLayout',
            template: '<section data-test="desktop-layout" />',
          },
          navbarMobileLayout: {
            name: 'NavbarMobileLayout',
            props: ['sidebarOpen'],
            emits: ['update:sidebarOpen'],
            template: '<section data-test="mobile-layout" :data-open="String(sidebarOpen)" />',
          },
        },
      },
    })

    await nextTick()

    expect(wrapper.find('[data-test="mobile-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="desktop-layout"]').exists()).toBe(false)
  })

  it('reacts to resize events and switches back to desktop layout', async () => {
    await setViewportWidth(700)

    const wrapper = mountWithFrontendMocks(NavbarView, {
      global: {
        stubs: {
          navbarDesktopLayout: {
            name: 'NavbarDesktopLayout',
            template: '<section data-test="desktop-layout" />',
          },
          navbarMobileLayout: {
            name: 'NavbarMobileLayout',
            props: ['sidebarOpen'],
            emits: ['update:sidebarOpen'],
            template: `
              <section data-test="mobile-layout" :data-open="String(sidebarOpen)">
                <button data-test="open-mobile-sidebar" @click="$emit('update:sidebarOpen', true)" />
              </section>
            `,
          },
        },
      },
    })

    await nextTick()

    expect(wrapper.find('[data-test="mobile-layout"]').exists()).toBe(true)

    await wrapper.find('[data-test="open-mobile-sidebar"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="mobile-layout"]').attributes('data-open')).toBe('true')

    await setViewportWidth(1200)
    await nextTick()

    expect(wrapper.find('[data-test="desktop-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mobile-layout"]').exists()).toBe(false)
  })
})
