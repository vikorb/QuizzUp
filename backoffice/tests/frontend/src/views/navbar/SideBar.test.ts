import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
  setUnauthenticated,
} from '@frontend-tests/_helpers/authStateMock'
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
    expect(
      wrapper.findAll('[data-test="nav-group"]').map((group) => group.attributes('data-label'))
    ).toEqual(['navbar.language', 'navbar.account'])
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
        { to: '/players', labelKey: 'players.menu' },
        { to: '/themes', labelKey: 'navbar.themes' },
        { to: '/questions', labelKey: 'navbar.questionsAnswers' },
        { to: '/games', labelKey: 'navbar.games' },
        { to: '/stats', labelKey: 'stats.menu' },
      ])
    )
    expect(items).not.toEqual(
      expect.arrayContaining([{ to: '/clients', labelKey: 'navbar.clients' }])
    )
  })

  it('hides the statistics entry from the staff, who are not allowed to read them', () => {
    setAuthenticatedUser({ companyId: 42 })

    const items = getNavItems(mountWithFrontendMocks(SideBar))

    expect(items).toEqual(expect.arrayContaining([{ to: '/games', labelKey: 'navbar.games' }]))
    expect(items.map((item) => item.to)).not.toContain('/stats')
  })

  it('shows the statistics entry to superadmins', () => {
    setAuthenticatedSuperadmin()

    expect(getNavItems(mountWithFrontendMocks(SideBar))).toEqual(
      expect.arrayContaining([{ to: '/stats', labelKey: 'stats.menu' }])
    )
  })

  it('renders clients navigation for superadmins', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar)
    const items = getNavItems(wrapper)

    expect(items).toEqual(
      expect.arrayContaining([
        { to: '/clients', labelKey: 'navbar.clients' },
        { to: '/players', labelKey: 'players.menu' },
        { to: '/themes', labelKey: 'navbar.themes' },
        { to: '/questions', labelKey: 'navbar.questionsAnswers' },
      ])
    )
    expect(items).not.toEqual(
      expect.arrayContaining([{ to: '/clients/1', labelKey: 'navbar.myCompany' }])
    )
  })

  it('shows a collapse toggle (desktop) that emits toggle-collapsed', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar)
    const toggle = wrapper.find('.sidebar__collapse')

    expect(toggle.exists()).toBe(true)

    await toggle.trigger('click')

    expect(wrapper.emitted('toggle-collapsed')).toHaveLength(1)
  })

  it('hides the collapse toggle inside the mobile drawer', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar, { props: { showActions: true } })

    expect(wrapper.find('.sidebar__collapse').exists()).toBe(false)
  })

  it('applies the rail modifier when collapsed', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar, { props: { collapsed: true } })

    expect(wrapper.find('.sidebar').classes()).toContain('sidebar--rail')
  })

  it('shows the brand and account actions on desktop', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar)

    expect(wrapper.find('.sidebar__brand').exists()).toBe(true)
    expect(wrapper.find('.sidebar__actions').exists()).toBe(true)
  })

  it('hides the brand inside the mobile drawer (drawer has its own header)', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar, { props: { showActions: true } })

    expect(wrapper.find('.sidebar__brand').exists()).toBe(false)
    expect(wrapper.find('.sidebar__actions').exists()).toBe(true)
  })

  it('hides the account actions in rail mode', () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountWithFrontendMocks(SideBar, { props: { collapsed: true } })

    expect(wrapper.find('.sidebar__actions').exists()).toBe(false)
  })
})
