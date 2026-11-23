import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { describe, expect, it } from 'vitest'

import QuestionsToolbar from '@/views/questions/QuestionsToolbar.vue'

resetFrontendMocksBeforeEach()

function mountToolbar() {
  return mountWithFrontendMocks(QuestionsToolbar, { props: { modelValue: '', themes: [] } })
}

describe('views/questions/QuestionsToolbar.vue — import entry point', () => {
  it.each([
    ['an admin', setAuthenticatedAdmin],
    ['a superadmin', setAuthenticatedSuperadmin],
  ])('lets %s open the import screen, next to the creation button', async (_role, signIn) => {
    signIn()

    const wrapper = mountToolbar()

    await wrapper.find('.questions-toolbar__import').trigger('click')

    expect(wrapper.find('[data-test="base-toolbar-primary"]').exists()).toBe(true)
    expect(pushMock).toHaveBeenCalledWith({ name: 'questions-import' })
  })

  it('hides the import from a user, who cannot create questions', () => {
    setAuthenticatedUser()

    const wrapper = mountToolbar()

    expect(wrapper.find('.questions-toolbar__import').exists()).toBe(false)
    expect(wrapper.find('[data-test="base-toolbar-primary"]').exists()).toBe(false)
  })
})
