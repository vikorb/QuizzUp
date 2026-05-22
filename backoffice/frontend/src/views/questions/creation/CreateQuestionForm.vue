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

    <div class="question-form__grid">
      <SelectField
        id="question-type-media"
        v-model="form.typeMedia"
        :label="$t('questions.form.typeMedia')"
        :options="typeMediaOptions"
        :disabled="saving"
      />

      <FormField
        v-model="form.mediaUrl"
        :label="$t('questions.form.mediaUrl')"
        name="mediaUrl"
        :placeholder="$t('questions.form.mediaUrlPlaceholder')"
        :disabled="saving || form.typeMedia === QUESTION_MEDIA_TYPE_NONE"
      />
    </div>

    <section class="question-form__answers">
      <div class="question-form__answers-header">
        <h3>{{ $t('questions.form.answers') }}</h3>

        <UiButton
          type="button"
          variant="default"
          :disabled="saving"
          @click="addAnswer"
        >
          {{ $t('questions.form.addAnswer') }}
        </UiButton>
      </div>

      <p v-if="errors.answers" class="question-form__error">
        {{ $t(errors.answers) }}
      </p>

      <div
        v-for="(answer, index) in form.answers"
        :key="index"
        class="question-form__answer-row"
      >
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

        <label class="question-form__correct">
          <input
            type="radio"
            name="correct-answer"
            :checked="answer.isCorrect"
            :disabled="saving"
            @change="setCorrectAnswer(index)"
          />
          <span>{{ $t('questions.form.correctAnswer') }}</span>
        </label>

        <UiButton
          type="button"
          variant="icon"
          :disabled="saving || form.answers.length <= 2"
          :title="$t('questions.form.removeAnswer')"
          @click="removeAnswer(index)"
        >
          🗑️
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
import {
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
} from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  createQuestionService,
  updateQuestionService,
} from '@/services/questionsService'
import type { SelectFieldOption } from '@/types/form'
import type {
  Answer,
  Question,
  QuestionMediaType,
  QuestionPayload,
  Theme,
} from '@/types/question'

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
  },
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
  typeMedia: QUESTION_MEDIA_TYPE_NONE as QuestionMediaType,
  mediaUrl: '',
  answers: [
    { response: '', isCorrect: true },
    { response: '', isCorrect: false },
  ] as Answer[],
})

const errors = reactive({
  themeIds: '',
  question: '',
  answers: '',
})

const saving = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const submitLabel = computed(() =>
  props.mode === 'edit' ? t('questions.form.save') : t('questions.form.create'),
)

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

    if (!question) {
      form.themeIds = normalizeThemeIds(props.initialThemeIds)
      form.question = ''
      form.typeMedia = QUESTION_MEDIA_TYPE_NONE
      form.mediaUrl = ''
      form.answers = [
        { response: '', isCorrect: true },
        { response: '', isCorrect: false },
      ]
      return
    }

    form.themeIds = getQuestionThemeIds(question)
    form.question = question.question
    form.typeMedia = question.typeMedia
    form.mediaUrl = question.mediaUrl ?? ''
    form.answers = question.answers?.length
      ? question.answers.map((answer) => ({
          response: answer.response,
          isCorrect: answer.isCorrect,
        }))
      : [
          { response: '', isCorrect: true },
          { response: '', isCorrect: false },
        ]
  },
  { immediate: true },
)

function normalizeThemeIds(themeIds: number[]): number[] {
  const visibleThemeIds = new Set(props.themes.map((theme) => Number(theme.id)))

  return [
    ...new Set(
      themeIds
        .map(Number)
        .filter((themeId) => Number.isInteger(themeId) && themeId > 0)
        .filter((themeId) => visibleThemeIds.size === 0 || visibleThemeIds.has(themeId)),
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

  if (form.answers.filter((answer) => answer.isCorrect).length !== 1) {
    errors.answers = 'questions.form.errors.oneCorrectRequired'
  }

  return !errors.themeIds && !errors.question && !errors.answers
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

function setCorrectAnswer(index: number): void {
  form.answers = form.answers.map((answer, answerIndex) => ({
    ...answer,
    isCorrect: answerIndex === index,
  }))
}

function buildPayload(): QuestionPayload {
  return {
    themeIds: form.themeIds,
    question: form.question.trim(),
    typeMedia: form.typeMedia,
    mediaUrl:
      form.typeMedia === QUESTION_MEDIA_TYPE_NONE
        ? null
        : form.mediaUrl.trim() || null,
    answers: form.answers.map((answer) => ({
      response: answer.response.trim(),
      isCorrect: answer.isCorrect,
    })),
  }
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

  try {
    const savedQuestion =
      props.mode === 'edit' && props.question
        ? await updateQuestionService(props.question.id, buildPayload())
        : await createQuestionService(buildPayload())

    formSuccess.value =
      props.mode === 'edit'
        ? t('questions.success.update')
        : t('questions.success.create')

    emit('saved', savedQuestion)
  } catch {
    formError.value = t('questions.errors.saveFailed')
    emit('error', 'saveFailed')
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
  color: #ff8a8a;
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
