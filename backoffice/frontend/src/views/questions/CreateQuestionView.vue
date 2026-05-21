<template>
  <SectionLayout :title="title" :subtitle="subtitle">
    <BaseCard
      :title="cardTitle"
      :neon="true"
      :no-hover="true"
      class="question-form-card"
      :loading="loading"
      :error="error"
      error-namespace="questions.errors"
    >
      <CreateQuestionForm
        v-if="!loading"
        :question="question"
        :themes="themes"
        :mode="mode"
        @saved="goBack"
        @cancel="goBack"
        @error="error = $event"
      />
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import {
  listThemesService,
  loadQuestionService,
} from '@/services/questionsService'
import type { Question, Theme } from '@/types/question'

import CreateQuestionForm from './creation/CreateQuestionForm.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const themes = ref<Theme[]>([])
const question = ref<Question | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const questionId = computed(() => {
  const rawQuestionId = route.params.questionId
  const value = Array.isArray(rawQuestionId) ? rawQuestionId[0] : rawQuestionId
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})

const mode = computed(() => (questionId.value === null ? 'create' : 'edit'))

const title = computed(() =>
  mode.value === 'edit' ? t('questions.edit.title') : t('questions.create.title'),
)

const subtitle = computed(() =>
  mode.value === 'edit' ? t('questions.edit.subtitle') : t('questions.create.subtitle'),
)

const cardTitle = computed(() =>
  mode.value === 'edit' ? t('questions.edit.cardTitle') : t('questions.create.cardTitle'),
)

async function loadPage(): Promise<void> {
  loading.value = true
  error.value = null

  try {
    themes.value = await listThemesService()

    if (mode.value === 'edit' && questionId.value !== null) {
      question.value = await loadQuestionService(questionId.value)
    }
  } catch {
    error.value = 'serverError'
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  void router.push({ name: 'questions' })
}

onMounted(loadPage)
</script>

<style scoped>
.question-form-card {
  margin-top: 10px;
}
</style>
