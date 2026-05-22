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

      <template #cell-themes="{ item }">
        <div v-if="getQuestionThemes(item).length" class="theme-list">
          <RouterLink
            v-for="theme in getVisibleQuestionThemes(item)"
            :key="theme.id"
            class="theme-chip"
            :to="getThemeRoute(theme.id)"
          >
            <span class="theme-chip__name">{{ theme.name }}</span>
            <span class="theme-chip__meta">{{ getThemeModeLabel(theme.mode) }}</span>
          </RouterLink>

          <button
            v-if="getHiddenThemesCount(item) > 0 || isQuestionThemesExpanded(item)"
            class="theme-more"
            type="button"
            @click.stop="toggleQuestionThemes(item)"
          >
            {{ getThemesToggleLabel(item) }}
          </button>
        </div>

        <span v-else class="theme-empty">
          {{ $t('questions.table.noTheme') }}
        </span>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, RouterLink } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Question, Theme } from '@/types/question'

import QuestionsTableActions from './table/QuestionsTableActions.vue'

type QuestionTableRow = Question & Record<string, unknown>

const props = defineProps<{
  questions: Question[]
  themes: Theme[]
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

const { t } = useI18n()

const columns = computed(() => [
  { key: 'question', label: t('questions.table.columns.question') },
  { key: 'themes', label: t('questions.table.columns.themes') },
  { key: 'scope', label: t('questions.table.columns.scope') },
  { key: 'typeMedia', label: t('questions.table.columns.typeMedia') },
  { key: 'status', label: t('questions.table.columns.status') },
  { key: 'actions', label: t('questions.table.columns.actions') },
])

const tableItems = computed<QuestionTableRow[]>(() =>
  props.questions.map((question) => ({ ...question })),
)

const THEME_VISIBLE_LIMIT = 3

const expandedThemeQuestionIds = ref<Set<number>>(new Set())

function getQuestionId(item: Record<string, unknown>): number | null {
  const questionId = Number(toQuestionTableRow(item).id)

  return Number.isFinite(questionId) ? questionId : null
}

function isQuestionThemesExpanded(item: Record<string, unknown>): boolean {
  const questionId = getQuestionId(item)

  return questionId !== null && expandedThemeQuestionIds.value.has(questionId)
}

function getVisibleQuestionThemes(item: Record<string, unknown>): Theme[] {
  const questionThemes = getQuestionThemes(item)

  if (isQuestionThemesExpanded(item)) {
    return questionThemes
  }

  return questionThemes.slice(0, THEME_VISIBLE_LIMIT)
}

function getHiddenThemesCount(item: Record<string, unknown>): number {
  const hiddenCount = getQuestionThemes(item).length - THEME_VISIBLE_LIMIT

  return Math.max(hiddenCount, 0)
}

function toggleQuestionThemes(item: Record<string, unknown>): void {
  const questionId = getQuestionId(item)

  if (questionId === null) {
    return
  }

  const nextExpandedIds = new Set(expandedThemeQuestionIds.value)

  if (nextExpandedIds.has(questionId)) {
    nextExpandedIds.delete(questionId)
  } else {
    nextExpandedIds.add(questionId)
  }

  expandedThemeQuestionIds.value = nextExpandedIds
}

function getThemesToggleLabel(item: Record<string, unknown>): string {
  if (isQuestionThemesExpanded(item)) {
    return 'Réduire'
  }

  return `Afficher +${getHiddenThemesCount(item)}`
}

function toQuestionTableRow(item: Record<string, unknown>): QuestionTableRow {
  return item as QuestionTableRow
}

function getQuestionThemes(item: Record<string, unknown>): Theme[] {
  const question = toQuestionTableRow(item)

  if (Array.isArray(question.themes) && question.themes.length > 0) {
    return question.themes
  }

  const rawThemeIds =
    question.themeIds ??
    question.theme_ids ??
    question.themeId ??
    question.theme_id

  const themeIds = toThemeIds(rawThemeIds)

  if (themeIds.length > 0) {
    return props.themes.filter((theme) => themeIds.includes(Number(theme.id)))
  }

  if (question.themeName) {
    return [
      {
        id: Number(question.themeId ?? question.theme_id ?? 0),
        adminId: 0,
        companyId: question.companyId,
        scope: question.themeScope ?? question.scope,
        name: String(question.themeName),
        mode: (question.themeMode ?? 'classic') as Theme['mode'],
        status: 1,
      },
    ]
  }

  return []
}

function toThemeIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite)
  }

  if (value !== null && value !== undefined && value !== '') {
    const themeId = Number(value)

    return Number.isFinite(themeId) ? [themeId] : []
  }

  return []
}

function getThemeRoute(themeId: number): RouteLocationRaw {
  return {
    name: 'themes-edit',
    params: {
      themeId: String(themeId),
    },
  }
}

function getThemeModeLabel(mode: string): string {
  return t(`questions.themeModes.${mode}`)
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
  color: var(--text-0);
  font-weight: 800;
}

.theme-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  max-width: 420px;
}

.theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  color: var(--text-1);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
    rgba(12, 18, 34, 0.75);
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.theme-chip:hover {
  border-color: rgba(120, 170, 255, 0.45);
  color: var(--primary);
  transform: translateY(-1px);
}

.theme-chip__name {
  overflow: hidden;
  max-width: 170px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-chip__meta {
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.08);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.theme-empty {
  color: var(--text-2);
  font-size: 13px;
  font-weight: 700;
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

.theme-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 11px;
  border: 1px solid rgba(120, 170, 255, 0.28);
  border-radius: 999px;
  color: var(--primary);
  background:
    linear-gradient(135deg, rgba(120, 170, 255, 0.16), rgba(120, 170, 255, 0.05)),
    rgba(12, 18, 34, 0.9);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.theme-more:hover {
  border-color: rgba(120, 170, 255, 0.55);
  background:
    linear-gradient(135deg, rgba(120, 170, 255, 0.24), rgba(120, 170, 255, 0.08)),
    rgba(12, 18, 34, 0.95);
  color: var(--text-0);
  transform: translateY(-1px);
}

.theme-more:focus-visible {
  outline: 2px solid rgba(120, 170, 255, 0.55);
  outline-offset: 2px;
}
</style>
