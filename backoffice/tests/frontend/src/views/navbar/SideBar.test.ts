import { setAuthenticatedAdmin, setAuthenticatedSuperadmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import SideBar from '@/views/navbar/SideBar.vue'

resetFrontendMocksBeforeEach()

function getNavItems(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.findAll('[data-test="nav-item"]').map((item) => ({
    to: item.attributes('data-to'),
    labelKey: item.attributes('data-label-key'),
  }))
}

describe('views/navbar/SideBar.vue', () => {
  it('hides navigation groups when the user is not authenticated', () => {
    setUnauthenticated()

    const wrapper = mountWithFrontendMocks(SideBar)

    expect(wrapper.find('.sidebar').classes()).toContain('sidebar--actions-only')
    expect(wrapper.find('.sidebar__main').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="nav-group"]')).toHaveLength(0)
  })

  it('renders account actions in mobile mode even when navigation is hidden', () => {
    setUnauthenticated()

    const wrapper = mountWithFrontendMocks(SideBar, {
      props: {
        showActions: true,
      },
    })

    expect(wrapper.find('.sidebar__actions').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="nav-group"]').map((group) => group.attributes('data-label'))).toEqual([
      'navbar.language',
      'navbar.account',
    ])
  })

  it('renders company scoped navigation for company admins', () => {
    setAuthenticatedAdmin({
      companyId: 42,
    })

    const wrapper = mountWithFrontendMocks(SideBar)
    const items = getNavItems(wrapper)

    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--actions-only')
    expect(items).toEqual(
      expect.arrayContaining([
        { to: '/', labelKey: 'navbar.home' },
        { to: '/clients/42', labelKey: 'navbar.myCompany' },
        { to: '/players', labelKey: 'navbar.players' },
        { to: '/themes', labelKey: 'navbar.themes' },
        { to: '/questions', labelKey: 'navbar.questionsAnswers' },
        { to: '/games', labelKey: 'navbar.games' },
        { to: '/stats', labelKey: 'navbar.statistics' },
      ]),
    )
    expect(items).not.toEqual(
      expect.arrayContaining([{ to: '/clients', labelKey: 'navbar.clients' }]),
    )
  })

  it('renders clients navigation for superadmins', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar)
    const items = getNavItems(wrapper)

    expect(items).toEqual(
      expect.arrayContaining([
        { to: '/clients', labelKey: 'navbar.clients' },
        { to: '/players', labelKey: 'navbar.players' },
        { to: '/themes', labelKey: 'navbar.themes' },
        { to: '/questions', labelKey: 'navbar.questionsAnswers' },
      ]),
    )
    expect(items).not.toEqual(
      expect.arrayContaining([{ to: '/clients/1', labelKey: 'navbar.myCompany' }]),
    )
  })
})
