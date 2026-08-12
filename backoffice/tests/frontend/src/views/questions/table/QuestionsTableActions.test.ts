import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { deleteQuestionServiceMock } from '@frontend-tests/_helpers/questionsServiceMock'
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
import QuestionsTableActions from '@/views/questions/table/QuestionsTableActions.vue'

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

function actionButtons(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.findAll('[data-test="ui-button"]')
}

describe('views/questions/table/QuestionsTableActions.vue', () => {
  it('turns the edit action read-only and disables delete/switch when canEdit is false', () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActions, {
      props: {
        item: makeQuestion({ canEdit: false, scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    const [editButton, deleteButton] = actionButtons(wrapper)
    const readonlyIcon = editButton.find('[data-test="md-icon"]').attributes('data-path')

    expect(editButton.attributes('title')).toBe('questions.actions.readonly')
    expect(editButton.attributes('disabled')).toBeUndefined()

    expect(deleteButton.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeDefined()

    // L'icône passe en lecture seule (œil) et diffère de l'icône crayon.
    const editableWrapper = mountWithFrontendMocks(QuestionsTableActions, {
      props: {
        item: makeQuestion({ canEdit: true }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })
    const editableIcon = editableWrapper
      .findAll('[data-test="ui-button"]')[0]
      .find('[data-test="md-icon"]')
      .attributes('data-path')

    expect(readonlyIcon).not.toBe(editableIcon)
  })

  it('keeps edit/delete/switch enabled when canEdit is true', () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActions, {
      props: {
        item: makeQuestion({ canEdit: true }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    const [editButton, deleteButton] = actionButtons(wrapper)

    expect(editButton.attributes('title')).toBe('questions.actions.edit')
    expect(deleteButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="switch-field"]').attributes('disabled')).toBeUndefined()
  })

  it('emits edit when the (read-only) open button is clicked', async () => {
    const wrapper = mountWithFrontendMocks(QuestionsTableActions, {
      props: {
        item: makeQuestion({ id: 42, canEdit: false, scope: THEME_SCOPE_GLOBAL, companyId: null }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    await actionButtons(wrapper)[0].trigger('click')

    expect(wrapper.emitted('edit')).toEqual([[42]])
  })

  it('confirms and soft-deletes the question when editable', async () => {
    setConfirmResult(true)
    deleteQuestionServiceMock.mockResolvedValue(null)

    const wrapper = mountWithFrontendMocks(QuestionsTableActions, {
      props: {
        item: makeQuestion({ id: 7, canEdit: true }),
        currentRole: ADMIN_ROLE_ADMIN,
      },
    })

    await actionButtons(wrapper)[1].trigger('click')
    await flushPromises()
    await nextTick()

    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    expect(deleteQuestionServiceMock).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('deleted')).toEqual([[7]])
  })
})
