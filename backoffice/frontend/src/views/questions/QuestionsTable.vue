<template>
  <BaseCard
    :title="$t('questions.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="tableItems.length === 0"
    :loading-label="$t('questions.table.loading')"
    :empty-label="$t('questions.table.empty')"
    error-namespace="questions.errors"
    class="questions-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="emit('retry')">
        {{ $t('questions.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-question="{ value }">
        <span class="question">{{ value }}</span>
      </template>

      <template #cell-themeName="{ item, value }">
        <RouterLink
          v-if="hasTheme(item) && hasThemeEditRoute"
          class="theme-link"
          :to="getThemeRoute(item)"
        >
          {{ value ?? $t('questions.table.unknownTheme') }}
        </RouterLink>

        <span v-else-if="hasTheme(item)" class="theme-name">
          {{ value ?? $t('questions.table.unknownTheme') }}
        </span>

        <span v-else>—</span>
      </template>

      <template #cell-scope="{ value }">
        <span class="scope" :class="getScopeClass(value)">
          {{ getScopeLabel(value) }}
        </span>
      </template>

      <template #cell-typeMedia="{ value }">
        {{ getMediaLabel(value) }}
      </template>

      <template #cell-status="{ value }">
        <span class="status" :class="getStatusClass(value)">
          {{ getStatusLabel(value) }}
        </span>
      </template>

      <template #cell-actions="{ item }">
        <QuestionsTableActions
          :item="toQuestionTableRow(item)"
          @edit="emit('edit', $event)"
          @updated="emit('updated', $event)"
          @deleted="emit('deleted', $event)"
          @error="emit('error', $event)"
        />
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import {
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUS_INACTIVE,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, RouterLink, useRouter } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Question } from '@/types/question'

import QuestionsTableActions from './table/QuestionsTableActions.vue'

type QuestionTableRow = Question & Record<string, unknown>

const props = defineProps<{
  questions: Question[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'edit', questionId: number): void
  (event: 'updated', question: Question): void
  (event: 'deleted', questionId: number): void
  (event: 'error', errorCode: string): void
}>()

const router = useRouter()
const { t } = useI18n()

const hasThemeEditRoute = computed(() => router.hasRoute('themes-edit'))

const columns = computed(() => [
  { key: 'question', label: t('questions.table.columns.question') },
  { key: 'themeName', label: t('questions.table.columns.theme') },
  { key: 'scope', label: t('questions.table.columns.scope') },
  { key: 'typeMedia', label: t('questions.table.columns.typeMedia') },
  { key: 'status', label: t('questions.table.columns.status') },
  { key: 'actions', label: t('questions.table.columns.actions') },
])

const tableItems = computed<QuestionTableRow[]>(() =>
  props.questions.map((question) => ({ ...question })),
)

function toQuestionTableRow(item: Record<string, unknown>): QuestionTableRow {
  return item as QuestionTableRow
}

function hasTheme(item: Record<string, unknown>): boolean {
  return toQuestionTableRow(item).themeId > 0
}

function getThemeRoute(item: Record<string, unknown>): RouteLocationRaw {
  const question = toQuestionTableRow(item)

  return {
    name: 'themes-edit',
    params: {
      themeId: String(question.themeId),
    },
  }
}

function getScopeLabel(scope: unknown): string {
  return scope === THEME_SCOPE_GLOBAL ? t('questions.scope.global') : t('questions.scope.company')
}

function getScopeClass(scope: unknown): string {
  return scope === THEME_SCOPE_GLOBAL ? 'scope--global' : 'scope--company'
}

function getMediaLabel(typeMedia: unknown): string {
  if (typeof typeMedia !== 'string') {
    return t('questions.media.none')
  }

  return t(`questions.media.${typeMedia}`)
}

function getStatusLabel(status: unknown): string {
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

function getStatusClass(status: unknown): string {
  if (status === QUESTION_STATUS_ACTIVE) {
    return 'status--active'
  }

  if (status === QUESTION_STATUS_INACTIVE) {
    return 'status--inactive'
  }

  if (status === QUESTION_STATUS_DRAFT) {
    return 'status--draft'
  }

  if (status === QUESTION_STATUS_DELETED) {
    return 'status--deleted'
  }

  return 'status--unknown'
}
</script>

<style scoped>
.questions-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.question {
  font-weight: 800;
  color: var(--text-0);
}

.theme-link,
.theme-name {
  color: var(--primary);
  font-weight: 800;
  text-decoration: none;
}

.scope,
.status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.scope--global {
  color: #91c7ff;
  background: rgba(80, 160, 255, 0.12);
}

.scope--company {
  color: #d6a6ff;
  background: rgba(190, 100, 255, 0.12);
}

.status--inactive {
  color: #ffd36e;
  background: rgba(255, 190, 70, 0.12);
}

.status--active {
  color: #7dffb2;
  background: rgba(45, 255, 137, 0.12);
}

.status--deleted {
  color: #ff8a8a;
  background: rgba(255, 107, 107, 0.12);
}

.status--draft {
  color: #a7b8ff;
  background: rgba(120, 145, 255, 0.12);
}

.status--unknown {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.08);
}
</style>
