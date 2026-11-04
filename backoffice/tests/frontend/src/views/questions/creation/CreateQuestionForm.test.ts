import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  createQuestionServiceMock,
  updateQuestionServiceMock,
} from '@frontend-tests/_helpers/questionsServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { type DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SelectField from '@/components/ui/form/SelectField.vue'
import type { Question, Theme } from '@/types/question'
import CreateQuestionForm from '@/views/questions/creation/CreateQuestionForm.vue'

resetFrontendMocksBeforeEach()

afterEach(() => {
  vi.restoreAllMocks()
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
        kind: QUESTION_KIND_QCM,
      })
    )
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 99 })
  })

  it('sends the chosen question kind and loads it back when editing', async () => {
    createQuestionServiceMock.mockResolvedValue(savedQuestion())

    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: { question: null, themes, mode: 'create', initialThemeIds: [1] },
    })

    wrapper
      .findAllComponents(SelectField)
      .find((field) => field.attributes('id') === 'question-kind')
      ?.vm.$emit('update:modelValue', QUESTION_KIND_TRUE_FALSE)
    await nextTick()
    await findInput(wrapper, 'question').setValue('La Terre est ronde ?')
    await findInput(wrapper, 'answer-0').setValue('Vrai')
    await findInput(wrapper, 'answer-1').setValue('Faux')
    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: QUESTION_KIND_TRUE_FALSE })
    )

    const editing = mountWithFrontendMocks(CreateQuestionForm, {
      props: {
        question: savedQuestion({ kind: QUESTION_KIND_ESTIMATE }),
        themes,
        mode: 'edit',
      },
    })
    await nextTick()

    expect(
      editing
        .findAllComponents(SelectField)
        .find((field) => field.attributes('id') === 'question-kind')
        ?.props('modelValue')
    ).toBe(QUESTION_KIND_ESTIMATE)
  })

  it('applies the rules of the question kind before calling the API', async () => {
    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: { question: null, themes, mode: 'create', initialThemeIds: [1] },
    })

    wrapper
      .findAllComponents(SelectField)
      .find((field) => field.attributes('id') === 'question-kind')
      ?.vm.$emit('update:modelValue', QUESTION_KIND_ESTIMATE)
    await nextTick()
    await findInput(wrapper, 'question').setValue('Hauteur de la tour Eiffel ?')
    await findInput(wrapper, 'answer-0').setValue('Beaucoup')
    await findInput(wrapper, 'answer-1').setValue('Peu')
    await submitForm(wrapper)

    expect(createQuestionServiceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('questions.form.errors.estimateAnswers')
  })

  it('refuses audio or video for a true / false question before calling the API', async () => {
    createQuestionServiceMock.mockResolvedValue(savedQuestion())

    const wrapper = mountWithFrontendMocks(CreateQuestionForm, {
      props: { question: null, themes, mode: 'create', initialThemeIds: [1] },
    })
    const field = (id: string) =>
      wrapper.findAllComponents(SelectField).find((select) => select.attributes('id') === id)!
    const select = (id: string, value: string) => field(id).vm.$emit('update:modelValue', value)

    select('question-kind', QUESTION_KIND_TRUE_FALSE)
    select('question-type-media', QUESTION_MEDIA_TYPE_VIDEO)
    await nextTick()
    await findInput(wrapper, 'question').setValue('La Terre est ronde ?')
    await findInput(wrapper, 'answer-0').setValue('Vrai')
    await findInput(wrapper, 'answer-1').setValue('Faux')
    await submitForm(wrapper)

    expect(createQuestionServiceMock).not.toHaveBeenCalled()
    expect(field('question-type-media').attributes('error')).toBe(
      'questions.form.errors.kindMediaInvalid'
    )

    select('question-type-media', QUESTION_MEDIA_TYPE_AUDIO)
    await nextTick()
    await submitForm(wrapper)

    expect(createQuestionServiceMock).not.toHaveBeenCalled()
    expect(field('question-type-media').attributes('error')).toBe(
      'questions.form.errors.kindMediaInvalid'
    )

    select('question-type-media', QUESTION_MEDIA_TYPE_IMAGE)
    await nextTick()
    await submitForm(wrapper)

    expect(field('question-type-media').attributes('error')).toBeUndefined()
    expect(createQuestionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: QUESTION_KIND_TRUE_FALSE, typeMedia: 'image' })
    )
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
