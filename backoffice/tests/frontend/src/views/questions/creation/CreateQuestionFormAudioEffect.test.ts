import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { mediaQuestion } from '@frontend-tests/_helpers/questionMediaServiceMock'
import {
  createQuestionServiceMock,
  updateQuestionServiceMock,
} from '@frontend-tests/_helpers/questionsServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  QUESTION_AUDIO_EFFECT_NONE,
  QUESTION_AUDIO_EFFECT_REVERSE,
  QUESTION_AUDIO_EFFECT_SLOWED,
  QUESTION_AUDIO_EFFECTS,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import SelectField from '@/components/ui/form/SelectField.vue'
import type { Question, Theme } from '@/types/question'
import CreateQuestionForm from '@/views/questions/creation/CreateQuestionForm.vue'

resetFrontendMocksBeforeEach()

const themes: Theme[] = [
  {
    id: 1,
    adminId: 1,
    companyId: null,
    scope: THEME_SCOPE_GLOBAL,
    name: 'Blind test',
    mode: 'audio',
    status: 1,
  },
]

const answers = [
  { id: 10, response: 'Queen', isCorrect: true },
  { id: 11, response: 'ABBA', isCorrect: false },
]

function mountForm(question: Question | null, mode: 'create' | 'edit'): VueWrapper {
  return mountWithFrontendMocks(CreateQuestionForm, {
    props: { question, themes, mode, initialThemeIds: [1] },
  })
}

function selectField(wrapper: VueWrapper, id: string) {
  return wrapper.findAllComponents(SelectField).find((field) => field.attributes('id') === id)
}

async function choose(wrapper: VueWrapper, id: string, value: string): Promise<void> {
  selectField(wrapper, id)?.vm.$emit('update:modelValue', value)
  await nextTick()
}

async function fillCreateForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('input[name="question"]').setValue('Quel groupe ?')
  await wrapper.find('input[name="answer-0"]').setValue('Queen')
  await wrapper.find('input[name="answer-1"]').setValue('ABBA')
}

async function submitForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await nextTick()
}

describe('views/questions/creation/CreateQuestionForm.vue — audio effect', () => {
  it('hides the effect selector unless the question is audio', async () => {
    const wrapper = mountForm(null, 'create')

    expect(selectField(wrapper, 'question-audio-effect')).toBeUndefined()

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_IMAGE)

    expect(selectField(wrapper, 'question-audio-effect')).toBeUndefined()

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)

    expect(selectField(wrapper, 'question-audio-effect')).toBeDefined()
  })

  it('offers every shared effect, with none selected by default', async () => {
    const wrapper = mountForm(null, 'create')

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)

    const effect = selectField(wrapper, 'question-audio-effect')

    expect(effect?.props('modelValue')).toBe(QUESTION_AUDIO_EFFECT_NONE)
    expect(effect?.props('options').map((option) => option.value)).toEqual([
      ...QUESTION_AUDIO_EFFECTS,
    ])
  })

  it('sends the chosen effect when creating an audio question', async () => {
    createQuestionServiceMock.mockResolvedValue(mediaQuestion(42, { mediaFile: null, answers }))
    const wrapper = mountForm(null, 'create')

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)
    await choose(wrapper, 'question-audio-effect', QUESTION_AUDIO_EFFECT_REVERSE)
    await fillCreateForm(wrapper)
    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        typeMedia: QUESTION_MEDIA_TYPE_AUDIO,
        audioEffect: QUESTION_AUDIO_EFFECT_REVERSE,
      })
    )
  })

  it('sends none for a question that is not audio', async () => {
    createQuestionServiceMock.mockResolvedValue(mediaQuestion(42, { typeMedia: 'none' }))
    const wrapper = mountForm(null, 'create')

    await fillCreateForm(wrapper)
    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioEffect: QUESTION_AUDIO_EFFECT_NONE })
    )
  })

  it('reads the saved effect and sends the new one when editing', async () => {
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(5, { answers }))
    const wrapper = mountForm(
      mediaQuestion(5, { answers, audioEffect: QUESTION_AUDIO_EFFECT_REVERSE }),
      'edit'
    )

    expect(selectField(wrapper, 'question-audio-effect')?.props('modelValue')).toBe(
      QUESTION_AUDIO_EFFECT_REVERSE
    )

    await choose(wrapper, 'question-audio-effect', QUESTION_AUDIO_EFFECT_SLOWED)
    await submitForm(wrapper)

    expect(updateQuestionServiceMock.mock.calls[0]?.[1]).toMatchObject({
      audioEffect: QUESTION_AUDIO_EFFECT_SLOWED,
    })
  })

  it('reads none when the API sends no effect', () => {
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    expect(selectField(wrapper, 'question-audio-effect')?.props('modelValue')).toBe(
      QUESTION_AUDIO_EFFECT_NONE
    )
  })

  it('resets the effect to none when the question stops being audio', async () => {
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(5, { answers, typeMedia: 'image' }))
    const wrapper = mountForm(
      mediaQuestion(5, { answers, audioEffect: QUESTION_AUDIO_EFFECT_SLOWED }),
      'edit'
    )

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_IMAGE)
    await submitForm(wrapper)

    expect(updateQuestionServiceMock.mock.calls[0]?.[1]).toMatchObject({
      typeMedia: QUESTION_MEDIA_TYPE_IMAGE,
      audioEffect: QUESTION_AUDIO_EFFECT_NONE,
    })

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)

    expect(selectField(wrapper, 'question-audio-effect')?.props('modelValue')).toBe(
      QUESTION_AUDIO_EFFECT_NONE
    )
  })

  it.each(['question_audio_effect_invalid', 'audio_effect_requires_audio'])(
    'shows the translated API error %s under the selector',
    async (code) => {
      createQuestionServiceMock.mockRejectedValue(new Error(code))
      const wrapper = mountForm(null, 'create')

      await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)
      await fillCreateForm(wrapper)
      await submitForm(wrapper)

      expect(selectField(wrapper, 'question-audio-effect')?.attributes('error')).toBe(
        `questions.form.audioEffect.errors.${code}`
      )
      expect(wrapper.emitted('saved')).toBeUndefined()
    }
  )

  it('keeps the selector free of error for another API failure', async () => {
    createQuestionServiceMock.mockRejectedValue(new Error('server_error'))
    const wrapper = mountForm(null, 'create')

    await choose(wrapper, 'question-type-media', QUESTION_MEDIA_TYPE_AUDIO)
    await fillCreateForm(wrapper)
    await submitForm(wrapper)

    expect(selectField(wrapper, 'question-audio-effect')?.attributes('error')).toBeUndefined()
    expect(wrapper.text()).toContain('questions.errors.saveFailed')
  })
})
