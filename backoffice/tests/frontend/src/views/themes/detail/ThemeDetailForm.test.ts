import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createThemeServiceMock,
  updateThemeServiceMock,
} from '@frontend-tests/_helpers/themesServiceMock'
import { THEME_MODE_CLASSIC, THEME_SCOPE_COMPANY, THEME_STATUS_ACTIVE } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import type { Theme } from '@/types/theme'
import ThemeDetailForm from '@/views/themes/detail/ThemeDetailForm.vue'

resetFrontendMocksBeforeEach()

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 3,
    adminId: 1,
    companyId: 1,
    scope: THEME_SCOPE_COMPANY,
    name: 'Company theme',
    mode: THEME_MODE_CLASSIC,
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  }
}

describe('views/themes/detail/ThemeDetailForm.vue', () => {
  it('creates a theme and emits the saved theme', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    await wrapper.find('input').setValue('Culture générale')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()

    expect(createThemeServiceMock).toHaveBeenCalledWith({
      name: 'Culture générale',
      mode: THEME_MODE_CLASSIC,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('updates an existing theme in edit mode', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: true },
    })

    await wrapper.find('input').setValue('Renommé')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()

    expect(updateThemeServiceMock).toHaveBeenCalledWith(3, {
      name: 'Renommé',
      mode: THEME_MODE_CLASSIC,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('renders a read-only form and hides the submit action when the theme is not editable', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: false },
    })

    // Bandeau lecture seule + champ désactivé + pas de bouton de soumission.
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('themes.form.readonly')
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="form-actions-submit"]').exists()).toBe(false)
  })

  it('does not submit a read-only theme', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: false },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateThemeServiceMock).not.toHaveBeenCalled()
  })

  it('exposes scope controls to superadmins only', () => {
    setAuthenticatedSuperadmin()
    const superadminForm = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    // mode + scope pour un superadmin.
    expect(superadminForm.findAll('select')).toHaveLength(2)

    setAuthenticatedAdmin()
    const adminForm = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    // Seul le mode est proposé à un admin.
    expect(adminForm.findAll('select')).toHaveLength(1)
  })
})
