import { setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { updateQuestionStatusServiceMock } from '@frontend-tests/_helpers/questionsServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  ADMIN_ROLE_ADMIN,
  QUESTION_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import type { Question } from '@/types/question'
import QuestionsTableActionsSwitch from '@/views/questions/table/QuestionsTableActionsSwitch.vue'

resetFrontendMocksBeforeEach()

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 1,
    adminId: 1,
    companyId: 1,
    themeId: 3,
    themeIds: [3],
    scope: THEME_SCOPE_COMPANY,
    question: 'Question ?',
    typeMedia: 'none',
    mediaUrl: null,
    status: QUESTION_STATUS_ACTIVE,
    canEdit: true,
    ...overrides,
  }
}

function switchButton(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.find('[data-test="switch-field"]')
}

describe('views/questions/table/QuestionsTableActionsSwitch.vue', () => {
  it('disables the switch when canEdit is false', () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActionsSwitch, {
      props: {
        question: makeQuestion({ canEdit: false }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('falls back to the role and disables an establishment admin on a global question', () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActionsSwitch, {
      props: {
        question: makeQuestion({ canEdit: undefined, scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('enables the switch when canEdit is true', () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActionsSwitch, {
      props: {
        question: makeQuestion({ canEdit: true }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    expect(switchButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('toggles the status and emits the updated question', async () => {
    setConfirmResult(true)
    updateQuestionStatusServiceMock.mockResolvedValue({
      ok: true,
      question: makeQuestion({ id: 5, status: QUESTION_STATUS_ACTIVE }),
    })

    const wrapper = mountWithFrontendMocks(QuestionsTableActionsSwitch, {
      props: {
        question: makeQuestion({ id: 5, canEdit: true }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    await switchButton(wrapper).trigger('click')
    await flushPromises()
    await nextTick()

    expect(updateQuestionStatusServiceMock).toHaveBeenCalledWith(5, 0)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 5 })
  })
})
