<template>
  <form class="question-form" @submit.prevent="submitForm">
    <ThemeMultiSelect
      v-model="form.themeIds"
      :themes="themes"
      :label="$t('questions.form.themes')"
      :hint="$t('questions.form.themesHint')"
      :placeholder="$t('questions.form.searchThemesPlaceholder')"
      :disabled="saving"
      :error="getErrorLabel(errors.themeIds)"
      required
    />

    <FormField
      v-model="form.question"
      :label="$t('questions.form.question')"
      name="question"
      :placeholder="$t('questions.form.questionPlaceholder')"
      :disabled="saving"
      :error="getErrorLabel(errors.question)"
      required
    />

    <FormStatusToggle
      v-if="mode === 'edit'"
      :active="isQuestionActive"
      :label="$t('questions.form.status.label')"
      :help="statusHelp"
      :disabled="saving || isQuestionDeleted"
      :pending="isStatusPending"
      @toggle="toggleStatus"
    />

    <div class="question-form__grid">
      <SelectField
        id="question-kind"
        v-model="form.kind"
        :label="$t('questions.form.kind')"
        :options="kindOptions"
        :disabled="saving"
      />

      <SelectField
        id="question-type-media"
        v-model="form.typeMedia"
        :label="$t('questions.form.typeMedia')"
        :options="typeMediaOptions"
        :disabled="saving"
        :error="getErrorLabel(errors.typeMedia)"
      />

      <FormField
        v-if="!isAudio"
        v-model="form.mediaUrl"
        :label="$t('questions.form.mediaUrl')"
        name="mediaUrl"
        :placeholder="$t('questions.form.mediaUrlPlaceholder')"
        :disabled="saving || form.typeMedia === QUESTION_MEDIA_TYPE_NONE"
      />
    </div>

    <QuestionAudioField
      v-if="isAudio"
      v-model="form.audio"
      :existing-file="existingMediaFile"
      :question-id="savedQuestionId"
      :disabled="saving"
      :error="getErrorLabel(errors.audio)"
    />

    <section class="question-form__answers">
      <div class="question-form__answers-header">
        <div class="question-form__answers-title">
          <h3>{{ $t('questions.form.answers') }}</h3>
          <Tooltip :text="answersRulesText" />
        </div>

        <UiButton
          type="button"
          variant="default"
          :disabled="saving || form.answers.length >= 4"
          @click="addAnswer"
        >
          {{ $t('questions.form.addAnswer') }}
        </UiButton>
      </div>

      <p v-if="errors.answers" class="question-form__error">
        {{ $t(errors.answers) }}
      </p>

      <div v-for="(answer, index) in form.answers" :key="index" class="question-form__answer-row">
        <FormField
          v-model="answer.response"
          class="question-form__answer-field"
          :label="$t('questions.form.answerLabel', { index: index + 1 })"
          :name="`answer-${index}`"
          :placeholder="$t('questions.form.answerPlaceholder', { index: index + 1 })"
          :disabled="saving"
          :error="getAnswerError(answer)"
          required
        />

        <div class="question-form__correct">
          <SwitchField
            :model-value="answer.isCorrect"
            :disabled="saving || (answer.isCorrect && correctCount <= 1)"
            :label="$t('questions.form.correctAnswer')"
            @change="toggleCorrect(index)"
          />
          <span>{{ $t('questions.form.correctAnswer') }}</span>
        </div>

        <UiButton
          type="button"
          variant="icon"
          :disabled="saving || form.answers.length <= 2"
          :title="$t('questions.form.removeAnswer')"
          @click="removeAnswer(index)"
        >
          <MdIcon :path="mdiTrashCanOutline" :size="18" />
        </UiButton>
      </div>
    </section>

    <FormResult :error="formError" :success="formSuccess" />

    <FormActions
      :cancel-label="$t('questions.form.cancel')"
      :submit-label="submitLabel"
      :submitting-label="$t('questions.form.saving')"
      :loading="saving"
      :disabled="saving"
      @cancel="emit('cancel')"
    />
  </form>
</template>

<script setup lang="ts">
import { mdiTrashCanOutline } from '@mdi/js'
import {
  DEFAULT_QUESTION_KIND,
  getQuestionKindAnswersError,
  getQuestionKindMediaError,
  QUESTION_KIND_ANSWERS_ERROR_TRUE_FALSE,
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUS_INACTIVE,
  type QuestionStatus,
} from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import FormStatusToggle from '@/components/ui/form/FormStatusToggle.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import SwitchField from '@/components/ui/form/SwitchField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { QuestionMediaError } from '@/services/questionMediaError'
import {
  deleteQuestionMediaService,
  uploadQuestionMediaService,
} from '@/services/questionMediaService'
import { createQuestionService, updateQuestionService } from '@/services/questionsService'
import type { SelectFieldOption } from '@/types/form'
import type {
  Answer,
  Question,
  QuestionAudioState,
  QuestionKind,
  QuestionMediaFile,
  QuestionMediaType,
  QuestionPayload,
  Theme,
} from '@/types/question'

import QuestionAudioField from './QuestionAudioField.vue'
import ThemeMultiSelect from './ThemeMultiSelect.vue'

const props = withDefaults(
  defineProps<{
    question: Question | null
    themes: Theme[]
    mode: 'create' | 'edit'
    initialThemeIds?: number[]
  }>(),
  {
    initialThemeIds: () => [],
  }
)

const emit = defineEmits<{
  (event: 'saved', question: Question): void
  (event: 'cancel'): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const form = reactive({
  themeIds: [] as number[],
  question: '',
  kind: DEFAULT_QUESTION_KIND as QuestionKind,
  typeMedia: QUESTION_MEDIA_TYPE_NONE as QuestionMediaType,
  mediaUrl: '',
  status: QUESTION_STATUS_ACTIVE as QuestionStatus,
  answers: [
    { response: '', isCorrect: true },
    { response: '', isCorrect: false },
  ] as Answer[],
  audio: createAudioState(),
})

const errors = reactive({
  themeIds: '',
  question: '',
  answers: '',
  typeMedia: '',
  audio: '',
})

// Question déjà enregistrée : en création, si l'envoi du fichier échoue après la création, un
// nouvel essai met à jour la même question au lieu d'en créer une seconde.
const savedQuestion = ref<Question | null>(null)

const saving = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const submitLabel = computed(() =>
  props.mode === 'edit' ? t('questions.form.save') : t('questions.form.create')
)

const isAudio = computed(() => form.typeMedia === QUESTION_MEDIA_TYPE_AUDIO)

const savedQuestionId = computed(() => savedQuestion.value?.id ?? null)

const existingMediaFile = computed<QuestionMediaFile | null>(
  () => savedQuestion.value?.mediaFile ?? null
)

function createAudioState(startMs = 0): QuestionAudioState {
  return {
    file: null,
    durationMs: null,
    measuring: false,
    startMs,
    rightsAttested: false,
    removeExisting: false,
  }
}

const correctCount = computed(() => form.answers.filter((answer) => answer.isCorrect).length)

const isQuestionActive = computed(() => form.status === QUESTION_STATUS_ACTIVE)
const isQuestionDeleted = computed(() => form.status === QUESTION_STATUS_DELETED)
const isStatusPending = computed(
  () => Boolean(props.question) && form.status !== props.question?.status
)

function toQuestionStatus(status: unknown): QuestionStatus {
  if (
    status === QUESTION_STATUS_ACTIVE ||
    status === QUESTION_STATUS_INACTIVE ||
    status === QUESTION_STATUS_DELETED ||
    status === QUESTION_STATUS_DRAFT
  ) {
    return status
  }

  return QUESTION_STATUS_INACTIVE
}

function toggleStatus(): void {
  form.status = isQuestionActive.value ? QUESTION_STATUS_INACTIVE : QUESTION_STATUS_ACTIVE
}

const statusHelp = computed(() => {
  if (isStatusPending.value) {
    return isQuestionActive.value
      ? t('questions.form.status.pendingActiveHelp')
      : t('questions.form.status.pendingInactiveHelp')
  }

  return isQuestionActive.value
    ? t('questions.form.status.activeHelp')
    : t('questions.form.status.inactiveHelp')
})

const answersRulesText = computed(() =>
  form.kind === QUESTION_KIND_QCM
    ? t('questions.form.answersRules')
    : t(`questions.form.kindRules.${form.kind}`)
)

const kindOptions = computed<SelectFieldOption[]>(() => [
  { label: t('questions.kinds.qcm'), value: QUESTION_KIND_QCM },
  { label: t('questions.kinds.true_false'), value: QUESTION_KIND_TRUE_FALSE },
  { label: t('questions.kinds.estimate'), value: QUESTION_KIND_ESTIMATE },
])

const typeMediaOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('questions.media.none'),
    value: QUESTION_MEDIA_TYPE_NONE,
  },
  {
    label: t('questions.media.image'),
    value: QUESTION_MEDIA_TYPE_IMAGE,
  },
  {
    label: t('questions.media.audio'),
    value: QUESTION_MEDIA_TYPE_AUDIO,
  },
  {
    label: t('questions.media.video'),
    value: QUESTION_MEDIA_TYPE_VIDEO,
  },
])

watch(
  [() => props.question, () => props.initialThemeIds, () => props.themes],
  ([question]) => {
    resetMessages()
    savedQuestion.value = question
    form.audio = createAudioState(question?.mediaStartMs ?? 0)

    if (!question) {
      form.themeIds = normalizeThemeIds(props.initialThemeIds)
      form.question = ''
      form.kind = DEFAULT_QUESTION_KIND
      form.typeMedia = QUESTION_MEDIA_TYPE_NONE
      form.mediaUrl = ''
      form.status = QUESTION_STATUS_ACTIVE
      form.answers = [
        { response: '', isCorrect: true },
        { response: '', isCorrect: false },
      ]
      return
    }

    form.themeIds = getQuestionThemeIds(question)
    form.question = question.question
    form.kind = question.kind ?? DEFAULT_QUESTION_KIND
    form.typeMedia = question.typeMedia
    form.mediaUrl = question.mediaUrl ?? ''
    form.status = toQuestionStatus(question.status)
    form.answers = question.answers?.length
      ? question.answers.map((answer) => ({
          id: answer.id,
          response: answer.response,
          isCorrect: answer.isCorrect,
        }))
      : [
          { response: '', isCorrect: true },
          { response: '', isCorrect: false },
        ]
  },
  { immediate: true }
)

function normalizeThemeIds(themeIds: number[]): number[] {
  const visibleThemeIds = new Set(props.themes.map((theme) => Number(theme.id)))

  return [
    ...new Set(
      themeIds
        .map(Number)
        .filter((themeId) => Number.isInteger(themeId) && themeId > 0)
        .filter((themeId) => visibleThemeIds.size === 0 || visibleThemeIds.has(themeId))
    ),
  ]
}

function getQuestionThemeIds(question: Question): number[] {
  if (Array.isArray(question.themeIds) && question.themeIds.length > 0) {
    return normalizeThemeIds(question.themeIds)
  }

  if (Array.isArray(question.themes) && question.themes.length > 0) {
    return normalizeThemeIds(question.themes.map((theme) => theme.id))
  }

  return question.themeId ? normalizeThemeIds([question.themeId]) : []
}

function resetErrors(): void {
  errors.themeIds = ''
  errors.question = ''
  errors.answers = ''
  errors.typeMedia = ''
  errors.audio = ''
}

function resetMessages(): void {
  resetErrors()
  formError.value = null
  formSuccess.value = null
}

function getErrorLabel(errorKey: string): string | undefined {
  return errorKey ? t(errorKey) : undefined
}

function getAnswerError(answer: Answer): string | undefined {
  if (!errors.answers || answer.response.trim()) {
    return undefined
  }

  return t('questions.form.errors.answerRequired')
}

function validateForm(): boolean {
  resetErrors()

  if (form.themeIds.length === 0) {
    errors.themeIds = 'questions.form.errors.themeRequired'
  }

  if (!form.question.trim()) {
    errors.question = 'questions.form.errors.questionRequired'
  }

  if (form.answers.length < 2) {
    errors.answers = 'questions.form.errors.answersMinRequired'
  }

  if (form.answers.some((answer) => !answer.response.trim())) {
    errors.answers = 'questions.form.errors.answerRequired'
  }

  if (form.answers.filter((answer) => answer.isCorrect).length < 1) {
    errors.answers = 'questions.form.errors.oneCorrectRequired'
  }

  // Règles du type de question (vrai/faux, estimation), les mêmes que l'API et le moteur.
  const kindError = errors.answers ? null : getQuestionKindAnswersError(form.kind, form.answers)

  if (kindError) {
    errors.answers =
      kindError === QUESTION_KIND_ANSWERS_ERROR_TRUE_FALSE
        ? 'questions.form.errors.trueFalseAnswers'
        : 'questions.form.errors.estimateAnswers'
  }

  // Vrai/faux et estimation : le moteur ne tire que les questions texte ou image.
  if (getQuestionKindMediaError(form.kind, form.typeMedia)) {
    errors.typeMedia = 'questions.form.errors.kindMediaInvalid'
  }

  if (isAudio.value && form.audio.file && form.audio.measuring) {
    errors.audio = 'questions.form.audio.errors.measuring'
  } else if (isAudio.value && form.audio.file && !form.audio.rightsAttested) {
    errors.audio = 'questions.form.audio.errors.rightsRequired'
  }

  return (
    !errors.themeIds && !errors.question && !errors.answers && !errors.typeMedia && !errors.audio
  )
}

function addAnswer(): void {
  form.answers.push({
    response: '',
    isCorrect: false,
  })
}

function removeAnswer(index: number): void {
  form.answers.splice(index, 1)

  if (!form.answers.some((answer) => answer.isCorrect) && form.answers[0]) {
    form.answers[0].isCorrect = true
  }
}

function toggleCorrect(index: number): void {
  const answer = form.answers[index]

  if (answer) {
    answer.isCorrect = !answer.isCorrect
  }
}

function buildPayload(): QuestionPayload {
  const payload: QuestionPayload = {
    themeIds: form.themeIds,
    question: form.question.trim(),
    kind: form.kind,
    typeMedia: form.typeMedia,
    mediaUrl:
      form.typeMedia === QUESTION_MEDIA_TYPE_NONE || isAudio.value
        ? null
        : form.mediaUrl.trim() || null,
    answers: form.answers.map((answer) => ({
      id: answer.id,
      response: answer.response.trim(),
      isCorrect: answer.isCorrect,
    })),
  }

  if (props.mode === 'edit') {
    payload.status = form.status
  }

  return payload
}

/**
 * Le fichier audio passe par ses propres routes, une fois la question enregistrée : upload ou
 * retrait, puis point de départ (validé par l'API par rapport à la durée du fichier).
 */
async function applyAudioChanges(question: Question): Promise<Question> {
  if (!isAudio.value) {
    return question
  }

  let current = question

  if (form.audio.file) {
    current = await uploadQuestionMediaService(current.id, {
      file: form.audio.file,
      durationMs: form.audio.durationMs,
      rightsAttested: form.audio.rightsAttested,
    })
    form.audio = { ...createAudioState(form.audio.startMs) }
  } else if (form.audio.removeExisting && current.mediaFile) {
    current = await deleteQuestionMediaService(current.id)
    form.audio = createAudioState()
  }

  savedQuestion.value = current

  if (current.mediaFile && form.audio.startMs !== (current.mediaStartMs ?? 0)) {
    try {
      current = await updateQuestionService(current.id, { mediaStartMs: form.audio.startMs })
    } catch {
      throw new QuestionStartPointError()
    }

    savedQuestion.value = current
  }

  return current
}

/** Le fichier est enregistré, seul le point de départ a été refusé. */
class QuestionStartPointError extends Error {}

function getAudioErrorMessage(error: unknown): string {
  if (error instanceof QuestionStartPointError) {
    return t('questions.form.audio.errors.startFailed')
  }

  const code = error instanceof QuestionMediaError ? error.code : 'server_error'

  return t('questions.form.audio.errors.uploadFailed', {
    reason: t(`questions.form.audio.apiErrors.${code}`),
  })
}

async function submitForm(): Promise<void> {
  if (saving.value) {
    return
  }

  resetMessages()

  if (!validateForm()) {
    return
  }

  saving.value = true

  let question: Question

  try {
    question = savedQuestion.value
      ? await updateQuestionService(savedQuestion.value.id, buildPayload())
      : await createQuestionService(buildPayload())

    savedQuestion.value = question
  } catch {
    formError.value = t('questions.errors.saveFailed')
    emit('error', 'saveFailed')
    saving.value = false
    return
  }

  try {
    question = await applyAudioChanges(question)

    formSuccess.value =
      props.mode === 'edit' ? t('questions.success.update') : t('questions.success.create')

    emit('saved', question)
  } catch (error) {
    // La question est enregistrée, seul l'extrait a échoué : on reste sur le formulaire.
    formError.value = getAudioErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.question-form {
  display: grid;
  gap: 16px;
}

.question-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.question-form__answers {
  display: grid;
  gap: 12px;
}

.question-form__answers-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.question-form__answers-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.question-form__answers-header h3 {
  margin: 0;
  color: var(--text-0);
  font-size: 15px;
  font-weight: 900;
}

.question-form__answer-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: end;
}

.question-form__answer-field {
  min-width: 0;
}

.question-form__correct {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.question-form__correct input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.question-form__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 820px) {
  .theme-picker__header,
  .question-form__answers-header {
    flex-direction: column;
    align-items: stretch;
  }

  .theme-picker__search {
    max-width: none;
  }

  .question-form__grid,
  .question-form__answer-row {
    grid-template-columns: 1fr;
  }

  .question-form__correct {
    min-height: auto;
  }
}
</style>
