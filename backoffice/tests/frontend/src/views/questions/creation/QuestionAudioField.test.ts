import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { fetchQuestionMediaBlobServiceMock } from '@frontend-tests/_helpers/questionMediaServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import type { QuestionAudioState, QuestionMediaFile } from '@/types/question'
import type * as AudioUtils from '@/utils/question/audio'
import QuestionAudioField from '@/views/questions/creation/QuestionAudioField.vue'

const measureAudioDurationMsMock = vi.hoisted(() => vi.fn(async () => 60_000))

vi.mock('@/utils/question/audio', async () => {
  const actual = await vi.importActual<typeof AudioUtils>('@/utils/question/audio')

  return { ...actual, measureAudioDurationMs: measureAudioDurationMsMock }
})

resetFrontendMocksBeforeEach()

const UPDATE_MODEL_EVENT = 'onUpdate:modelValue'

const playMock = vi.fn(async () => {})
const pauseMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  measureAudioDurationMsMock.mockClear()
  playMock.mockClear()
  pauseMock.mockClear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playMock)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pauseMock)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:local-audio'),
      revokeObjectURL: vi.fn(),
    })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const existingFile: QuestionMediaFile = {
  url: '/questions/5/media',
  mimeType: 'audio/mpeg',
  sizeBytes: 2048,
  durationMs: 60_000,
  originalName: 'existant.mp3',
  uploadedAt: null,
}

function emptyState(overrides: Partial<QuestionAudioState> = {}): QuestionAudioState {
  return {
    file: null,
    durationMs: null,
    startMs: 0,
    rightsAttested: false,
    removeExisting: false,
    ...overrides,
  }
}

function mountField(
  modelValue: QuestionAudioState = emptyState(),
  props: Record<string, unknown> = {}
): VueWrapper {
  // Hôte minimal qui porte le v-model, comme le formulaire question.
  const host = defineComponent({
    setup() {
      const state = ref(modelValue)

      return () =>
        h(QuestionAudioField, {
          ...props,
          modelValue: state.value,
          [UPDATE_MODEL_EVENT]: (value: QuestionAudioState) => {
            state.value = value
          },
        })
    },
  })

  return mountWithFrontendMocks(host).findComponent(QuestionAudioField) as VueWrapper
}

async function chooseFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find('[data-test="audio-file-input"]')

  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

// Le clic enchaîne téléchargement, URL locale puis lecture : plusieurs tours de micro-tâches.
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await flushPromises()
  }
}

function lastState(wrapper: VueWrapper): QuestionAudioState {
  const events = wrapper.emitted('update:modelValue') as QuestionAudioState[][]

  return events.at(-1)?.[0] as QuestionAudioState
}

describe('views/questions/creation/QuestionAudioField.vue', () => {
  it('shows the empty state with accepted formats', () => {
    const wrapper = mountField()

    expect(wrapper.text()).toContain('questions.form.audio.empty')
    expect(wrapper.find('[data-test="audio-start-range"]').exists()).toBe(false)
  })

  it('selects a file, measures its duration and asks for the rights statement', async () => {
    const wrapper = mountField()

    await chooseFile(wrapper, new File(['ID3'], 'extrait.mp3', { type: 'audio/mpeg' }))

    expect(measureAudioDurationMsMock).toHaveBeenCalledWith('blob:local-audio')
    expect(lastState(wrapper)).toMatchObject({ durationMs: 60_000, rightsAttested: false })
    expect(wrapper.find('[data-test="audio-file-name"]').text()).toBe('extrait.mp3')
    expect(wrapper.find('[data-test="audio-rights"]').exists()).toBe(true)

    await wrapper.find('[data-test="audio-rights"]').setValue(true)

    expect(lastState(wrapper).rightsAttested).toBe(true)
  })

  it('rejects unsupported files without changing the state', async () => {
    const wrapper = mountField()

    await chooseFile(wrapper, new File(['RIFF'], 'son.wav', { type: 'audio/wav' }))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain('questions.form.audio.errors.audioTypeInvalid')
  })

  it('moves the start point with the slider, rounded to the step', async () => {
    const wrapper = mountField(emptyState(), { existingFile, questionId: 5 })

    await wrapper.find('[data-test="audio-start-range"]').setValue('12345')

    expect(lastState(wrapper).startMs).toBe(12_300)
    expect(wrapper.find('[data-test="audio-start-value"]').text()).toBe('0:12.3')
  })

  it('warns when less than 20 seconds remain after the start point', async () => {
    const wrapper = mountField(emptyState({ startMs: 45_000 }), { existingFile, questionId: 5 })

    expect(wrapper.find('[data-test="audio-too-short"]').exists()).toBe(true)
  })

  it('previews an existing file from the start point and stops after the step', async () => {
    const wrapper = mountField(emptyState({ startMs: 10_000 }), { existingFile, questionId: 5 })

    await wrapper.find('[data-test="audio-preview-5000"]').trigger('click')
    await settle()

    expect(fetchQuestionMediaBlobServiceMock).toHaveBeenCalledWith(5)
    expect(playMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4999)
    expect(pauseMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(pauseMock).toHaveBeenCalledTimes(1)
  })

  it('downloads the existing file only once', async () => {
    const wrapper = mountField(emptyState(), { existingFile, questionId: 5 })

    await wrapper.find('[data-test="audio-preview-1000"]').trigger('click')
    await settle()
    await wrapper.find('[data-test="audio-preview-20000"]').trigger('click')
    await settle()

    expect(fetchQuestionMediaBlobServiceMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledTimes(2)
  })

  it('shows an error when the browser cannot play the file', async () => {
    playMock.mockRejectedValueOnce(new Error('NotAllowedError'))
    const wrapper = mountField(emptyState(), { existingFile, questionId: 5 })

    await wrapper.find('[data-test="audio-preview-1000"]').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('questions.form.audio.errors.previewFailed')
  })

  it('marks an existing file for removal', async () => {
    const wrapper = mountField(emptyState(), { existingFile, questionId: 5 })

    await wrapper.find('[data-test="audio-remove"]').trigger('click')

    expect(lastState(wrapper)).toMatchObject({ removeExisting: true, startMs: 0, file: null })
    expect(wrapper.text()).toContain('questions.form.audio.empty')
  })

  it('displays the error passed by the form', () => {
    const wrapper = mountField(emptyState(), { error: 'Cochez l’attestation' })

    expect(wrapper.find('[data-test="audio-error"]').text()).toBe('Cochez l’attestation')
  })
})
