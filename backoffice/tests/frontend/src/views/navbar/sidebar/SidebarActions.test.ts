import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import SidebarActions from '@/views/navbar/sidebar/SidebarActions.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/sidebar/SidebarActions.vue', () => {
  it('renders mobile language and account actions', () => {
    const wrapper = mountWithFrontendMocks(SidebarActions)

    const groups = wrapper.findAll('[data-test="nav-group"]')
    const languageSwitcher = wrapper.find('[data-test="language-switcher"]')
    const authButton = wrapper.find('[data-test="auth-button"]')

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.attributes('data-label'))).toEqual([
      'navbar.language',
      'navbar.account',
    ])

    expect(languageSwitcher.attributes('data-variant')).toBe('mobile')
    expect(languageSwitcher.attributes('data-show-label')).toBe('false')

    expect(authButton.attributes('data-variant')).toBe('sidebar')
  })
})
