import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { THEME_MODE_IMAGE, THEME_STATUS_DELETED } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import ThemesToolbar from '@/views/themes/ThemesToolbar.vue'

resetFrontendMocksBeforeEach()

function statusOptionValues(
  wrapper: ReturnType<typeof mountWithFrontendMocks>
): (string | undefined)[] {
  const statusSelect = wrapper.findAll('select')[0]

  return statusSelect.findAll('option').map((option) => option.attributes('value'))
}

describe('views/themes/ThemesToolbar.vue', () => {
  it('hides the deleted-status option when the user is not a superadmin', () => {
    const wrapper = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: '',
        canShowDeletedStatus: false,
      },
    })

    expect(statusOptionValues(wrapper)).not.toContain(String(THEME_STATUS_DELETED))
  })

  it('exposes the deleted-status option to superadmins', () => {
    const wrapper = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: '',
        canShowDeletedStatus: true,
      },
    })

    expect(statusOptionValues(wrapper)).toContain(String(THEME_STATUS_DELETED))
  })

  it('emits search and filter updates', async () => {
    const wrapper = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: '',
      },
    })

    await wrapper.find('input').setValue('quiz')
    await wrapper.findAll('select')[1].setValue(THEME_MODE_IMAGE)

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['quiz'])
    expect(wrapper.emitted('update:modeFilter')?.at(-1)).toEqual([THEME_MODE_IMAGE])
  })

  it('resets every filter and disables reset when none is active', async () => {
    const active = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: 'quiz',
        statusFilter: '1',
        modeFilter: THEME_MODE_IMAGE,
        scopeFilter: 'global',
      },
    })

    expect(active.find('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeUndefined()

    await active.find('[data-test="base-toolbar-reset"]').trigger('click')

    expect(active.emitted('update:modelValue')).toEqual([['']])
    expect(active.emitted('update:statusFilter')).toEqual([['']])
    expect(active.emitted('update:modeFilter')).toEqual([['']])
    expect(active.emitted('update:scopeFilter')).toEqual([['']])

    const idle = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: '',
      },
    })

    expect(idle.find('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeDefined()
  })

  it('navigates to the theme creation page from the primary action', async () => {
    const wrapper = mountWithFrontendMocks(ThemesToolbar, {
      props: {
        modelValue: '',
      },
    })

    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'themes-create' })
  })
})
