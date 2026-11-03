<template>
  <section class="audio-field" :class="{ 'audio-field--error': !!error }">
    <div class="audio-field__header">
      <div class="audio-field__title">
        <h3>{{ $t('questions.form.audio.title') }}</h3>
        <Tooltip :text="$t('questions.form.audio.help')" />
      </div>

      <div class="audio-field__actions">
        <input
          ref="fileInputRef"
          class="audio-field__input"
          type="file"
          :accept="AUDIO_FILE_ACCEPT"
          :disabled="disabled"
          data-test="audio-file-input"
          @change="onFileChange"
        />

        <UiButton type="button" :disabled="disabled" @click="openFilePicker">
          <MdIcon :path="mdiUpload" :size="18" />
          {{ hasFile ? $t('questions.form.audio.replace') : $t('questions.form.audio.choose') }}
        </UiButton>

        <UiButton
          v-if="hasFile"
          type="button"
          variant="icon"
          :disabled="disabled"
          :title="$t('questions.form.audio.remove')"
          data-test="audio-remove"
          @click="removeFile"
        >
          <MdIcon :path="mdiTrashCanOutline" :size="18" />
        </UiButton>
      </div>
    </div>

    <p v-if="!hasFile" class="audio-field__empty">
      {{ $t('questions.form.audio.empty', { max: maxSizeLabel }) }}
    </p>

    <template v-else>
      <div class="audio-field__file">
        <MdIcon :path="mdiMusicNote" :size="20" class="audio-field__file-icon" />
        <span class="audio-field__file-name" data-test="audio-file-name">{{ fileName }}</span>
        <span class="audio-field__file-meta">
          {{ fileSizeLabel }} · {{ durationLabel }}
          <template v-if="isPendingUpload">· {{ $t('questions.form.audio.pending') }}</template>
        </span>
      </div>

      <div class="audio-field__start">
        <LabelField :label="$t('questions.form.audio.start')" for-id="question-audio-start" />

        <div class="audio-field__start-row">
          <input
            id="question-audio-start"
            class="audio-field__range"
            type="range"
            min="0"
            :max="rangeMax"
            :step="AUDIO_START_STEP_MS"
            :value="modelValue.startMs"
            :disabled="disabled || !durationMs"
            data-test="audio-start-range"
            @input="onRangeInput"
          />

          <span class="audio-field__time" data-test="audio-start-value">
            {{ formatAudioTime(modelValue.startMs) }}
          </span>

          <UiButton
            type="button"
            :disabled="disabled || !canUseCurrentPosition"
            :title="$t('questions.form.audio.useCurrentPosition')"
            data-test="audio-use-position"
            @click="useCurrentPosition"
          >
            <MdIcon :path="mdiMapMarkerOutline" :size="18" />
            {{ formatAudioTime(currentPositionMs) }}
          </UiButton>
        </div>

        <p v-if="excerptTooShort" class="audio-field__warning" data-test="audio-too-short">
          {{ $t('questions.form.audio.tooShort') }}
        </p>
      </div>

      <div class="audio-field__preview">
        <span class="audio-field__preview-label">{{ $t('questions.form.audio.preview') }}</span>

        <div class="audio-field__preview-buttons">
          <UiButton
            v-for="previewMs in AUDIO_PREVIEW_DURATIONS_MS"
            :key="previewMs"
            type="button"
            variant="seg"
            :class="{ 'audio-field__seg--active': playingDurationMs === previewMs }"
            :disabled="disabled || loadingSource"
            :data-test="`audio-preview-${previewMs}`"
            @click="playExcerpt(previewMs)"
          >
            <MdIcon :path="mdiPlay" :size="16" />
            {{ $t('questions.form.audio.previewSeconds', { seconds: previewMs / 1000 }) }}
          </UiButton>

          <UiButton
            type="button"
            variant="seg"
            :class="{ 'audio-field__seg--active': playingDurationMs === null && isPlaying }"
            :disabled="disabled || loadingSource"
            data-test="audio-preview-full"
            @click="playExcerpt(null)"
          >
            <MdIcon :path="mdiPlay" :size="16" />
            {{ $t('questions.form.audio.previewFull') }}
          </UiButton>

          <UiButton
            type="button"
            variant="icon"
            :disabled="!isPlaying"
            :title="$t('questions.form.audio.stop')"
            data-test="audio-stop"
            @click="stopPreview"
          >
            <MdIcon :path="mdiStop" :size="18" />
          </UiButton>
        </div>
      </div>

      <label v-if="isPendingUpload" class="audio-field__rights">
        <input
          type="checkbox"
          :checked="modelValue.rightsAttested"
          :disabled="disabled"
          data-test="audio-rights"
          @change="onRightsChange"
        />
        <span>
          {{ $t('questions.form.audio.rights') }}
          <span class="audio-field__req">*</span>
        </span>
        <Tooltip :text="$t('questions.form.audio.rightsHelp')" />
      </label>
    </template>

    <p v-if="error" class="audio-field__error" data-test="audio-error">{{ error }}</p>
    <p v-if="previewError" class="audio-field__error">{{ previewError }}</p>
  </section>
</template>

<script setup lang="ts">
import {
  mdiMapMarkerOutline,
  mdiMusicNote,
  mdiPlay,
  mdiStop,
  mdiTrashCanOutline,
  mdiUpload,
} from '@mdi/js'
import { QUESTION_AUDIO_DEFAULT_MAX_BYTES } from '@quizzup/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LabelField from '@/components/ui/form/LabelField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { fetchQuestionMediaBlobService } from '@/services/questionMediaService'
import type { QuestionAudioState, QuestionMediaFile } from '@/types/question'
import {
  AUDIO_FILE_ACCEPT,
  AUDIO_PREVIEW_DURATIONS_MS,
  AUDIO_START_STEP_MS,
  clampStartMs,
  formatAudioTime,
  formatFileSize,
  isExcerptTooShort,
  measureAudioDurationMs,
  validateAudioFile,
} from '@/utils/question/audio'

const props = withDefaults(
  defineProps<{
    modelValue: QuestionAudioState
    existingFile?: QuestionMediaFile | null
    questionId?: number | null
    disabled?: boolean
    error?: string
  }>(),
  {
    existingFile: null,
    questionId: null,
    disabled: false,
    error: '',
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: QuestionAudioState): void
}>()

const { t } = useI18n()

const fileInputRef = ref<HTMLInputElement | null>(null)
const audio = ref<HTMLAudioElement | null>(null)
const pendingUrl = ref<string | null>(null)
const existingUrl = ref<string | null>(null)
const loadingSource = ref(false)
const previewError = ref<string | null>(null)
const isPlaying = ref(false)
const playingDurationMs = ref<number | null>(null)
const currentPositionMs = ref(0)
let stopTimer: number | null = null

const maxSizeLabel = formatFileSize(QUESTION_AUDIO_DEFAULT_MAX_BYTES)

const isPendingUpload = computed(() => props.modelValue.file !== null)

const visibleExistingFile = computed(() =>
  props.modelValue.removeExisting ? null : props.existingFile
)

const hasFile = computed(() => isPendingUpload.value || visibleExistingFile.value !== null)

const fileName = computed(
  () =>
    props.modelValue.file?.name ??
    visibleExistingFile.value?.originalName ??
    t('questions.form.audio.unnamed')
)

const fileSizeLabel = computed(() =>
  formatFileSize(props.modelValue.file?.size ?? visibleExistingFile.value?.sizeBytes)
)

const durationMs = computed(() =>
  isPendingUpload.value
    ? props.modelValue.durationMs
    : (visibleExistingFile.value?.durationMs ?? null)
)

const durationLabel = computed(() =>
  durationMs.value ? formatAudioTime(durationMs.value) : t('questions.form.audio.unknownDuration')
)

const rangeMax = computed(() => Math.max(0, (durationMs.value ?? 0) - AUDIO_START_STEP_MS))

const excerptTooShort = computed(() =>
  isExcerptTooShort(props.modelValue.startMs, durationMs.value)
)

const canUseCurrentPosition = computed(() => currentPositionMs.value > 0 && hasFile.value)

function update(patch: Partial<QuestionAudioState>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function openFilePicker(): void {
  fileInputRef.value?.click()
}

function revokePendingUrl(): void {
  if (pendingUrl.value) {
    URL.revokeObjectURL(pendingUrl.value)
    pendingUrl.value = null
  }
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null

  input.value = ''

  if (!file) {
    return
  }

  stopPreview()
  previewError.value = null

  const fileError = validateAudioFile(file)

  if (fileError) {
    previewError.value = t(`questions.form.audio.errors.${fileError}`, { max: maxSizeLabel })
    return
  }

  revokePendingUrl()
  pendingUrl.value = URL.createObjectURL(file)

  const measuredMs = await measureAudioDurationMs(pendingUrl.value)

  update({
    file,
    durationMs: measuredMs,
    startMs: clampStartMs(props.modelValue.startMs, measuredMs),
    rightsAttested: false,
    removeExisting: false,
  })
}

function removeFile(): void {
  stopPreview()
  revokePendingUrl()
  currentPositionMs.value = 0

  update({
    file: null,
    durationMs: null,
    startMs: 0,
    rightsAttested: false,
    removeExisting: props.existingFile !== null,
  })
}

function onRangeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)

  update({ startMs: clampStartMs(value, durationMs.value) })
}

function useCurrentPosition(): void {
  update({ startMs: clampStartMs(currentPositionMs.value, durationMs.value) })
}

function onRightsChange(event: Event): void {
  update({ rightsAttested: (event.target as HTMLInputElement).checked })
}

/** URL lisible localement : le fichier choisi, ou le fichier existant téléchargé avec le token. */
async function resolveSourceUrl(): Promise<string | null> {
  if (isPendingUpload.value) {
    return pendingUrl.value
  }

  if (existingUrl.value) {
    return existingUrl.value
  }

  if (!props.questionId || !visibleExistingFile.value) {
    return null
  }

  loadingSource.value = true

  try {
    const blob = await fetchQuestionMediaBlobService(props.questionId)

    existingUrl.value = URL.createObjectURL(blob)

    return existingUrl.value
  } catch {
    previewError.value = t('questions.form.audio.errors.previewFailed')

    return null
  } finally {
    loadingSource.value = false
  }
}

function getAudioElement(): HTMLAudioElement {
  if (!audio.value) {
    const element = new Audio()

    element.addEventListener('timeupdate', () => {
      currentPositionMs.value = Math.round(element.currentTime * 1000)
    })
    element.addEventListener('ended', () => {
      isPlaying.value = false
      playingDurationMs.value = null
    })
    audio.value = element
  }

  return audio.value
}

function clearStopTimer(): void {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer)
    stopTimer = null
  }
}

/** Pré-écoute depuis le point de départ, coupée après `previewMs` (null = jusqu'à la fin). */
async function playExcerpt(previewMs: number | null): Promise<void> {
  previewError.value = null
  stopPreview()

  const source = await resolveSourceUrl()

  if (!source) {
    return
  }

  const element = getAudioElement()

  if (element.src !== source) {
    element.src = source
  }

  element.currentTime = props.modelValue.startMs / 1000

  try {
    await element.play()
  } catch {
    previewError.value = t('questions.form.audio.errors.previewFailed')
    return
  }

  isPlaying.value = true
  playingDurationMs.value = previewMs

  if (previewMs !== null) {
    stopTimer = window.setTimeout(stopPreview, previewMs)
  }
}

function stopPreview(): void {
  clearStopTimer()
  audio.value?.pause()
  isPlaying.value = false
  playingDurationMs.value = null
}

watch(
  () => props.existingFile?.url,
  () => {
    if (existingUrl.value) {
      URL.revokeObjectURL(existingUrl.value)
      existingUrl.value = null
    }
  }
)

onBeforeUnmount(() => {
  stopPreview()
  revokePendingUrl()

  if (existingUrl.value) {
    URL.revokeObjectURL(existingUrl.value)
  }
})
</script>

<style scoped>
.audio-field {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.audio-field--error {
  border-color: var(--danger);
}

.audio-field__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.audio-field__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.audio-field__title h3 {
  margin: 0;
  color: var(--text-0);
  font-size: 15px;
  font-weight: 900;
}

.audio-field__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.audio-field__input {
  display: none;
}

.audio-field__empty {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}

.audio-field__file {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--surface-inset);
}

.audio-field__file-icon {
  color: var(--accent-pink);
}

.audio-field__file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-field__file-meta {
  color: var(--text-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.audio-field__start {
  display: grid;
  gap: 8px;
}

.audio-field__start-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
}

.audio-field__range {
  width: 100%;
  min-height: 48px;
  accent-color: var(--primary);
}

.audio-field__time {
  min-width: 64px;
  color: var(--text-0);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.audio-field__preview {
  display: grid;
  gap: 8px;
}

.audio-field__preview-label {
  color: var(--text-1);
  font-size: 13px;
  font-weight: 700;
}

.audio-field__preview-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.audio-field__seg--active {
  border-color: var(--border-hover);
  background: var(--surface-3);
  color: var(--text-0);
}

.audio-field__rights {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.audio-field__rights input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.audio-field__req {
  margin-left: 4px;
  color: var(--accent-pink);
}

.audio-field__warning {
  margin: 0;
  color: var(--warn);
  font-size: 13px;
  font-weight: 700;
}

.audio-field__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 820px) {
  .audio-field__header {
    flex-direction: column;
    align-items: stretch;
  }

  .audio-field__start-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
