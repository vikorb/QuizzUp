<template>
  <BaseCard
    :title="$t('themes.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="tableItems.length === 0"
    :loading-label="$t('themes.table.loading')"
    :empty-label="$t('themes.table.empty')"
    error-namespace="themes.errors"
    class="themes-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="emit('retry')">
        {{ $t('themes.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-name="{ item, value }">
        <button class="theme-name" type="button" @click="emit('open', toTheme(item).id)">
          {{ value }}
        </button>
      </template>

      <template #cell-mode="{ value }">
        {{ getModeLabel(value) }}
      </template>

      <template #cell-scope="{ value }">
        <ScopeChip :tone="getScopeTone(value)" :label="getScopeLabel(value)" />
      </template>

      <template #cell-status="{ value }">
        <StatusPill :tone="getStatusTone(value)" :label="getStatusLabel(value)" />
      </template>

      <template #cell-questionsCount="{ value }">
        <span class="questions-count">{{ getQuestionsCount(value) }}</span>
      </template>

      <template #cell-actions="{ item }">
        <ThemesTableActions
          :item="toTheme(item)"
          :current-role="currentRole"
          @open="emit('open', $event)"
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
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import ScopeChip from '@/components/ui/ScopeChip.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { authState } from '@/state/authState'
import type { Theme } from '@/types/theme'

import ThemesTableActions from './table/ThemesTableActions.vue'

type ThemeTableRow = Theme & Record<string, unknown>

const props = defineProps<{
  themes: Theme[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'open', themeId: number): void
  (event: 'updated', theme: Theme): void
  (event: 'deleted', themeId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const currentRole = computed(() => authState.me.value?.role ?? null)

const columns = computed(() => [
  { key: 'name', label: t('themes.table.columns.name') },
  { key: 'mode', label: t('themes.table.columns.mode') },
  { key: 'scope', label: t('themes.table.columns.scope') },
  { key: 'status', label: t('themes.table.columns.status') },
  { key: 'questionsCount', label: t('themes.table.columns.questions'), align: 'center' as const },
  { key: 'actions', label: t('themes.table.columns.actions'), align: 'right' as const },
])

const tableItems = computed<ThemeTableRow[]>(() => props.themes.map((theme) => ({ ...theme })))

function toTheme(item: Record<string, unknown>): ThemeTableRow {
  return item as ThemeTableRow
}

function getQuestionsCount(value: unknown): number {
  const count = Number(value)

  return Number.isFinite(count) ? count : 0
}

function getScopeLabel(scope: unknown): string {
  return scope === THEME_SCOPE_GLOBAL ? t('themes.scope.global') : t('themes.scope.company')
}

function getScopeTone(scope: unknown): 'blue' | 'violet' {
  return scope === THEME_SCOPE_GLOBAL ? 'blue' : 'violet'
}

function getModeLabel(mode: unknown): string {
  if (typeof mode !== 'string') {
    return t('themes.mode.classic')
  }

  return t(`themes.mode.${mode}`)
}

function getStatusLabel(status: unknown): string {
  if (status === THEME_STATUS_ACTIVE) {
    return t('themes.status.active')
  }

  if (status === THEME_STATUS_INACTIVE) {
    return t('themes.status.inactive')
  }

  if (status === THEME_STATUS_DRAFT) {
    return t('themes.status.draft')
  }

  return t('themes.status.deleted')
}

function getStatusTone(status: unknown): 'ok' | 'warn' | 'danger' | 'muted' {
  if (status === THEME_STATUS_ACTIVE) {
    return 'ok'
  }

  if (status === THEME_STATUS_DRAFT) {
    return 'warn'
  }

  if (status === THEME_STATUS_DELETED) {
    return 'danger'
  }

  return 'muted'
}
</script>

<style scoped>
.themes-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.theme-name {
  padding: 0;
  border: 0;
  color: var(--text-0);
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.theme-name:hover {
  text-decoration: underline;
}

.questions-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  font-weight: 800;
}

.questions-count {
  color: var(--text-1);
}
</style>
