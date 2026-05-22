<template>
  <BaseCard
    :title="$t('themes.questions.title')"
    :subtitle="$t('themes.questions.subtitle')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    error-namespace="themes.questions.errors"
    class="theme-questions-card"
  >
    <div class="questions-manager">
      <div class="questions-manager__header">
        <div>
          <h3 class="questions-manager__title">
            {{ $t('themes.questions.addTitle') }}
          </h3>
          <p class="questions-manager__description">
            {{ $t('themes.questions.addDescription') }}
          </p>
        </div>

        <UiButton
          variant="primary"
          type="button"
          :disabled="!canEdit"
          @click="goToCreateQuestion"
        >
          <MdIcon :path="mdiPlus" :size="18" />
          {{ $t('themes.questions.createQuestion') }}
        </UiButton>
      </div>

      <div class="questions-manager__search">
        <FormField
          v-model="searchQuery"
          name="theme-question-search"
          :label="$t('themes.questions.searchLabel')"
          :placeholder="$t('themes.questions.searchPlaceholder')"
          :disabled="loading || !canEdit"
          autocomplete="off"
          inputmode="search"
        />
      </div>

      <div v-if="canEdit && searchQuery.trim()" class="questions-manager__results">
        <div
          v-for="question in availableQuestions"
          :key="question.id"
          class="question-result"
        >
          <div class="question-result__content">
            <span class="question-result__title">
              {{ question.question }}
            </span>

            <div class="question-result__meta">
              <span class="pill">
                {{ getMediaTypeLabel(question.typeMedia) }}
              </span>

              <span class="pill" :class="getStatusClass(question.status)">
                {{ getStatusLabel(question.status) }}
              </span>

              <span
                v-if="getQuestionThemeIds(question).length > 0"
                class="pill pill--warning"
              >
                {{ $t('themes.questions.fromAnotherTheme') }}
              </span>
            </div>
          </div>

          <UiButton
            variant="default"
            type="button"
            :disabled="busyQuestionId === question.id"
            @click="attachQuestion(question)"
          >
            {{ $t('themes.questions.add') }}
          </UiButton>
        </div>

        <p v-if="availableQuestions.length === 0" class="questions-manager__empty">
          {{ $t('themes.questions.noAvailableQuestion') }}
        </p>
      </div>

      <BaseBanner
        :variant="actionBannerVariant"
        :message="actionBannerMessage"
        @dismiss="clearActionBanner"
      />

      <div class="linked-questions">
        <div class="linked-questions__header">
          <div>
            <h3 class="linked-questions__title">
              {{ $t('themes.questions.linkedTitle') }}
            </h3>
            <p class="linked-questions__count">
              {{ linkedQuestions.length }}
              {{ $t('themes.questions.linkedCount') }}
            </p>
          </div>
        </div>

        <div class="linked-questions__table-wrapper">
          <table class="linked-questions__table">
            <thead>
              <tr>
                <th>{{ $t('themes.questions.table.question') }}</th>
                <th>{{ $t('themes.questions.table.media') }}</th>
                <th>{{ $t('themes.questions.table.status') }}</th>
                <th class="linked-questions__actions-cell">
                  {{ $t('themes.questions.table.actions') }}
                </th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="question in linkedQuestions" :key="question.id">
                <td>
                  <button
                    class="question-link"
                    type="button"
                    @click="goToQuestion(question.id)"
                  >
                    {{ question.question }}
                  </button>
                </td>

                <td>
                  <span class="pill">
                    {{ getMediaTypeLabel(question.typeMedia) }}
                  </span>
                </td>

                <td>
                  <span class="pill" :class="getStatusClass(question.status)">
                    {{ getStatusLabel(question.status) }}
                  </span>
                </td>

                <td>
                  <div class="linked-questions__actions">
                    <QuestionsTableActionsSwitch
                      :question="question"
                      :disabled="!canEdit || busyQuestionId === question.id"
                      @updated="handleQuestionUpdated"
                      @error="handleActionError"
                    />

                    <UiButton
                      variant="icon"
                      type="button"
                      :title="$t('themes.questions.openQuestion')"
                      :aria-label="$t('themes.questions.openQuestion')"
                      @click="goToQuestion(question.id)"
                    >
                      <MdIcon :path="mdiOpenInNew" :size="18" />
                    </UiButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <p v-if="linkedQuestions.length === 0 && !loading" class="linked-questions__empty">
            {{ $t('themes.questions.noLinkedQuestion') }}
          </p>
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiOpenInNew, mdiPlus } from '@mdi/js'
import {
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  attachQuestionToThemeService,
  listQuestionsService,
} from '@/services/questionsService'
import type { ActionBanner } from '@/types/banner'
import type { Question } from '@/types/question'
import {
  createErrorBanner,
  createSuccessBanner,
  getBannerMessage,
  getBannerVariant,
} from '@/utils/banner'
import QuestionsTableActionsSwitch from '@/views/questions/table/QuestionsTableActionsSwitch.vue'

const props = defineProps<{
  themeId: number
  canEdit: boolean
}>()

const { t } = useI18n()
const router = useRouter()

const questions = ref<Question[]>([])
const searchQuery = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const busyQuestionId = ref<number | null>(null)

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const linkedQuestions = computed(() =>
  questions.value
    .filter((question) => isLinkedToCurrentTheme(question))
    .filter((question) => question.status !== QUESTION_STATUS_DELETED),
)

const availableQuestions = computed(() => {
  const search = searchQuery.value.trim().toLowerCase()

  if (!search) {
    return []
  }

  return questions.value
    .filter((question) => question.status !== QUESTION_STATUS_DELETED)
    .filter((question) => !isLinkedToCurrentTheme(question))
    .filter((question) => question.question.toLowerCase().includes(search))
    .slice(0, 8)
})

function getQuestionThemeIds(question: Question): number[] {
  if (Array.isArray(question.themeIds) && question.themeIds.length > 0) {
    return question.themeIds.map(Number).filter(Number.isFinite)
  }

  return question.themeId !== null && question.themeId !== undefined
    ? [Number(question.themeId)]
    : []
}

function isLinkedToCurrentTheme(question: Question): boolean {
  return getQuestionThemeIds(question).some(
    (themeId) => String(themeId) === String(props.themeId),
  )
}

function clearActionBanner(): void {
  actionBanner.value = null
}

async function loadQuestions(): Promise<void> {
  loading.value = true
  error.value = null
  clearActionBanner()

  try {
    questions.value = await listQuestionsService()
  } catch {
    error.value = 'serverError'
    questions.value = []
  } finally {
    loading.value = false
  }
}

async function attachQuestion(question: Question): Promise<void> {
  if (!props.canEdit || busyQuestionId.value !== null) {
    return
  }

  busyQuestionId.value = question.id
  clearActionBanner()

  try {
    const result = await attachQuestionToThemeService(question.id, props.themeId)

    if (!result.ok) {
      actionBanner.value = createErrorBanner(result.error)
      return
    }

    const updatedQuestion = result.data.question

    if (!updatedQuestion) {
      actionBanner.value = createErrorBanner('serverError')
      return
    }

    handleQuestionUpdated(updatedQuestion)

    actionBanner.value = createSuccessBanner('questionAttached', {
      question: updatedQuestion.question,
    })

    searchQuery.value = ''
  } catch {
    actionBanner.value = createErrorBanner('serverError')
  } finally {
    busyQuestionId.value = null
  }
}

function handleQuestionUpdated(updatedQuestion: Question): void {
  const exists = questions.value.some(
    (question) => String(question.id) === String(updatedQuestion.id),
  )

  if (!exists) {
    questions.value = [updatedQuestion, ...questions.value]
    return
  }

  questions.value = questions.value.map((question) =>
    String(question.id) === String(updatedQuestion.id) ? updatedQuestion : question,
  )
}

function handleActionError(errorCode: string): void {
  actionBanner.value = createErrorBanner(errorCode)
}

function goToQuestion(questionId: number): void {
  void router.push({
    name: 'questions-edit',
    params: {
      questionId: String(questionId),
    },
  })
}

function goToCreateQuestion(): void {
  void router.push({
    name: 'questions-create',
    query: {
      themeId: String(props.themeId),
    },
  })
}

function getMediaTypeLabel(typeMedia: string): string {
  if (typeMedia === QUESTION_MEDIA_TYPE_IMAGE) {
    return t('questions.media.image')
  }

  if (typeMedia === QUESTION_MEDIA_TYPE_AUDIO) {
    return t('questions.media.audio')
  }

  if (typeMedia === QUESTION_MEDIA_TYPE_VIDEO) {
    return t('questions.media.video')
  }

  if (typeMedia === QUESTION_MEDIA_TYPE_NONE) {
    return t('questions.media.none')
  }

  return typeMedia
}

function getStatusLabel(status: number): string {
  if (status === QUESTION_STATUS_ACTIVE) {
    return t('questions.status.active')
  }

  if (status === QUESTION_STATUS_INACTIVE) {
    return t('questions.status.inactive')
  }

  if (status === QUESTION_STATUS_DRAFT) {
    return t('questions.status.draft')
  }

  return t('questions.status.deleted')
}

function getStatusClass(status: number): string {
  if (status === QUESTION_STATUS_ACTIVE) {
    return 'pill--active'
  }

  if (status === QUESTION_STATUS_INACTIVE) {
    return 'pill--inactive'
  }

  if (status === QUESTION_STATUS_DRAFT) {
    return 'pill--draft'
  }

  return 'pill--deleted'
}

watch(
  () => props.themeId,
  () => {
    void loadQuestions()
  },
)

onMounted(loadQuestions)
</script>

<style scoped>
.theme-questions-card {
  scroll-margin-top: 90px;
}

.questions-manager {
  display: grid;
  gap: 18px;
}

.questions-manager__header,
.linked-questions__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.questions-manager__title,
.linked-questions__title {
  margin: 0;
  color: var(--text-1);
  font-size: 18px;
  font-weight: 900;
}

.questions-manager__description,
.linked-questions__count {
  margin: 6px 0 0;
  color: var(--text-2);
  font-size: 13px;
}

.questions-manager__search {
  max-width: 620px;
}

.questions-manager__results {
  display: grid;
  gap: 10px;
}

.question-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(10, 14, 28, 0.72);
}

.question-result__content {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.question-result__title {
  overflow: hidden;
  color: var(--text-1);
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.question-result__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.questions-manager__empty,
.linked-questions__empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  color: var(--text-2);
  text-align: center;
}

.linked-questions {
  display: grid;
  gap: 12px;
}

.linked-questions__table-wrapper {
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
}

.linked-questions__table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.linked-questions__table th,
.linked-questions__table td {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  text-align: left;
  vertical-align: middle;
}

.linked-questions__table th {
  color: var(--text-2);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.linked-questions__table tr:last-child td {
  border-bottom: 0;
}

.linked-questions__actions-cell {
  width: 150px;
  text-align: right;
}

.linked-questions__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.question-link {
  max-width: 520px;
  padding: 0;
  border: 0;
  color: var(--text-1);
  background: transparent;
  font: inherit;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.question-link:hover {
  color: var(--primary);
  text-decoration: underline;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 800;
}

.pill--active {
  color: #7dffb2;
  background: rgba(45, 255, 137, 0.12);
}

.pill--inactive {
  color: #ffd36e;
  background: rgba(255, 190, 70, 0.12);
}

.pill--draft {
  color: #a7b8ff;
  background: rgba(120, 145, 255, 0.12);
}

.pill--deleted {
  color: #ff8a8a;
  background: rgba(255, 107, 107, 0.12);
}

.pill--warning {
  color: #ffd36e;
  background: rgba(255, 190, 70, 0.12);
}

@media (max-width: 720px) {
  .questions-manager__header,
  .linked-questions__header {
    flex-direction: column;
  }

  .questions-manager__search {
    max-width: none;
  }

  .question-result {
    align-items: stretch;
    flex-direction: column;
  }

  .question-result__title {
    white-space: normal;
  }
}
</style>
