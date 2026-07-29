import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { QUESTION_STATUS_ACTIVE, THEME_SCOPE_GLOBAL } from '@quizzup/shared'
import { type DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { Question, Theme } from '@/types/question'
import CreateQuestionForm from '@/views/questions/creation/CreateQuestionForm.vue'

const { createQuestionServiceMock, updateQuestionServiceMock } = vi.hoisted(() => ({
  createQuestionServiceMock: vi.fn(),
  updateQuestionServiceMock: vi.fn(),
}))

vi.mock('@/services/questionsService', () => ({
  createQuestionService: createQuestionServiceMock,
  updateQuestionService: updateQuestionServiceMock,
}))

resetFrontendMocksBeforeEach()

afterEach(() => {
  vi.restoreAllMocks()
  createQuestionServiceMock.mockReset()
  updateQuestionServiceMock.mockReset()
})

const themes: Theme[] = [
  {
    id: 1,
    adminId: 1,
    companyId: null,
    scope: THEME_SCOPE_GLOBAL,
    name: 'Global A',
    mode: 'classic',
    status: 1,
  },
]

function savedQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 99,
    adminId: 1,
    companyId: null,
    themeId: 1,
    themeIds: [1],
    scope: THEME_SCOPE_GLOBAL,
    question: 'Saved',
    typeMedia: 'none',
    mediaUrl: null,
    status: QUESTION_STATUS_ACTIVE,
    canEdit: true,
    ...overrides,
  }
}

function findInput(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  name: string
): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

async function submitForm(wrapper: ReturnType<typeof mountWithFrontendMocks>): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await nextTick()
}

describe('views/questions/creation/CreateQuestionForm.vue', () => {
  it('validates required fields before calling the create service', async () => {
    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: {
        question: null,
        themes,
        mode: 'create',
      },
    })

    await submitForm(wrapper)

    expect(createQuestionServiceMock).not.toHaveBeenCalled()

    const text = wrapper.text()
    expect(text).toContain('questions.form.errors.themeRequired')
    expect(text).toContain('questions.form.errors.questionRequired')
    expect(text).toContain('questions.form.errors.answerRequired')
  })

  it('creates a question with a trimmed payload', async () => {
    createQuestionServiceMock.mockResolvedValue(savedQuestion())

    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: {
        question: null,
        themes,
        mode: 'create',
        initialThemeIds: [1],
      },
    })

    await findInput(wrapper, 'question').setValue('  What is 2 + 2 ?  ')
    await findInput(wrapper, 'answer-0').setValue('Four')
    await findInput(wrapper, 'answer-1').setValue('Five')

    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledTimes(1)
    expect(createQuestionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What is 2 + 2 ?',
        themeIds: [1],
      })
    )
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 99 })
  })

  it('keeps existing answer ids when updating a question (B3)', async () => {
    updateQuestionServiceMock.mockResolvedValue(savedQuestion({ id: 2 }))

    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: {
        question: savedQuestion({
          id: 2,
          question: 'Existing question ?',
          answers: [
            { id: 10, response: 'A', isCorrect: true },
            { id: 11, response: 'B', isCorrect: false },
          ],
        }),
        themes,
        mode: 'edit',
      },
    })

    await submitForm(wrapper)

    expect(updateQuestionServiceMock).toHaveBeenCalledTimes(1)

    const [questionId, payload] = updateQuestionServiceMock.mock.calls[0] as [
      number,
      { answers: Array<{ id?: number }> },
    ]

    expect(questionId).toBe(2)
    expect(payload.answers.map((answer) => answer.id)).toEqual([10, 11])
  })
})
