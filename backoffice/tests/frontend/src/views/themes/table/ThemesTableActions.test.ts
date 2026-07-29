import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { deleteThemeServiceMock } from '@frontend-tests/_helpers/themesServiceMock'
import {
  ADMIN_ROLE_ADMIN,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { Theme } from '@/types/theme'
import ThemesTableActions from '@/views/themes/table/ThemesTableActions.vue'

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

function actionButtons(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.findAll('[data-test="ui-button"]')
}

describe('views/themes/table/ThemesTableActions.vue', () => {
  it('turns the open action read-only and disables delete/switch on a non-editable theme', () => {
    const wrapper = mountWithFrontendMocks(ThemesTableActions, {
      props: {
        item: makeTheme({ scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    const [openButton, deleteButton] = actionButtons(wrapper)

    expect(openButton.attributes('title')).toBe('themes.actions.readonly')
    expect(deleteButton.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()
  })

  it('keeps edit/delete/switch enabled on an editable company theme', () => {
    const wrapper = mountWithFrontendMocks(ThemesTableActions, {
      props: {
        item: makeTheme(),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    const [openButton, deleteButton] = actionButtons(wrapper)

    expect(openButton.attributes('title')).toBe('themes.actions.edit')
    expect(deleteButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeUndefined()
  })

  it('uses distinct icons for editable and read-only themes', () => {
    const editable = mountWithFrontendMocks(ThemesTableActions, {
      props: { item: makeTheme(), currentRole: ADMIN_ROLE_ADMIN },
    })
    const readonly = mountWithFrontendMocks(ThemesTableActions, {
      props: {
        item: makeTheme({ scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    const editableIcon = actionButtons(editable)[0]
      .find('[data-test="md-icon"]')
      .attributes('data-path')
    const readonlyIcon = actionButtons(readonly)[0]
      .find('[data-test="md-icon"]')
      .attributes('data-path')

    expect(editableIcon).not.toBe(readonlyIcon)
  })

  it('emits open when the open button is clicked', async () => {
    const wrapper = mountWithFrontendMocks(ThemesTableActions, {
      props: { item: makeTheme({ id: 42 }), currentRole: ADMIN_ROLE_ADMIN },
    })

    await actionButtons(wrapper)[0].trigger('click')

    expect(wrapper.emitted('open')).toEqual([[42]])
  })

  it('confirms and soft-deletes an editable theme', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const wrapper = mountWithFrontendMocks(ThemesTableActions, {
      props: { item: makeTheme({ id: 7 }), currentRole: ADMIN_ROLE_ADMIN },
    })

    await actionButtons(wrapper)[1].trigger('click')
    await flushPromises()
    await nextTick()

    expect(deleteThemeServiceMock).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('deleted')).toEqual([[7]])
  })

  it('does not delete when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mountWithFrontendMocks(ThemesTableActions, {
      props: { item: makeTheme({ id: 7 }), currentRole: ADMIN_ROLE_ADMIN },
    })

    await actionButtons(wrapper)[1].trigger('click')
    await flushPromises()

    expect(deleteThemeServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })
})
