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
        <span class="scope" :class="getScopeClass(value)">
          {{ getScopeLabel(value) }}
        </span>
      </template>

      <template #cell-status="{ value }">
        <span class="status" :class="getStatusClass(value)">
          {{ getStatusLabel(value) }}
        </span>
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
  { key: 'actions', label: t('themes.table.columns.actions') },
])

const tableItems = computed<ThemeTableRow[]>(() =>
  props.themes.map((theme) => ({ ...theme })),
)

function toTheme(item: Record<string, unknown>): ThemeTableRow {
  return item as ThemeTableRow
}

function getScopeLabel(scope: unknown): string {
  return scope === THEME_SCOPE_GLOBAL ? t('themes.scope.global') : t('themes.scope.company')
}

function getScopeClass(scope: unknown): string {
  return scope === THEME_SCOPE_GLOBAL ? 'scope--global' : 'scope--company'
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

function getStatusClass(status: unknown): string {
  if (status === THEME_STATUS_ACTIVE) {
    return 'status--active'
  }

  if (status === THEME_STATUS_INACTIVE) {
    return 'status--inactive'
  }

  if (status === THEME_STATUS_DRAFT) {
    return 'status--draft'
  }

  if (status === THEME_STATUS_DELETED) {
    return 'status--deleted'
  }

  return 'status--unknown'
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
  color: var(--primary);
  background: transparent;
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

.theme-name:hover {
  text-decoration: underline;
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
