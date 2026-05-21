import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import LoginView from '@/views/LoginView.vue'

resetFrontendMocksBeforeEach()

describe('views/LoginView.vue', () => {
  it('renders the login page shell with the translated header', () => {
    const wrapper = mountWithFrontendMocks(LoginView, {
      global: {
        stubs: {
          loginForm: {
            name: 'LoginForm',
            template: '<form data-test="login-form-stub" />',
          },
        },
      },
    })

    expect(wrapper.find('main.login').exists()).toBe(true)
    expect(wrapper.find('.login__bg').attributes('aria-hidden')).toBe('true')

    expect(wrapper.find('[data-test="section-card"]').attributes('data-max-width')).toBe('480')
    expect(wrapper.find('[data-test="section-header-title"]').text()).toBe('auth.login.title')
    expect(wrapper.find('[data-test="section-header-subtitle"]').text()).toBe('auth.login.subtitle')
    expect(wrapper.find('[data-test="login-form-stub"]').exists()).toBe(true)
  })

  it('renders the logo as decorative brand content in the header mark', () => {
    const wrapper = mountWithFrontendMocks(LoginView, {
      global: {
        stubs: {
          loginForm: {
            name: 'LoginForm',
            template: '<form data-test="login-form-stub" />',
          },
        },
      },
    })

    const logo = wrapper.find('.logo-img')

    expect(wrapper.find('[data-test="section-header-mark"]').exists()).toBe(true)
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('alt')).toBe('Logo')
  })
})
