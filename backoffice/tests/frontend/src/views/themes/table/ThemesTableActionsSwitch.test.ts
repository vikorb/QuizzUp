import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { updateThemeStatusServiceMock } from '@frontend-tests/_helpers/themesServiceMock'
import {
  ADMIN_ROLE_ADMIN,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { Theme } from '@/types/theme'
import ThemesTableActionsSwitch from '@/views/themes/table/ThemesTableActionsSwitch.vue'

resetFrontendMocksBeforeEach()

afterEach(() => {
  vi.restoreAllMocks()
})

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 1,
    adminId: 1,
    companyId: 1,
    scope: THEME_SCOPE_COMPANY,
    name: 'Theme',
    mode: 'classic',
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  }
}

function switchButton(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.find('[data-test="switch-field"]')
}

describe('views/themes/table/ThemesTableActionsSwitch.vue', () => {
  it('disables the switch for an establishment admin on a global theme', () => {
    const wrapper = mountWithFrontendMocks(ThemesTableActionsSwitch, {
      props: {
        theme: makeTheme({ scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('disables the switch for a soft-deleted theme', () => {
    const wrapper = mountWithFrontendMocks(ThemesTableActionsSwitch, {
      props: {
        theme: makeTheme({ status: THEME_STATUS_DELETED }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('reflects an active company theme as checked and toggles it off', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const wrapper = mountWithFrontendMocks(ThemesTableActionsSwitch, {
      props: {
        theme: makeTheme({ id: 5, status: THEME_STATUS_ACTIVE }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('aria-checked')).toBe('true')

    await switchButton(wrapper).trigger('click')
    await flushPromises()
    await nextTick()

    expect(updateThemeStatusServiceMock).toHaveBeenCalledWith(5, THEME_STATUS_INACTIVE)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 5 })
  })

  it('keeps a draft theme interactive and activates it on toggle (draft not coerced to inactive)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const wrapper = mountWithFrontendMocks(ThemesTableActionsSwitch, {
      props: {
        theme: makeTheme({ id: 8, status: THEME_STATUS_DRAFT }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    // Un brouillon n'est pas actif, mais la bascule reste utilisable.
    expect(switchButton(wrapper).attributes('aria-checked')).toBe('false')
    expect(switchButton(wrapper).attributes('disabled')).toBeUndefined()

    await switchButton(wrapper).trigger('click')
    await flushPromises()
    await nextTick()

    expect(updateThemeStatusServiceMock).toHaveBeenCalledWith(8, THEME_STATUS_ACTIVE)
  })

  it('does not call the service when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mountWithFrontendMocks(ThemesTableActionsSwitch, {
      props: {
        theme: makeTheme({ id: 5 }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    await switchButton(wrapper).trigger('click')
    await flushPromises()

    expect(updateThemeStatusServiceMock).not.toHaveBeenCalled()
  })
})
