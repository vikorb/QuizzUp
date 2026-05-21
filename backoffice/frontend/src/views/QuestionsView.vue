<template>
  <SectionLayout :title="$t('questions.title')" :subtitle="$t('questions.subtitle')">
    <QuestionsToolBar
      v-model="searchQuery"
      v-model:theme-filter="themeFilter"
      v-model:status-filter="statusFilter"
      v-model:type-media-filter="typeMediaFilter"
      v-model:scope-filter="scopeFilter"
      :themes="themes"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <QuestionsTable
      :questions="filteredQuestions"
      :loading="loading"
      :error="error"
      @retry="loadPage"
      @edit="goToEdit"
      @updated="handleQuestionUpdated"
      @deleted="handleDeleted"
      @error="handleActionError"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import {
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import {
  listQuestionsService,
  listThemesService,
} from '@/services/questionsService'
import type { ActionBanner } from '@/types/banner'
import type { Question, Theme } from '@/types/question'
import {
  createErrorBanner,
  createSuccessBanner,
  getBannerMessage,
  getBannerVariant,
} from '@/utils/banner'

import QuestionsTable from './questions/QuestionsTable.vue'
import QuestionsToolBar from './questions/QuestionsToolbar.vue'

const { t } = useI18n()
const router = useRouter()

const questions = ref<Question[]>([])
const themes = ref<Theme[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const searchQuery = ref('')
const themeFilter = ref('')
const statusFilter = ref('')
const typeMediaFilter = ref('')
const scopeFilter = ref('')

const filteredQuestions = computed(() => {
  return questions.value.filter((question) => {
    return (
      matchesSearch(question) &&
      matchesTheme(question) &&
      matchesStatus(question) &&
      matchesTypeMedia(question) &&
      matchesScope(question)
    )
  })
})

function clearActionBanner(): void {
  actionBanner.value = null
}

function matchesSearch(question: Question): boolean {
  const search = searchQuery.value.trim().toLowerCase()

  if (!search) {
    return true
  }

  return [
    question.question,
    question.themeName,
    question.typeMedia,
    question.scope,
    getQuestionStatusLabel(question.status),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search))
}

function matchesTheme(question: Question): boolean {
  if (!themeFilter.value) {
    return true
  }

  return String(question.themeId) === themeFilter.value
}

function matchesStatus(question: Question): boolean {
  if (!statusFilter.value) {
    return question.status !== QUESTION_STATUS_DELETED
  }

  return String(question.status) === statusFilter.value
}

function matchesTypeMedia(question: Question): boolean {
  if (!typeMediaFilter.value) {
    return true
  }

  return question.typeMedia === typeMediaFilter.value
}

function matchesScope(question: Question): boolean {
  if (!scopeFilter.value) {
    return true
  }

  return question.scope === scopeFilter.value
}

function getQuestionStatusLabel(status: number): string {
  if (status === QUESTION_STATUS_ACTIVE) {
    return 'active'
  }

  if (status === QUESTION_STATUS_INACTIVE) {
    return 'inactive'
  }

  if (status === QUESTION_STATUS_DRAFT) {
    return 'draft'
  }

  return 'deleted'
}

function getQuestionName(question: Question): string {
  return question.question || `#${question.id}`
}

async function loadThemes(): Promise<void> {
  themes.value = await listThemesService()
}

async function loadQuestions(): Promise<void> {
  questions.value = await listQuestionsService()
}

async function loadPage(): Promise<void> {
  loading.value = true
  error.value = null
  clearActionBanner()

  try {
    await Promise.all([loadThemes(), loadQuestions()])
  } catch {
    error.value = 'serverError'
    questions.value = []
  } finally {
    loading.value = false
  }
}

function goToEdit(questionId: number): void {
  void router.push({
    name: 'questions-edit',
    params: {
      questionId: String(questionId),
    },
  })
}

function handleQuestionUpdated(updatedQuestion: Question): void {
  clearActionBanner()

  questions.value = questions.value.map((question) =>
    question.id === updatedQuestion.id ? updatedQuestion : question,
  )

  actionBanner.value = createSuccessBanner('questionUpdated', {
    question: getQuestionName(updatedQuestion),
  })
}

function handleDeleted(questionId: number): void {
  clearActionBanner()

  const deletedQuestion = questions.value.find((question) => question.id === questionId)

  questions.value = questions.value.filter((question) => question.id !== questionId)

  actionBanner.value = createSuccessBanner('questionDeleted', {
    question: deletedQuestion?.question ?? `#${questionId}`,
  })
}

function handleActionError(errorCode: string): void {
  actionBanner.value = createErrorBanner(errorCode)
}

onMounted(loadPage)
</script>
