import { setAuthenticatedAdmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import TopActions from '@/views/navbar/topbar/TopActions.vue'

resetFrontendMocksBeforeEach()

describe('views/navbar/topbar/TopActions.vue', () => {
  it('renders language and auth actions for anonymous users', () => {
    setUnauthenticated()

    const wrapper = mountWithFrontendMocks(TopActions)

    const languageSwitcher = wrapper.find('[data-test="language-switcher"]')
    const authButton = wrapper.find('[data-test="auth-button"]')

    expect(languageSwitcher.exists()).toBe(true)
    expect(languageSwitcher.attributes('data-variant')).toBe('desktop')

    expect(authButton.exists()).toBe(true)
    expect(authButton.attributes('data-variant')).toBe('topbar')
    expect(authButton.attributes('data-login-key')).toBe('home.login')
    expect(authButton.attributes('data-logout-key')).toBe('home.logout')

    expect(wrapper.text()).not.toContain('home.profile')
  })

  it('shows a profile link only when the user is authenticated', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(TopActions)

    const profileLink = wrapper
      .findAll('[data-test="router-link"]')
      .find((link) => link.text() === 'home.profile')

    expect(profileLink?.exists()).toBe(true)
    expect(profileLink?.attributes('href')).toBe('profile')
    expect(profileLink?.classes()).toContain('profile-link')
  })
})
