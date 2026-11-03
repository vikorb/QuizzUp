import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  deleteQuestionMediaServiceMock,
  mediaQuestion,
  uploadQuestionMediaServiceMock,
} from '@frontend-tests/_helpers/questionMediaServiceMock'
import {
  createQuestionServiceMock,
  updateQuestionServiceMock,
} from '@frontend-tests/_helpers/questionsServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { THEME_SCOPE_GLOBAL } from '@quizzup/shared'
import { type DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SelectField from '@/components/ui/form/SelectField.vue'
import { QuestionMediaError } from '@/services/questionMediaError'
import type { Question, Theme } from '@/types/question'
import type * as AudioUtils from '@/utils/question/audio'
import CreateQuestionForm from '@/views/questions/creation/CreateQuestionForm.vue'

const measureAudioDurationMsMock = vi.hoisted(() => vi.fn(async () => 60_000))

vi.mock('@/utils/question/audio', async () => {
  const actual = await vi.importActual<typeof AudioUtils>('@/utils/question/audio')

  return { ...actual, measureAudioDurationMs: measureAudioDurationMsMock }
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:local-audio'),
      revokeObjectURL: vi.fn(),
    })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

async function submitForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('form').trigger('submit')

  for (let round = 0; round < 4; round += 1) {
    await flushPromises()
  }

  await nextTick()
}

async function chooseFile(wrapper: VueWrapper): Promise<File> {
  const file = new File(['ID3'], 'queen.mp3', { type: 'audio/mpeg' })
  const input = wrapper.find('[data-test="audio-file-input"]')

  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()

  return file
}

function findInput(wrapper: VueWrapper, name: string): DOMWrapper<HTMLInputElement> {
  return wrapper.find(`input[name="${name}"]`) as DOMWrapper<HTMLInputElement>
}

describe('views/questions/creation/CreateQuestionForm.vue — audio', () => {
  it('hides the media url field and shows the audio field for audio questions', () => {
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    expect(findInput(wrapper, 'mediaUrl').exists()).toBe(false)
    expect(wrapper.find('[data-test="audio-file-name"]').text()).toBe('extrait.mp3')
  })

  it('requires the rights statement before uploading a new file', async () => {
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    await chooseFile(wrapper)
    await submitForm(wrapper)

    expect(updateQuestionServiceMock).not.toHaveBeenCalled()
    expect(uploadQuestionMediaServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="audio-error"]').text()).toBe(
      'questions.form.audio.errors.rightsRequired'
    )
  })

  it('waits for the duration measure before saving', async () => {
    measureAudioDurationMsMock.mockImplementationOnce(() => new Promise<number>(() => {}))
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    await chooseFile(wrapper)
    await wrapper.find('[data-test="audio-rights"]').setValue(true)
    await submitForm(wrapper)

    expect(updateQuestionServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="audio-error"]').text()).toBe(
      'questions.form.audio.errors.measuring'
    )
  })

  it('reports a start point failure separately from the upload', async () => {
    updateQuestionServiceMock
      .mockResolvedValueOnce(mediaQuestion(5, { answers }))
      .mockRejectedValueOnce(new Error('invalid_body'))
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    await wrapper.find('[data-test="audio-start-range"]').setValue('15000')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('questions.form.audio.errors.startFailed')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('uploads the new file after saving the question', async () => {
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(5, { answers }))
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    const file = await chooseFile(wrapper)
    await wrapper.find('[data-test="audio-rights"]').setValue(true)
    await submitForm(wrapper)

    expect(uploadQuestionMediaServiceMock).toHaveBeenCalledWith(5, {
      file,
      durationMs: 60_000,
      rightsAttested: true,
    })
    expect(updateQuestionServiceMock.mock.calls[0]?.[1]).toMatchObject({ mediaUrl: null })
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 5 })
  })

  it('saves the start point once the file is known by the API', async () => {
    updateQuestionServiceMock.mockImplementation(async (id: number, payload: unknown) =>
      mediaQuestion(id, {
        answers,
        mediaStartMs: (payload as { mediaStartMs?: number }).mediaStartMs ?? 0,
      })
    )
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    await wrapper.find('[data-test="audio-start-range"]').setValue('15000')
    await submitForm(wrapper)

    expect(updateQuestionServiceMock).toHaveBeenCalledTimes(2)
    expect(updateQuestionServiceMock.mock.calls[0]?.[1]).not.toHaveProperty('mediaStartMs')
    expect(updateQuestionServiceMock.mock.calls[1]).toEqual([5, { mediaStartMs: 15_000 }])
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ mediaStartMs: 15_000 })
  })

  it('does not resend an unchanged start point', async () => {
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(5, { answers, mediaStartMs: 3000 }))
    const wrapper = mountForm(mediaQuestion(5, { answers, mediaStartMs: 3000 }), 'edit')

    await submitForm(wrapper)

    expect(updateQuestionServiceMock).toHaveBeenCalledTimes(1)
  })

  it('removes the existing file when asked', async () => {
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(5, { answers }))
    const wrapper = mountForm(mediaQuestion(5, { answers }), 'edit')

    await wrapper.find('[data-test="audio-remove"]').trigger('click')
    await submitForm(wrapper)

    expect(deleteQuestionMediaServiceMock).toHaveBeenCalledWith(5)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('keeps the form open and reuses the created question when the upload fails', async () => {
    createQuestionServiceMock.mockResolvedValue(mediaQuestion(42, { mediaFile: null, answers }))
    updateQuestionServiceMock.mockResolvedValue(mediaQuestion(42, { mediaFile: null, answers }))
    uploadQuestionMediaServiceMock.mockRejectedValueOnce(
      new QuestionMediaError('question_media_invalid_file')
    )

    const wrapper = mountForm(null, 'create')

    wrapper.findComponent(SelectField).vm.$emit('update:modelValue', 'audio')
    await nextTick()
    await findInput(wrapper, 'question').setValue('Quel groupe ?')
    await findInput(wrapper, 'answer-0').setValue('Queen')
    await findInput(wrapper, 'answer-1').setValue('ABBA')
    await chooseFile(wrapper)
    await wrapper.find('[data-test="audio-rights"]').setValue(true)

    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.text()).toContain('questions.form.audio.errors.uploadFailed')

    await submitForm(wrapper)

    expect(createQuestionServiceMock).toHaveBeenCalledTimes(1)
    expect(updateQuestionServiceMock.mock.calls[0]?.[0]).toBe(42)
    expect(uploadQuestionMediaServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 42 })
  })
})
